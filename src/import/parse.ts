export interface ParsedExercise {
  name: string;
  sets: number;
  reps: string;
}

export interface ParsedDay {
  label: string;
  focusName: string;
  exercises: ParsedExercise[];
}

export interface ParsedWorkout {
  planName: string;
  days: ParsedDay[];
}

export type ParseResult = { ok: true; workout: ParsedWorkout } | { ok: false; error: string };

export function parseWorkoutInput(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: 'Cole o conteúdo do treino antes de analisar.' };
  }

  const jsonResult = tryParseJson(trimmed);
  if (jsonResult) return jsonResult;

  const listResult = tryParseList(trimmed);
  if (listResult) return listResult;

  return {
    ok: false,
    error: 'Não consegui reconhecer o formato. Cole um JSON ou uma lista como "Nome do exercício: 4x8-10".',
  };
}

function tryParseJson(text: string): ParseResult | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }

  if (typeof data !== 'object' || data === null) {
    return { ok: false, error: 'JSON reconhecido, mas não é um objeto de treino válido.' };
  }

  const obj = data as Record<string, unknown>;
  if (typeof obj.plano !== 'string' || !Array.isArray(obj.dias)) {
    return { ok: false, error: 'JSON reconhecido, mas faltam os campos "plano" e "dias".' };
  }

  const days: ParsedDay[] = [];
  for (const rawDay of obj.dias) {
    if (typeof rawDay !== 'object' || rawDay === null) {
      return { ok: false, error: 'Cada item de "dias" precisa ser um objeto com label, foco e exercicios.' };
    }
    const d = rawDay as Record<string, unknown>;
    if (typeof d.label !== 'string' || typeof d.foco !== 'string' || !Array.isArray(d.exercicios)) {
      return { ok: false, error: 'Cada dia precisa de "label", "foco" e "exercicios".' };
    }

    const exercises: ParsedExercise[] = [];
    for (const rawEx of d.exercicios) {
      if (typeof rawEx !== 'object' || rawEx === null) {
        return { ok: false, error: `Cada exercício em "${d.label}" precisa de nome, series e reps.` };
      }
      const e = rawEx as Record<string, unknown>;
      if (typeof e.nome !== 'string' || typeof e.series !== 'number' || typeof e.reps !== 'string') {
        return {
          ok: false,
          error: `Exercício inválido em "${d.label}": precisa de nome (texto), series (número) e reps (texto).`,
        };
      }
      exercises.push({ name: e.nome, sets: e.series, reps: e.reps });
    }

    days.push({ label: d.label, focusName: d.foco, exercises });
  }

  return { ok: true, workout: { planName: obj.plano, days } };
}

const DAY_HEADER_RE = /^treino\s+([a-z0-9]+)\s*-\s*(.+)$/i;
const EXERCISE_RE = /^(.+?):\s*(\d+)\s*x\s*([\d-]+)\s*$/i;

function tryParseList(text: string): ParseResult | null {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  const days: ParsedDay[] = [];
  let current: ParsedDay | null = null;
  let matchedAnyLine = false;

  for (const line of lines) {
    const headerMatch = line.match(DAY_HEADER_RE);
    if (headerMatch) {
      matchedAnyLine = true;
      current = { label: headerMatch[1].toUpperCase(), focusName: headerMatch[2].trim(), exercises: [] };
      days.push(current);
      continue;
    }

    const exMatch = line.match(EXERCISE_RE);
    if (exMatch && current) {
      matchedAnyLine = true;
      current.exercises.push({
        name: exMatch[1].trim(),
        sets: parseInt(exMatch[2], 10),
        reps: exMatch[3].trim(),
      });
    }
  }

  if (!matchedAnyLine || days.length === 0) return null;
  return { ok: true, workout: { planName: 'Treino importado', days } };
}
