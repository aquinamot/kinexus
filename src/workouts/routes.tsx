import { Hono } from 'hono';
import { getActivePlan, getDayExercises, type DayExercise } from './repo';
import { Layout } from '../views/layout';
import type { Env } from '../types';
import type { AuthedVars } from '../auth/middleware';

export const workoutsRoutes = new Hono<{ Bindings: Env; Variables: AuthedVars }>();

workoutsRoutes.get('/', async c => {
  const userId = c.get('userId');
  const plan = await getActivePlan(c.env.DB, userId);

  if (!plan || plan.days.length === 0) {
    return c.html(
      <Layout title="Meus treinos" showNav>
        <div class="card">
          <p class="muted">
            Nenhuma planilha ativa. <a href="/importar" class="link">Importar treino</a>.
          </p>
        </div>
      </Layout>
    );
  }

  const dayIdParam = c.req.query('dia');
  const activeDay = dayIdParam ? plan.days.find(d => String(d.id) === dayIdParam) ?? plan.days[0] : plan.days[0];
  const exercises = await getDayExercises(c.env.DB, activeDay.id);

  return c.html(
    <Layout title="Meus treinos" showNav>
      <h1>{plan.name}</h1>
      <nav class="day-tabs">
        {plan.days.map(d => (
          <a href={`/treinos?dia=${d.id}`} class={`day-tab${d.id === activeDay.id ? ' active' : ''}`}>
            Treino {d.label}
          </a>
        ))}
      </nav>
      <div class="card">
        <h2>{activeDay.focusName}</h2>
        <ul>
          {exercises.map(ex => (
            <li class="exercise-row">
              <ExerciseReference exercise={ex} />
              <div>
                <div class="exercise-name">{ex.name}</div>
                <div class="exercise-meta">
                  {ex.sets}x{ex.reps}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Layout>
  );
});

function ExerciseReference({ exercise }: { exercise: DayExercise }) {
  if (exercise.youtubeUrl) {
    return (
      <a href={exercise.youtubeUrl} target="_blank" rel="noreferrer" class="exercise-thumb-placeholder">
        ▶
      </a>
    );
  }
  if (exercise.garminImageUrl) {
    return (
      <img
        src={exercise.garminImageUrl}
        alt={exercise.name}
        class="exercise-thumb"
        onerror="this.replaceWith(document.createTextNode('Sem referência disponível'))"
      />
    );
  }
  return <span class="exercise-meta">Sem referência disponível</span>;
}
