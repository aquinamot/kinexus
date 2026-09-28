export interface DayRef {
  id: number;
  label: string;
  dayOrder: number;
}

export function computeNextWorkoutDay(days: DayRef[], lastTrainedDayId: number | null): DayRef | null {
  if (days.length === 0) return null;

  const sorted = [...days].sort((a, b) => a.dayOrder - b.dayOrder);
  if (lastTrainedDayId === null) return sorted[0];

  const lastIndex = sorted.findIndex(d => d.id === lastTrainedDayId);
  if (lastIndex === -1) return sorted[0];

  return sorted[(lastIndex + 1) % sorted.length];
}
