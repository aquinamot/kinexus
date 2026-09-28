import { describe, it, expect } from 'vitest';
import { buildMonthCalendar } from '../../src/dashboard/calendar';

describe('buildMonthCalendar', () => {
  it('places September 1, 2026 (a Tuesday) in the right column', () => {
    const weeks = buildMonthCalendar(2026, 9, [], new Date('2026-09-28T12:00:00Z'));
    const firstWeek = weeks[0];
    // columns: Sun, Mon, Tue, Wed, Thu, Fri, Sat
    expect(firstWeek[0].inMonth).toBe(false);
    expect(firstWeek[1].inMonth).toBe(false);
    expect(firstWeek[2]).toMatchObject({ day: 1, inMonth: true });
  });

  it('marks trained days', () => {
    const weeks = buildMonthCalendar(2026, 9, ['2026-09-15'], new Date('2026-09-28T12:00:00Z'));
    const day15 = weeks.flat().find(d => d.dateStr === '2026-09-15');
    expect(day15?.trained).toBe(true);
  });

  it('marks today', () => {
    const weeks = buildMonthCalendar(2026, 9, [], new Date('2026-09-28T12:00:00Z'));
    const day28 = weeks.flat().find(d => d.dateStr === '2026-09-28');
    expect(day28?.isToday).toBe(true);
  });

  it('includes every day of the month exactly once', () => {
    const weeks = buildMonthCalendar(2026, 9, [], new Date('2026-09-28T12:00:00Z'));
    const inMonthDays = weeks.flat().filter(d => d.inMonth).map(d => d.day);
    expect(inMonthDays).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });
});
