import { Hono } from 'hono';
import { getActivePlan, getDayExercises, type DayExercise } from '../workouts/repo';
import { getOpenSession, getLastSession, getTrainedDaysInMonth } from '../sessions/repo';
import { buildMonthCalendar } from './calendar';
import { computeNextWorkoutDay } from './next-day';
import { Layout } from '../views/layout';
import type { Env } from '../types';
import type { AuthedVars } from '../auth/middleware';

export const dashboardRoutes = new Hono<{ Bindings: Env; Variables: AuthedVars }>();

dashboardRoutes.get('/', async c => {
  const userId = c.get('userId');
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const trainedDates = await getTrainedDaysInMonth(c.env.DB, userId, year, month);
  const weeks = buildMonthCalendar(year, month, trainedDates, now);

  const plan = await getActivePlan(c.env.DB, userId);
  const openSession = await getOpenSession(c.env.DB, userId);
  const lastSession = await getLastSession(c.env.DB, userId);

  let nextDay: { id: number; label: string } | null = null;
  let exercises: DayExercise[] = [];

  if (plan && plan.days.length > 0) {
    const lastDayId = lastSession?.workoutDayId ?? null;
    nextDay = computeNextWorkoutDay(
      plan.days.map(d => ({ id: d.id, label: d.label, dayOrder: d.dayOrder })),
      lastDayId
    );
    if (nextDay) exercises = await getDayExercises(c.env.DB, nextDay.id);
  }

  return c.html(
    <Layout title="Kinexus">
      <section>
        <h2>
          Frequência — {month}/{year}
        </h2>
        {weeks.map(week => (
          <div>
            {week.map(day => (
              <span>
                {day.inMonth ? day.day : ''}
                {day.trained ? ' ✓' : ''}
                {day.isToday ? ' (hoje)' : ''}
              </span>
            ))}
          </div>
        ))}
      </section>
      <section>
        {nextDay ? (
          <>
            <h2>Treino {nextDay.label}</h2>
            <ul>
              {exercises.map(ex => (
                <li>
                  {ex.name} — {ex.sets}x{ex.reps}
                </li>
              ))}
            </ul>
            {openSession ? (
              <form method="post" action="/sessoes/end">
                <button type="submit">Finalizar treino</button>
              </form>
            ) : (
              <form method="post" action="/sessoes/start">
                <input type="hidden" name="workoutDayId" value={nextDay.id} />
                <button type="submit">Iniciar treino</button>
              </form>
            )}
          </>
        ) : (
          <p>
            Nenhuma planilha ativa. <a href="/importar">Importar treino</a>.
          </p>
        )}
      </section>
    </Layout>
  );
});
