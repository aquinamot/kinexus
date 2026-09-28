import { Hono } from 'hono';
import { getActivePlan, getDayExercises, type DayExercise } from '../workouts/repo';
import { getOpenSession, getLastSession, getTrainedDaysInMonth } from '../sessions/repo';
import { buildMonthCalendar } from './calendar';
import { computeNextWorkoutDay } from './next-day';
import { Layout } from '../views/layout';
import { yearMonthBR } from '../dateBR';
import type { Env } from '../types';
import type { AuthedVars } from '../auth/middleware';

export const dashboardRoutes = new Hono<{ Bindings: Env; Variables: AuthedVars }>();

dashboardRoutes.get('/', async c => {
  const userId = c.get('userId');
  const now = new Date();
  const { year, month } = yearMonthBR(now);

  const trainedDates = await getTrainedDaysInMonth(c.env.DB, userId, year, month);
  const weeks = buildMonthCalendar(year, month, trainedDates, now);

  const plan = await getActivePlan(c.env.DB, userId);
  const openSession = await getOpenSession(c.env.DB, userId);
  const lastSession = await getLastSession(c.env.DB, userId);

  let nextDay: { id: number; label: string } | null = null;
  let exercises: DayExercise[] = [];

  if (plan && plan.days.length > 0) {
    if (openSession && openSession.workoutDayId !== null) {
      // A session is running: show its own day, not wherever the rotation would
      // point next (that day hasn't been "trained" yet — it's still in progress).
      nextDay = plan.days.find(d => d.id === openSession.workoutDayId) ?? null;
    }
    if (!nextDay) {
      const lastCompletedDayId = lastSession && lastSession.endedAt !== null ? lastSession.workoutDayId : null;
      nextDay = computeNextWorkoutDay(
        plan.days.map(d => ({ id: d.id, label: d.label, dayOrder: d.dayOrder })),
        lastCompletedDayId
      );
    }
    if (nextDay) exercises = await getDayExercises(c.env.DB, nextDay.id);
  }

  const weekdayLabels = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  return c.html(
    <Layout title="Kinexus" showNav>
      <div class="card">
        <h2>
          Frequência — {month}/{year}
        </h2>
        <div class="cal-grid">
          {weekdayLabels.map(w => (
            <div class="cal-weekday">{w}</div>
          ))}
        </div>
        {weeks.map(week => (
          <div class="cal-grid" style="margin-top:4px;">
            {week.map(day => {
              const classes = ['cal-day'];
              if (day.inMonth) classes.push('in-month');
              if (day.trained) classes.push('trained');
              if (day.isToday) classes.push('today');
              return <div class={classes.join(' ')}>{day.inMonth ? day.day : ''}</div>;
            })}
          </div>
        ))}
      </div>
      <div class="card">
        {nextDay ? (
          <>
            <h2>Treino {nextDay.label}</h2>
            <ul style="margin-bottom:16px;">
              {exercises.map(ex => (
                <li class="exercise-row">
                  <span>
                    {ex.name} — {ex.sets}x{ex.reps}
                  </span>
                </li>
              ))}
            </ul>
            {openSession ? (
              <form method="post" action="/sessoes/end">
                <button type="submit" class="btn btn-danger">
                  ■ Finalizar treino
                </button>
              </form>
            ) : (
              <form method="post" action="/sessoes/start">
                <input type="hidden" name="workoutDayId" value={nextDay.id} />
                <button type="submit" class="btn btn-primary">
                  ▶ Iniciar treino
                </button>
              </form>
            )}
          </>
        ) : (
          <p class="muted">
            Nenhuma planilha ativa. <a href="/importar" class="link">Importar treino</a>.
          </p>
        )}
      </div>
    </Layout>
  );
});
