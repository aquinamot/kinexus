import { Hono } from 'hono';
import { getActivePlan, getDayExercises, updateExerciseYoutubeUrl, deleteActivePlan, type DayExercise } from './repo';
import { Layout } from '../views/layout';
import type { Env } from '../types';
import type { AuthedVars } from '../auth/middleware';

export const workoutsRoutes = new Hono<{ Bindings: Env; Variables: AuthedVars }>();

workoutsRoutes.post('/exercicio/:id/youtube', async c => {
  const userId = c.get('userId');
  const exerciseId = Number(c.req.param('id'));
  const body = await c.req.parseBody();
  const youtube = String(body.youtube ?? '').trim();
  const dia = body.dia ? String(body.dia) : null;

  await updateExerciseYoutubeUrl(c.env.DB, userId, exerciseId, youtube || null);

  return c.redirect(dia ? `/treinos?dia=${dia}` : '/treinos');
});

workoutsRoutes.post('/excluir', async c => {
  const userId = c.get('userId');
  await deleteActivePlan(c.env.DB, userId);
  return c.redirect('/treinos');
});

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
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <h1>{plan.name}</h1>
        <form method="post" action="/treinos/excluir" onsubmit="return confirm('Excluir esta planilha? O histórico de frequência é mantido.')">
          <button type="submit" class="btn btn-outline btn-sm" style="color:var(--danger);">
            Excluir
          </button>
        </form>
      </div>
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
            <li class="exercise-row" style="flex-direction:column;align-items:stretch;">
              <div style="display:flex;align-items:center;gap:14px;">
                <ExerciseReference exercise={ex} />
                <div style="flex:1;">
                  <div class="exercise-name">{ex.name}</div>
                  <div class="exercise-meta">
                    {ex.sets}x{ex.reps}
                  </div>
                </div>
              </div>
              <details style="margin-top:8px;margin-left:66px;">
                <summary class="link" style="cursor:pointer;font-size:12px;">
                  {ex.youtubeUrl ? 'Editar link do YouTube' : '+ Adicionar vídeo do YouTube'}
                </summary>
                <form
                  method="post"
                  action={`/treinos/exercicio/${ex.id}/youtube`}
                  style="margin-top:8px;display:flex;gap:8px;"
                >
                  <input type="hidden" name="dia" value={activeDay.id} />
                  <input
                    type="url"
                    name="youtube"
                    placeholder="https://youtube.com/..."
                    value={ex.youtubeUrl ?? ''}
                    style="flex:1;"
                  />
                  <button type="submit" class="btn btn-primary btn-sm">
                    Salvar
                  </button>
                </form>
              </details>
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
