import { writeFile } from 'node:fs/promises';

const BASE = 'https://connect.garmin.com';

interface MasterIndex {
  categories: Record<string, { exercises: Record<string, { primaryMuscles: string[]; secondaryMuscles: string[] }> }>;
}

interface ExerciseDetail {
  equipment: string;
  heroImage: string | null;
}

async function main() {
  console.log('Fetching master exercise index...');
  const index: MasterIndex = await fetchJson(`${BASE}/web-data/exercises/Exercises.json`);

  const byCode = new Map<string, { primaryMuscles: string[]; categories: Set<string> }>();
  for (const [categoryName, category] of Object.entries(index.categories)) {
    for (const [code, info] of Object.entries(category.exercises)) {
      if (!byCode.has(code)) byCode.set(code, { primaryMuscles: info.primaryMuscles, categories: new Set() });
      byCode.get(code)!.categories.add(categoryName);
    }
  }
  console.log(`Found ${byCode.size} unique exercise codes.`);

  console.log('Fetching pt-BR name translations...');
  const propertiesText = await fetchText(`${BASE}/web-translations/exercise_types/exercise_types_pt-BR.properties`);
  const names = parseProperties(propertiesText);

  const statements: string[] = [];
  let skipped = 0;

  let i = 0;
  for (const [code, info] of byCode) {
    i++;
    // The pt-BR properties file uses three different key shapes depending on the
    // exercise: a flat "exercise_type_<CODE>", a category-level "category_type_<CODE>",
    // or a "<CATEGORY_NAME>_<CODE>" prefix. Try all three before giving up.
    let name = names.get(`exercise_type_${code}`) ?? names.get(`category_type_${code}`);
    if (!name) {
      for (const categoryName of info.categories) {
        name = names.get(`${categoryName}_${code}`);
        if (name) break;
      }
    }
    if (!name) {
      skipped++;
      continue;
    }

    // Most exercise codes are variants (e.g. DIAMOND_PUSH_UP) that only exist as list
    // entries — only a small "hero" subset per category has a detail page with an
    // image. A 404 here is normal, not a failure: still seed the exercise (with a
    // display name from the pt-BR translations), just without image/equipment data.
    let detail: ExerciseDetail | null = null;
    try {
      detail = await fetchJson<ExerciseDetail>(`${BASE}/web-data/exercises/pt-BR/${code}/${code}.json`);
    } catch {
      detail = null;
    }

    const muscleGroup = info.primaryMuscles[0] ?? '';
    const imageUrl = detail?.heroImage ? `${BASE}${detail.heroImage}` : null;
    const equipment = detail?.equipment ?? '';

    statements.push(
      `INSERT INTO exercises (name, muscle_group, equipment, garmin_image_url, garmin_video_url) VALUES (${sqlString(name)}, ${sqlString(muscleGroup)}, ${sqlString(equipment)}, ${sqlString(imageUrl)}, NULL);`
    );

    if (i % 25 === 0) console.log(`Processed ${i}/${byCode.size}...`);
    await sleep(150); // be polite to Garmin's servers
  }

  await writeFile(new URL('../migrations/0003_seed_exercises.sql', import.meta.url), statements.join('\n') + '\n');
  console.log(`Wrote ${statements.length} exercises to migrations/0003_seed_exercises.sql (${skipped} skipped: no name or detail found).`);
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main();
