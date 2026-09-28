import { describe, it, expect } from 'vitest';
import { formatDateBR, yearMonthBR } from '../src/dateBR';

describe('formatDateBR', () => {
  it('uses the São Paulo calendar date, not the UTC one, near the day boundary', () => {
    // 2026-09-28T23:30:00Z = 2026-09-28T20:30:00-03:00 in São Paulo — still Sept 28 either way.
    expect(formatDateBR(new Date('2026-09-28T23:30:00Z'))).toBe('2026-09-28');

    // 2026-09-29T02:30:00Z: UTC has already rolled over to the 29th, but São Paulo
    // (UTC-3, no DST) is still 2026-09-28T23:30:00 — the 28th.
    expect(formatDateBR(new Date('2026-09-29T02:30:00Z'))).toBe('2026-09-28');

    // 2026-09-29T03:30:00Z = 2026-09-29T00:30:00-03:00 — now São Paulo has rolled over too.
    expect(formatDateBR(new Date('2026-09-29T03:30:00Z'))).toBe('2026-09-29');
  });
});

describe('yearMonthBR', () => {
  it('rolls the month over at the São Paulo boundary, not the UTC one', () => {
    // 2026-10-01T01:00:00Z = 2026-09-30T22:00:00-03:00 in São Paulo — still September.
    expect(yearMonthBR(new Date('2026-10-01T01:00:00Z'))).toEqual({ year: 2026, month: 9 });
  });
});
