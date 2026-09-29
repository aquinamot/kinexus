import { readFile, writeFile } from 'node:fs/promises';

/**
 * Gera `docs/catalogo-garmin.md` a partir da tabela `exercises` já seedada.
 *
 * O arquivo existe para ser colado (ou anexado) no prompt quando você pede um
 * treino a uma IA: com os nomes oficiais em mãos, o exercício bate no catálogo
 * na importação e o treino nasce com imagem, vídeo e passo a passo. Escrever
 * "Ponte com faixa elástica" em vez de "Levantamento de quadril" é o que hoje
 * faz o exercício entrar avulso, sem nenhuma referência.
 *
 * Lê direto o SQL gerado pelo seed, sem banco e sem rede, então roda logo depois
 * de `npm run seed:exercises` e sempre reflete o catálogo atual.
 *
 * Uso: npx tsx scripts/generate-exercise-reference.ts
 */

const MUSCLES: Record<string, string> = {
  ABS: 'Abdominais',
  ABDUCTORS: 'Abdutores',
  ADDUCTORS: 'Adutores',
  BICEPS: 'Bíceps',
  CALVES: 'Panturrilhas',
  CHEST: 'Peitoral',
  FOREARM: 'Antebraços',
  GLUTES: 'Glúteos',
  HAMSTRINGS: 'Posteriores da coxa',
  HIPS: 'Quadris',
  LATS: 'Dorsais',
  LOWER_BACK: 'Lombar',
  OBLIQUES: 'Oblíquos',
  QUADS: 'Quadríceps',
  SHOULDERS: 'Ombros',
  TRAPS: 'Trapézio',
  TRICEPS: 'Tríceps',
};

const DISCIPLINES: Array<[string, string]> = [
  ['forca', 'Força'],
  ['cardio', 'Cardio'],
  ['corrida', 'Corrida'],
  ['bicicleta', 'Bicicleta'],
  ['aquecimento', 'Aquecimento'],
  ['mobilidade', 'Mobilidade'],
  ['yoga', 'Yoga'],
  ['pilates', 'Pilates'],
];

interface Row {
  name: string;
  muscle_group: string;
  discipline: string;
  has_video: number;
  has_image: number;
}

/** Ordem das colunas escrita pelo seed em 0005_seed_exercises_v2.sql. */
const COLUMNS = [
  'name', 'muscle_group', 'equipment', 'garmin_image_url', 'garmin_video_url',
  'discipline', 'category', 'difficulty', 'secondary_muscles', 'description', 'steps',
];

/** Quebra a lista de VALUES respeitando aspas simples escapadas como ''. */
function splitValues(tuple: string): (string | null)[] {
  const out: (string | null)[] = [];
  let i = 0;
  while (i < tuple.length) {
    while (i < tuple.length && /[\s,]/.test(tuple[i])) i++;
    if (i >= tuple.length) break;
    if (tuple[i] === "'") {
      i++;
      let value = '';
      while (i < tuple.length) {
        if (tuple[i] === "'") {
          if (tuple[i + 1] === "'") { value += "'"; i += 2; continue; }
          i++;
          break;
        }
        value += tuple[i++];
      }
      out.push(value);
    } else {
      let token = '';
      while (i < tuple.length && tuple[i] !== ',') token += tuple[i++];
      const trimmed = token.trim();
      out.push(trimmed === 'NULL' ? null : trimmed);
    }
  }
  return out;
}

