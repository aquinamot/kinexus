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
