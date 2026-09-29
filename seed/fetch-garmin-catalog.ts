import { writeFile } from 'node:fs/promises';

const BASE = 'https://connect.garmin.com';
const VIDEO_BASE = 'https://connectvideo.garmin.com';

// The 4 Garmin exercise catalogs.
const CATALOGS = ['Exercises.json', 'Mobility.json', 'Yoga.json', 'Pilates.json'] as const;
type CatalogName = (typeof CATALOGS)[number];

// Fixed output order for the (possibly multiple) disciplines a code belongs to.
const DISCIPLINE_ORDER = ['forca', 'cardio', 'corrida', 'bicicleta', 'aquecimento', 'mobilidade', 'yoga', 'pilates'] as const;

const CONCURRENCY = 10;

interface MasterIndex {
  categories: Record<string, { exercises: Record<string, { primaryMuscles: string[]; secondaryMuscles: string[] }> }>;
}

interface ExerciseDetail {
  heroImage: string | null;
  videos?: { thumbnail: string | null; video: string | null }[] | null;
  exerciseSteps?: { instructions: string }[] | null;
  difficulty?: string | null;
  equipment?: string | null;
  description?: string | null;
}

interface ExerciseRecord {
  code: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  /** Category names this code was seen under, grouped by the catalog they came from. */
  categoriesByCatalog: Map<CatalogName, Set<string>>;
  /** All (categoryName) candidates this code was seen under, across all catalogs it appears in. */
  categories: Set<string>;
}

async function main() {
  console.log('Fetching the 4 master exercise catalogs...');
  const byCode = new Map<string, ExerciseRecord>();

  for (const catalogName of CATALOGS) {
    const index: MasterIndex = await fetchJson(`${BASE}/web-data/exercises/${catalogName}`);
    for (const [categoryName, category] of Object.entries(index.categories)) {
      for (const [code, info] of Object.entries(category.exercises)) {
        let record = byCode.get(code);
        if (!record) {
          record = {
            code,
            primaryMuscles: info.primaryMuscles ?? [],
            secondaryMuscles: info.secondaryMuscles ?? [],
            categoriesByCatalog: new Map(),
            categories: new Set(),
          };
          byCode.set(code, record);
        }
        record.categories.add(categoryName);
        let catalogCategories = record.categoriesByCatalog.get(catalogName);
        if (!catalogCategories) {
          catalogCategories = new Set();
          record.categoriesByCatalog.set(catalogName, catalogCategories);
        }
        catalogCategories.add(categoryName);
      }
    }
  }
  console.log(`Found ${byCode.size} unique exercise codes across ${CATALOGS.length} catalogs.`);

  console.log('Fetching pt-BR name translations...');
  const propertiesText = await fetchText(`${BASE}/web-translations/exercise_types/exercise_types_pt-BR.properties`);
  const names = parseProperties(propertiesText);

  const statements: string[] = [];
  let skippedNoName = 0;
  let withImage = 0;
  let withVideo = 0;
  let withSteps = 0;
  let withMultipleDisciplines = 0;
  const disciplineCounts = new Map<string, number>();

  const entries = Array.from(byCode.values());
  let processed = 0;

  await runPool(entries, CONCURRENCY, async record => {
    const { code } = record;

    // The pt-BR properties file uses three different key shapes depending on the
    // exercise: a flat "exercise_type_<CODE>", a category-level "category_type_<CODE>",
    // or a "<CATEGORY_NAME>_<CODE>" prefix. Try all three before giving up.
    let name = names.get(`exercise_type_${code}`) ?? names.get(`category_type_${code}`);
    if (!name) {
      for (const categoryName of record.categories) {
        name = names.get(`${categoryName}_${code}`);
        if (name) break;
      }
    }
    if (!name) {
      skippedNoName++;
      processed++;
      return;
    }

    // Most exercise codes are variants that only exist as list entries — only a
    // subset per category has a detail page. The detail URL is keyed by
    // (category, code), not just code, so try every category this code was seen
    // under until one responds 200. A 404 here is normal, not a failure.
    let detail: ExerciseDetail | null = null;
    let detailCategory: string | null = null;
    for (const categoryName of record.categories) {
      try {
        detail = await fetchJson<ExerciseDetail>(`${BASE}/web-data/exercises/pt-BR/${categoryName}/${code}.json`);
        detailCategory = categoryName;
        break;
      } catch {
        // 404 for this category — try the next candidate.
      }
    }

    const muscleGroup = record.primaryMuscles[0] ?? '';
    const secondaryMuscles = record.secondaryMuscles.join(', ');
    const equipment = detail?.equipment ?? '';
    const difficulty = detail?.difficulty ?? '';
    const description = detail?.description ?? null;

    const firstVideo = detail?.videos?.find(v => v.video) ?? null;
    const videoUrl = firstVideo?.video ? `${VIDEO_BASE}${firstVideo.video}` : null;

    // Image fallback: prefer heroImage; when absent, fall back to the first video's
    // thumbnail (also served from connectvideo.garmin.com).
    let imageUrl: string | null = null;
    if (detail?.heroImage) {
      imageUrl = `${BASE}${detail.heroImage}`;
    } else {
      const thumbSource = detail?.videos?.find(v => v.thumbnail) ?? null;
      if (thumbSource?.thumbnail) imageUrl = `${VIDEO_BASE}${thumbSource.thumbnail}`;
    }

    const steps =
      detail?.exerciseSteps && detail.exerciseSteps.length > 0
        ? JSON.stringify(detail.exerciseSteps.map(s => s.instructions))
        : null;

    const disciplineList = deriveDisciplines(record.categoriesByCatalog);
    const discipline = disciplineList.join(',');
    const category = detailCategory ?? Array.from(record.categories)[0] ?? '';

    if (imageUrl) withImage++;
    if (videoUrl) withVideo++;
    if (steps) withSteps++;
    if (disciplineList.length > 1) withMultipleDisciplines++;
    for (const d of disciplineList) disciplineCounts.set(d, (disciplineCounts.get(d) ?? 0) + 1);

    statements.push(
      `INSERT INTO exercises (name, muscle_group, equipment, garmin_image_url, garmin_video_url, discipline, category, difficulty, secondary_muscles, description, steps) VALUES (${sqlString(name)}, ${sqlString(muscleGroup)}, ${sqlString(equipment)}, ${sqlString(imageUrl)}, ${sqlString(videoUrl)}, ${sqlString(discipline)}, ${sqlString(category)}, ${sqlString(difficulty)}, ${sqlString(secondaryMuscles)}, ${sqlString(description)}, ${sqlString(steps)});`
    );

    processed++;
    if (processed % 100 === 0) console.log(`Processed ${processed}/${entries.length}...`);
  });

  await writeFile(new URL('../migrations/0005_seed_exercises_v2.sql', import.meta.url), statements.join('\n') + '\n');

  console.log(`Wrote ${statements.length} exercises to migrations/0005_seed_exercises_v2.sql (${skippedNoName} skipped: no pt-BR name found).`);
  console.log(`With image: ${withImage}, with video: ${withVideo}, with steps: ${withSteps}`);
  console.log(`With more than one discipline: ${withMultipleDisciplines}`);
  console.log('Discipline distribution (counting each exercise once per discipline it belongs to):', Object.fromEntries(disciplineCounts));
}