async function readCatalog(): Promise<Row[]> {
  const path = new URL('../migrations/0005_seed_exercises_v2.sql', import.meta.url);
  const sql = await readFile(path, 'utf8');
  const rows: Row[] = [];

  // Por instrução, não por linha: algumas descrições da Garmin trazem quebra de
  // linha, e esses INSERT ocupam mais de uma linha física (SQL válido mesmo assim).
  for (const line of sql.split('INSERT INTO exercises ').slice(1)) {
    const open = line.indexOf('VALUES (');
    if (open === -1) continue;
    const tuple = line.slice(open + 'VALUES ('.length, line.lastIndexOf(')'));
    const values = splitValues(tuple);
    if (values.length !== COLUMNS.length) {
      throw new Error(
        `Linha com ${values.length} valores, esperava ${COLUMNS.length}.\n` +
          `open=${open} last=${line.lastIndexOf(')')} tuple=${JSON.stringify(tuple.slice(0, 80))}`
      );
    }
    const get = (c: string) => values[COLUMNS.indexOf(c)];
    rows.push({
      name: String(get('name') ?? ''),
      muscle_group: String(get('muscle_group') ?? ''),
      discipline: String(get('discipline') ?? ''),
      has_video: get('garmin_video_url') === null ? 0 : 1,
      has_image: get('garmin_image_url') === null ? 0 : 1,
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

async function main() {
  const rows = await readCatalog();
  if (rows.length === 0) throw new Error('Nenhum exercício lido. Rode `npm run seed:exercises` antes.');

  const withVideo = rows.filter(r => r.has_video).length;
  const withImage = rows.filter(r => r.has_image).length;

  const lines: string[] = [];
  lines.push('# Catálogo oficial de exercícios da Garmin (pt-BR)');
  lines.push('');
  lines.push(
    `Gerado a partir do catálogo seedado no Kinexus. ${rows.length} exercícios, ` +
      `${withImage} com imagem e ${withVideo} com vídeo demonstrativo.`
  );
  lines.push('');
  lines.push('## Para que serve');
  lines.push('');
  lines.push(
    'Ao pedir um treino a uma IA, mande junto este arquivo e peça que **use exatamente estes nomes**. ' +
      'O Kinexus casa o exercício importado com o catálogo pelo nome; quando o nome bate, o exercício ' +
      'entra com imagem, vídeo e passo a passo. Quando não bate, entra avulso e sem referência nenhuma.'
  );
  lines.push('');
  lines.push(
    'Os exercícios marcados com ▶ têm vídeo demonstrativo e passo a passo. ' +
      'Havendo duas opções equivalentes, prefira a marcada.'
  );
  lines.push('');
  lines.push(
    '> A Garmin não tem catálogo de natação. Natação e tênis ficam registrados como atividade no relógio, ' +
      'não como exercício de planilha.'
  );
  lines.push('');

  for (const [key, label] of DISCIPLINES) {
    const ofDiscipline = rows.filter(r => r.discipline.split(',').includes(key));
    if (ofDiscipline.length === 0) continue;

    const marked = ofDiscipline.filter(r => r.has_video).length;
    lines.push(`## ${label}`);
    lines.push('');
    lines.push(`${ofDiscipline.length} exercícios, ${marked} com vídeo.`);
    lines.push('');

    const byMuscle = new Map<string, Row[]>();
    for (const row of ofDiscipline) {
      const muscle = MUSCLES[row.muscle_group] ?? 'Outros';
      if (!byMuscle.has(muscle)) byMuscle.set(muscle, []);
      byMuscle.get(muscle)!.push(row);
    }

    for (const muscle of [...byMuscle.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'))) {
      lines.push(`### ${muscle}`);
      lines.push('');
      // Quem tem vídeo primeiro: é o que o usuário quer ver na hora do treino.
      const group = byMuscle.get(muscle)!.sort((a, b) => {
        if (a.has_video !== b.has_video) return b.has_video - a.has_video;
        return a.name.localeCompare(b.name, 'pt-BR');
      });
      for (const row of group) lines.push(`- ${row.has_video ? '▶ ' : ''}${row.name}`);
      lines.push('');
    }
  }

  await writeFile(new URL('../docs/catalogo-garmin.md', import.meta.url), lines.join('\n') + '\n');
  console.log(`docs/catalogo-garmin.md: ${rows.length} exercícios, ${withVideo} com vídeo.`);
}

main();
