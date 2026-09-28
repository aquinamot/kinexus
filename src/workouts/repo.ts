export interface ResolvedExercise {
  exerciseId: number | null;
  customName: string | null;
  sets: number;
  reps: string;
  youtubeUrl: string | null;
}

export interface ResolvedDay {
  label: string;
  focusName: string;
  exercises: ResolvedExercise[];
}

export interface ResolvedWorkout {
  planName: string;
  days: ResolvedDay[];
}

export interface ActiveDay {
  id: number;
  label: string;
  focusName: string;
  dayOrder: number;
}

export interface ActivePlan {
  id: number;
  name: string;
  days: ActiveDay[];
}

export interface DayExercise {
  id: number;
  name: string;
  sets: number;
  reps: string;
  garminImageUrl: string | null;
  garminVideoUrl: string | null;
  youtubeUrl: string | null;
}

export async function persistImportedPlan(
  db: D1Database,
  userId: number,
  workout: ResolvedWorkout
): Promise<number> {
  // Build the new plan fully inactive first. Only swap it in for the old one —
  // as the very last step — once every day and exercise has been inserted
  // successfully. If anything fails while building, the previous plan (still
  // active) is untouched; the abandoned partial row is harmless.
  const planRow = await db.prepare(
    'INSERT INTO workout_plans (user_id, name, created_at, is_active) VALUES (?, ?, ?, 0) RETURNING id'
  ).bind(userId, workout.planName, Date.now()).first<{ id: number }>();
  const planId = planRow!.id;

  for (let dayIndex = 0; dayIndex < workout.days.length; dayIndex++) {
    const day = workout.days[dayIndex];
    const dayRow = await db.prepare(
      'INSERT INTO workout_days (plan_id, label, focus_name, day_order) VALUES (?, ?, ?, ?) RETURNING id'
    ).bind(planId, day.label, day.focusName, dayIndex).first<{ id: number }>();
    const dayId = dayRow!.id;

    for (let exIndex = 0; exIndex < day.exercises.length; exIndex++) {
      const ex = day.exercises[exIndex];
      await db.prepare(
        `INSERT INTO workout_exercises
         (workout_day_id, exercise_id, custom_name, sets, reps, exercise_order, youtube_url)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(dayId, ex.exerciseId, ex.customName, ex.sets, ex.reps, exIndex, ex.youtubeUrl).run();
    }
  }

  await db.batch([
    db.prepare('UPDATE workout_plans SET is_active = 0 WHERE user_id = ? AND is_active = 1').bind(userId),
    db.prepare('UPDATE workout_plans SET is_active = 1 WHERE id = ?').bind(planId),
  ]);

  return planId;
}

export async function getActivePlan(db: D1Database, userId: number): Promise<ActivePlan | null> {
  const plan = await db.prepare('SELECT id, name FROM workout_plans WHERE user_id = ? AND is_active = 1 LIMIT 1')
    .bind(userId)
    .first<{ id: number; name: string }>();

  if (!plan) return null;

  const { results: days } = await db.prepare(
    'SELECT id, label, focus_name as focusName, day_order as dayOrder FROM workout_days WHERE plan_id = ? ORDER BY day_order'
  ).bind(plan.id).all<ActiveDay>();

  return { id: plan.id, name: plan.name, days: days ?? [] };
}

export async function deleteActivePlan(db: D1Database, userId: number): Promise<void> {
  const plan = await db.prepare('SELECT id FROM workout_plans WHERE user_id = ? AND is_active = 1')
    .bind(userId)
    .first<{ id: number }>();
  if (!plan) return;

  const { results: days } = await db.prepare('SELECT id FROM workout_days WHERE plan_id = ?')
    .bind(plan.id)
    .all<{ id: number }>();
  const dayIds = (days ?? []).map(d => d.id);

  const statements = [];
  // Sessions keep their date (frequency history stays intact) but can no longer
  // reference a day that's about to be deleted.
  for (const dayId of dayIds) {
    statements.push(db.prepare('UPDATE workout_sessions SET workout_day_id = NULL WHERE workout_day_id = ?').bind(dayId));
    statements.push(db.prepare('DELETE FROM workout_exercises WHERE workout_day_id = ?').bind(dayId));
  }
  statements.push(db.prepare('DELETE FROM workout_days WHERE plan_id = ?').bind(plan.id));
  statements.push(db.prepare('DELETE FROM workout_plans WHERE id = ?').bind(plan.id));

  await db.batch(statements);
}

export async function updateExerciseYoutubeUrl(
  db: D1Database,
  userId: number,
  workoutExerciseId: number,
  youtubeUrl: string | null
): Promise<boolean> {
  const result = await db.prepare(
    `UPDATE workout_exercises
     SET youtube_url = ?
     WHERE id = ?
       AND workout_day_id IN (
         SELECT wd.id FROM workout_days wd
         JOIN workout_plans wp ON wp.id = wd.plan_id
         WHERE wp.user_id = ?
       )`
  ).bind(youtubeUrl, workoutExerciseId, userId).run();

  return (result.meta.changes ?? 0) > 0;
}

export async function getDayExercises(db: D1Database, workoutDayId: number): Promise<DayExercise[]> {
  const { results } = await db.prepare(
    `SELECT
       we.id,
       COALESCE(e.name, we.custom_name) as name,
       we.sets,
       we.reps,
       e.garmin_image_url as garminImageUrl,
       e.garmin_video_url as garminVideoUrl,
       we.youtube_url as youtubeUrl
     FROM workout_exercises we
     LEFT JOIN exercises e ON e.id = we.exercise_id
     WHERE we.workout_day_id = ?
     ORDER BY we.exercise_order`
  ).bind(workoutDayId).all<DayExercise>();

  return results ?? [];
}
