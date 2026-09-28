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
      <Layout title="Meus treinos">
        <p>
          Nenhuma planilha ativa. <a href="/importar">Importar treino</a>.
        </p>
      </Layout>
    );
  }

  const dayIdParam = c.req.query('dia');
  const activeDay = dayIdParam ? plan.days.find(d => String(d.id) === dayIdParam) ?? plan.days[0] : plan.days[0];
  const exercises = await getDayExercises(c.env.DB, activeDay.id);

  return c.html(
    <Layout title="Meus treinos">
      <h1>{plan.name}</h1>
      <nav>
        {plan.days.map(d => (
          <a href={`/treinos?dia=${d.id}`}>Treino {d.label}</a>
        ))}
      </nav>
      <h2>{activeDay.focusName}</h2>
      <ul>
        {exercises.map(ex => (
          <li>
            <ExerciseReference exercise={ex} />
            {ex.name} — {ex.sets}x{ex.reps}
          </li>
        ))}
      </ul>
    </Layout>
  );
});

function ExerciseReference({ exercise }: { exercise: DayExercise }) {
  if (exercise.youtubeUrl) {
    return (
      <a href={exercise.youtubeUrl} target="_blank" rel="noreferrer">
        ▶ Assistir no YouTube
      </a>
    );
  }
  if (exercise.garminImageUrl) {
    return (
      <img
        src={exercise.garminImageUrl}
        alt={exercise.name}
        width={56}
        height={56}
        onerror="this.replaceWith(document.createTextNode('Sem referência disponível'))"
      />
    );
  }
  return <span>Sem referência disponível</span>;
}
