import { Hono } from 'hono';
import { parseWorkoutInput, type ParsedWorkout } from './parse';
import { findExactMatch, findClosestMatches, type CatalogExercise, type MatchCandidate } from '../exercises/match';
import { persistImportedPlan, type ResolvedWorkout } from '../workouts/repo';
import { Layout } from '../views/layout';
import type { Env } from '../types';
import type { AuthedVars } from '../auth/middleware';

interface PreviewExercise {
  name: string;
  sets: number;
  reps: string;
  exerciseId: number | null;
  candidates: MatchCandidate[];
}
interface PreviewDay {
  label: string;
  focusName: string;
  exercises: PreviewExercise[];
}
interface PreviewWorkout {
  planName: string;
  days: PreviewDay[];
}

export const importRoutes = new Hono<{ Bindings: Env; Variables: AuthedVars }>();

importRoutes.get('/', c =>
  c.html(
    <Layout title="Importar treino" showNav>
      <ImportForm />
    </Layout>
  )
);

importRoutes.post('/preview', async c => {
  const body = await c.req.parseBody();
  const raw = String(body.raw ?? '');
  const result = parseWorkoutInput(raw);

  if (!result.ok) {
    return c.html(
      <Layout title="Importar treino" showNav>
        <ImportForm raw={raw} error={result.error} />
      </Layout>
    );
  }

  const { results: catalog } = await c.env.DB.prepare('SELECT id, name FROM exercises').all<CatalogExercise>();
  const preview = buildPreview(result.workout, catalog ?? []);

  return c.html(
    <Layout title="Revisar importação" showNav>
      <ImportPreview preview={preview} />
    </Layout>
  );
});

importRoutes.post('/confirm', async c => {
  const userId = c.get('userId');
  const body = await c.req.parseBody();
  const preview: PreviewWorkout = JSON.parse(String(body.workout));

  const resolved: ResolvedWorkout = {
    planName: preview.planName,
    days: preview.days.map((day, dayIndex) => ({
      label: day.label,
      focusName: day.focusName,
      exercises: day.exercises.map((ex, exIndex) => {
        if (ex.exerciseId !== null) {
          return { exerciseId: ex.exerciseId, customName: null, sets: ex.sets, reps: ex.reps, youtubeUrl: null };
        }
        const resolution = String(body[`resolve_${dayIndex}_${exIndex}`] ?? 'avulso');
        if (resolution === 'avulso') {
          return { exerciseId: null, customName: ex.name, sets: ex.sets, reps: ex.reps, youtubeUrl: null };
        }
        return { exerciseId: Number(resolution), customName: null, sets: ex.sets, reps: ex.reps, youtubeUrl: null };
      }),
    })),
  };

  await persistImportedPlan(c.env.DB, userId, resolved);
  return c.redirect('/treinos');
});

function buildPreview(workout: ParsedWorkout, catalog: CatalogExercise[]): PreviewWorkout {
  return {
    planName: workout.planName,
    days: workout.days.map(day => ({
      label: day.label,
      focusName: day.focusName,
      exercises: day.exercises.map(ex => {
        const exact = findExactMatch(ex.name, catalog);
        return {
          name: ex.name,
          sets: ex.sets,
          reps: ex.reps,
          exerciseId: exact ? exact.id : null,
          candidates: exact ? [] : findClosestMatches(ex.name, catalog),
        };
      }),
    })),
  };
}

function ImportForm({ raw, error }: { raw?: string; error?: string }) {
  return (
    <div class="card">
      <h1>Importar treino</h1>
      <p class="muted" style="margin-bottom:12px;">
        Cole o treino gerado pela IA (JSON ou lista de exercícios).
      </p>
      {error && (
        <p role="alert" style="color:var(--danger);font-size:13px;margin-bottom:12px;">
          {error}
        </p>
      )}
      <form method="post" action="/importar/preview">
        <textarea name="raw" rows={12} style="margin-bottom:12px;">
          {raw ?? ''}
        </textarea>
        <button type="submit" class="btn btn-primary">
          Analisar treino
        </button>
      </form>
    </div>
  );
}

function ImportPreview({ preview }: { preview: PreviewWorkout }) {
  return (
    <div>
      <h1>Revisar: {preview.planName}</h1>
      <form method="post" action="/importar/confirm">
        <input type="hidden" name="workout" value={JSON.stringify(preview)} />
        {preview.days.map((day, dayIndex) => (
          <div class="card">
            <h2>
              Treino {day.label} — {day.focusName}
            </h2>
            <ul>
              {day.exercises.map((ex, exIndex) => (
                <li class="exercise-row" style="flex-direction:column;align-items:stretch;gap:6px;">
                  <div>
                    <span class="exercise-name">{ex.name}</span>{' '}
                    <span class="exercise-meta">
                      — {ex.sets}x{ex.reps}
                    </span>
                  </div>
                  {ex.exerciseId === null && (
                    <select name={`resolve_${dayIndex}_${exIndex}`}>
                      {ex.candidates.map(c => (
                        <option value={c.exercise.id}>{c.exercise.name}</option>
                      ))}
                      <option value="avulso">Nenhum — manter como está</option>
                    </select>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <button type="submit" class="btn btn-primary">
          Confirmar e salvar planilha
        </button>
      </form>
    </div>
  );
}
