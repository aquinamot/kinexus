import { Hono } from 'hono';
import { getActivePlan, getDayExercises, type DayExercise } from '../workouts/repo';
import { getOpenSession, getLastSession, getTrainedDaysInMonth } from '../sessions/repo';
import { buildMonthCalendar } from './calendar';
import { computeNextWorkoutDay } from './next-day';
import { Layout } from '../views/layout';
import { ExerciseRow, RunRow } from '../views/exercise-row';
import { yearMonthBR, monthNameBR, weekdayNameBR, dayOfMonthBR } from '../dateBR';
import type { Env } from '../types';
import type { AuthedVars } from '../auth/middleware';

export const dashboardRoutes = new Hono<{ Bindings: Env; Variables: AuthedVars }>();

// Cronômetro e checklist da sessão em andamento: só no cliente, sem persistência —
// ao recarregar a página o cronômetro volta a derivar de started_at (correto) mas
// o checklist reseta (esperado; ninguém grava progresso de série no servidor).
const RUN_SCRIPT = `
(() => {
  const clock = document.getElementById('clock');
  const runHead = document.getElementById('run-head');
  const started = runHead ? Number(runHead.dataset.started) : NaN;
  if (clock && !Number.isNaN(started)) {
    const paint = () => {
      const s = Math.max(0, Math.floor((Date.now() - started) / 1000));
      const mm = String(Math.floor(s / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      clock.textContent = mm + ':' + ss;
    };
    paint();
    setInterval(paint, 1000);
  }

  const rows = Array.from(document.querySelectorAll('[data-run-row]'));
  const bar = document.getElementById('bar');
  const count = document.getElementById('run-count');
  function update() {
    const done = rows.filter(r => r.classList.contains('done')).length;
    if (bar) bar.style.width = (rows.length ? (done / rows.length) * 100 : 0) + '%';
    if (count) count.textContent = done + ' de ' + rows.length + ' feitos';
  }
  rows.forEach(row => {
    const tickBtn = row.querySelector('[data-tick]');
    if (tickBtn) tickBtn.addEventListener('click', () => { row.classList.toggle('done'); update(); });
  });
  update();
})();
`;

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
    <Layout title="Kinexus" showNav active="hoje">
      <div class="split">
        <div>
          {!plan || !nextDay ? (
            <div class="block">
              <div class="act">
                <h1 class="display d-xl">Nenhuma planilha ativa</h1>
                <p class="lede">
                  Importe um treino para começar.{' '}
                  <a href="/importar" class="link">
                    Importar treino
                  </a>
                  .
                </p>
              </div>
            </div>
          ) : openSession ? (
            <>
              <div class="run-head" id="run-head" data-started={String(openSession.startedAt)}>
                <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:14px;">
                  <div>
                    <p class="meta" style="margin:0 0 4px;">
                      Treino {nextDay.label} em andamento
                    </p>
                    <p class="clock" id="clock">
                      00:00
                    </p>
                  </div>
                </div>
                <div class="bar">
                  <i id="bar" style="width:0%"></i>
                </div>
                <p class="meta" id="run-count" style="margin:9px 0 0;">
                  0 de {exercises.length} feitos
                </p>
              </div>

              <ul class="list" id="run-list">
                {exercises.map(ex => (
                  <RunRow exercise={ex} href={`/treinos/exercicio/${ex.id}?dia=${nextDay!.id}`} />
                ))}
              </ul>

              <div style="margin-top:26px;">
                <form method="post" action="/sessoes/end">
                  <button type="submit" class="btn btn-flag">
                    Finalizar treino
                  </button>
                </form>
                <p class="meta dim" style="text-align:center;margin-top:12px;">
                  O dia entra na frequência assim que você finalizar.
                </p>
              </div>

              <script dangerouslySetInnerHTML={{ __html: RUN_SCRIPT }} />
            </>
          ) : (
            <>
              <p class="stamp">
                {weekdayNameBR(now)}, {dayOfMonthBR(now)} de {monthNameBR(month)}
              </p>
              <div class="block" style="margin-top:6px;">
                <div class="act">
                  <h1 class="display d-xl">Treino {nextDay.label}</h1>
                  <p class="lede">{plan.days.find(d => d.id === nextDay!.id)?.focusName}</p>
                  <div style="display:flex;gap:7px;flex-wrap:wrap;margin:16px 0 20px;">
                    <span class="tag">{exercises.length} exercícios</span>
                  </div>
                  <form method="post" action="/sessoes/start">
                    <input type="hidden" name="workoutDayId" value={nextDay.id} />
                    <button type="submit" class="btn btn-band">
                      <svg>
                        <use href="#i-play" />
                      </svg>
                      Começar treino
                    </button>
                  </form>
                </div>
              </div>

              <div class="block">
                <div class="block-head">
                  <h2>O que vem hoje</h2>
                  <a class="btn btn-quiet btn-sm" href="/treinos">
                    Ver a planilha
                  </a>
                </div>
                <ul class="list">
                  {exercises.map(ex => (
                    <ExerciseRow exercise={ex} href={`/treinos/exercicio/${ex.id}?dia=${nextDay!.id}`} />
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>

        <aside>
          <div class="block">
            <div class="block-head">
              <h2>Frequência</h2>
              <span class="meta">
                {monthNameBR(month)} de {year}
              </span>
            </div>
            <div class="panel">
              <div class="cal">
                {weekdayLabels.map(w => (
                  <div class="cal-wd">{w}</div>
                ))}
              </div>
              {weeks.map(week => (
                <div class="cal" style="margin-top:4px;">
                  {week.map(day => {
                    const classes = ['cal-d'];
                    if (day.inMonth) classes.push('on-month');
                    if (day.trained) classes.push('did');
                    if (day.isToday) classes.push('now');
                    return <div class={classes.join(' ')}>{day.inMonth ? day.day : ''}</div>;
                  })}
                </div>
              ))}
              <div class="stat-row">
                <div class="stat">
                  <b>{trainedDates.length}</b>
                  <span>
                    dias em {monthNameBR(month)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </Layout>
  );
});
