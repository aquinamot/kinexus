import { describe, it, expect } from 'vitest';
import { computeNextWorkoutDay, type DayRef } from '../../src/dashboard/next-day';

const days: DayRef[] = [
  { id: 1, label: 'A', dayOrder: 0 },
  { id: 2, label: 'B', dayOrder: 1 },
  { id: 3, label: 'C', dayOrder: 2 },
];

describe('computeNextWorkoutDay', () => {
  it('returns the first day when nothing has been trained yet', () => {
    expect(computeNextWorkoutDay(days, null)?.label).toBe('A');
  });

  it('returns the next day in order after the last trained one', () => {
    expect(computeNextWorkoutDay(days, 1)?.label).toBe('B');
  });

  it('wraps around after the last day', () => {
    expect(computeNextWorkoutDay(days, 3)?.label).toBe('A');
  });

  it('falls back to the first day if the last trained day id is unknown (e.g. deleted plan)', () => {
    expect(computeNextWorkoutDay(days, 999)?.label).toBe('A');
  });

  it('returns null for an empty plan', () => {
    expect(computeNextWorkoutDay([], null)).toBeNull();
  });
});
