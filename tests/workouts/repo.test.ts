import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { persistImportedPlan, getActivePlan, getDayExercises, type ResolvedWorkout } from '../../src/workouts/repo';

let userId: number;

beforeEach(async () => {
  const row = await env.DB.prepare(
    "INSERT INTO users (name, pin_hash, created_at) VALUES (?, 'x', ?) RETURNING id"
  ).bind(`user-${Math.random()}`, Date.now()).first<{ id: number }>();
  userId = row!.id;
});

const sampleWorkout: ResolvedWorkout = {
  planName: 'Plano Teste',
  days: [
    {
      label: 'A',
      focusName: 'Peito',
      exercises: [
        { exerciseId: null, customName: 'Supino reto com barra', sets: 4, reps: '8-10', youtubeUrl: null },
      ],
    },
  ],
};

describe('persistImportedPlan + getActivePlan', () => {
  it('persists a plan and makes it the active one', async () => {
    await persistImportedPlan(env.DB, userId, sampleWorkout);

    const active = await getActivePlan(env.DB, userId);
    expect(active?.name).toBe('Plano Teste');
    expect(active?.days).toHaveLength(1);
    expect(active?.days[0].label).toBe('A');
  });

  it('deactivates the previous plan when a new one is imported', async () => {
    const firstId = await persistImportedPlan(env.DB, userId, sampleWorkout);
    await persistImportedPlan(env.DB, userId, { ...sampleWorkout, planName: 'Plano Novo' });

    const active = await getActivePlan(env.DB, userId);
    expect(active?.name).toBe('Plano Novo');

    const oldPlan = await env.DB.prepare('SELECT is_active FROM workout_plans WHERE id = ?')
      .bind(firstId)
      .first<{ is_active: number }>();
    expect(oldPlan?.is_active).toBe(0);
  });

  it('returns null when the user has no active plan', async () => {
    expect(await getActivePlan(env.DB, userId)).toBeNull();
  });

  it('leaves the previous plan active if building the new plan fails partway through', async () => {
    await persistImportedPlan(env.DB, userId, sampleWorkout);

    const brokenWorkout: ResolvedWorkout = {
      planName: 'Plano Quebrado',
      days: [
        {
          label: 'A',
          focusName: 'Peito',
          exercises: [
            // exerciseId 999999 doesn't exist — violates the FK to `exercises`,
            // simulating a failure partway through building the new plan.
            { exerciseId: 999999, customName: null, sets: 4, reps: '8-10', youtubeUrl: null },
          ],
        },
      ],
    };

    await expect(persistImportedPlan(env.DB, userId, brokenWorkout)).rejects.toThrow();

    const active = await getActivePlan(env.DB, userId);
    expect(active?.name).toBe('Plano Teste'); // the original plan, still active
  });
});

describe('getDayExercises', () => {
  it('resolves catalog exercise name over custom name when both could apply', async () => {
    const exerciseRow = await env.DB.prepare(
      "INSERT INTO exercises (name, muscle_group) VALUES ('Supino reto com barra', 'Peito') RETURNING id"
    ).first<{ id: number }>();

    await persistImportedPlan(env.DB, userId, {
      planName: 'Plano Teste 2',
      days: [
        {
          label: 'A',
          focusName: 'Peito',
          exercises: [
            { exerciseId: exerciseRow!.id, customName: null, sets: 4, reps: '8-10', youtubeUrl: null },
          ],
        },
      ],
    });

    const plan = await getActivePlan(env.DB, userId);
    const exercises = await getDayExercises(env.DB, plan!.days[0].id);

    expect(exercises).toHaveLength(1);
    expect(exercises[0].name).toBe('Supino reto com barra');
  });
});
