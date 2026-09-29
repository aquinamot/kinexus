const TIMEZONE = 'America/Sao_Paulo';

// en-CA formats as YYYY-MM-DD, which is exactly the shape used everywhere else
// in this codebase (workout_sessions.date, calendar day keys, etc).
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function formatDateBR(date: Date): string {
  return dateFormatter.format(date);
}

export function yearMonthBR(date: Date): { year: number; month: number } {
  const [year, month] = formatDateBR(date).split('-').map(Number);
  return { year, month };
}

const MONTH_NAMES_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** Nome do mês em português, dado o número 1-12 (como retornado por yearMonthBR). */
export function monthNameBR(month: number): string {
  return MONTH_NAMES_PT[month - 1] ?? '';
}

const WEEKDAY_NAMES_PT = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** Nome do dia da semana em português, na timezone de São Paulo. */
export function weekdayNameBR(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'long' }).format(date);
  const index = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(parts);
  return WEEKDAY_NAMES_PT[index] ?? '';
}

/** Dia do mês (número), na timezone de São Paulo. */
export function dayOfMonthBR(date: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', day: '2-digit' }).format(date)
  );
}