/**
 * A code can appear in several catalogs at once (e.g. the same 202 codes are
 * published under both Yoga.json and Pilates.json), so `discipline` is
 * multi-valued: every applicable discipline is included, in DISCIPLINE_ORDER.
 */
function deriveDisciplines(categoriesByCatalog: Map<CatalogName, Set<string>>): string[] {
  const disciplines = new Set<string>();

  if (categoriesByCatalog.has('Yoga.json')) disciplines.add('yoga');
  if (categoriesByCatalog.has('Pilates.json')) disciplines.add('pilates');
  if (categoriesByCatalog.has('Mobility.json')) disciplines.add('mobilidade');

  const exercisesCategories = categoriesByCatalog.get('Exercises.json');
  if (exercisesCategories) {
    for (const category of exercisesCategories) {
      disciplines.add(deriveExercisesDiscipline(category));
    }
  }

  return DISCIPLINE_ORDER.filter(d => disciplines.has(d));
}

function deriveExercisesDiscipline(category: string): string {
  switch (category) {
    case 'RUN':
    case 'RUN_INDOOR':
      return 'corrida';
    case 'BIKE_OUTDOOR':
    case 'INDOOR_BIKE':
      return 'bicicleta';
    case 'CARDIO':
    case 'ELLIPTICAL':
    case 'STAIR_STEPPER':
    case 'LADDER':
    case 'FLOOR_CLIMB':
      return 'cardio';
    case 'WARM_UP':
      return 'aquecimento';
    default:
      return 'forca';
  }
}

/** Runs `fn` over `items` with at most `limit` concurrent in-flight calls. */
async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = items[index++];
      await fn(current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

function parseProperties(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    map.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim());
  }
  return map;
}

function sqlString(value: string | null): string {
  if (value === null) return 'NULL';
  return `'${value.replace(/'/g, "''")}'`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}

main();
