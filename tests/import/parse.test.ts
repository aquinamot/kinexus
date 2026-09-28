import { describe, it, expect } from 'vitest';
import { parseWorkoutInput } from '../../src/import/parse';

describe('parseWorkoutInput', () => {
  it('parses a well-formed JSON workout', () => {
    const raw = JSON.stringify({
      plano: 'Hipertrofia Set/26',
      dias: [
        {
          label: 'A',
          foco: 'Peito/Tríceps',
          exercicios: [{ nome: 'Supino reto com barra', series: 4, reps: '8-10' }],
        },
      ],
    });
    const result = parseWorkoutInput(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workout.planName).toBe('Hipertrofia Set/26');
      expect(result.workout.days[0].exercises[0].name).toBe('Supino reto com barra');
    }
  });

  it('rejects JSON missing required fields', () => {
    const result = parseWorkoutInput(JSON.stringify({ foo: 'bar' }));
    expect(result.ok).toBe(false);
  });

  it('parses a semi-structured list', () => {
    const raw = `
Treino A - Peito/Tríceps
Supino reto com barra: 4x8-10
Crucifixo na polia: 3x12-15

Treino B - Costas
Puxada frontal: 4x10
`;
    const result = parseWorkoutInput(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workout.days).toHaveLength(2);
      expect(result.workout.days[0].label).toBe('A');
      expect(result.workout.days[0].exercises).toHaveLength(2);
      expect(result.workout.days[1].exercises[0]).toEqual({
        name: 'Puxada frontal',
        sets: 4,
        reps: '10',
      });
    }
  });

  it('rejects empty input', () => {
    expect(parseWorkoutInput('').ok).toBe(false);
    expect(parseWorkoutInput('   ').ok).toBe(false);
  });

  it('rejects text that matches neither format', () => {
    const result = parseWorkoutInput('Hoje treinei bem e me senti ótimo, foi um dia produtivo na academia.');
    expect(result.ok).toBe(false);
  });
});
