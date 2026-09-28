import { formatDateBR } from '../dateBR';

export interface CalendarDay {
  day: number;
  dateStr: string;
  trained: boolean;
  isToday: boolean;
  inMonth: boolean;
}

export function buildMonthCalendar(
  year: number,
  month: number,
  trainedDates: string[],
  today: Date
): CalendarDay[][] {
  const trainedSet = new Set(trainedDates);
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startWeekday = firstOfMonth.getUTCDay(); // 0 = Sunday
  const todayStr = formatDateBR(today);

  const cells: CalendarDay[] = [];

  for (let i = 0; i < startWeekday; i++) {
    cells.push({ day: 0, dateStr: '', trained: false, isToday: false, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, dateStr, trained: trainedSet.has(dateStr), isToday: dateStr === todayStr, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ day: 0, dateStr: '', trained: false, isToday: false, inMonth: false });
  }

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}
