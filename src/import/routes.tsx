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
  youtubeUrl: string | null;
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
    <Layout title="Importar treino" showNav active="importar">
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
      <Layout title="Importar treino" showNav active="importar">
        <ImportForm raw={raw} error={result.error} />
      </Layout>
    );
  }

  const { results: catalog } = await c.env.DB.prepare('SELECT id, name FROM exercises').all<CatalogExercise>();
  const preview = buildPreview(result.workout, catalog ?? []);

  return c.html(
    <Layout title="Revisar importação" showNav active="importar">
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
          return { exerciseId: ex.exerciseId, customName: null, sets: ex.sets, reps: ex.reps, youtubeUrl: ex.youtubeUrl };
        }
        const resolution = String(body[`resolve_${dayIndex}_${exIndex}`] ?? 'avulso');
        if (resolution === 'avulso') {
          return { exerciseId: null, customName: ex.name, sets: ex.sets, reps: ex.reps, youtubeUrl: ex.youtubeUrl };
        }
        return { exerciseId: Number(resolution), customName: null, sets: ex.sets, reps: ex.reps, youtubeUrl: ex.youtubeUrl };
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
          youtubeUrl: ex.youtubeUrl,
          exerciseId: exact ? exact.id : null,
          candidates: exact ? [] : findClosestMatches(ex.name, catalog),
        };
      }),
    })),
  };
}

function ImportForm({ raw, error }: { raw?: string; error?: string }) {
  return (
    <div class="split">
      <div>
        <h1 class="display d-lg">Importar treino</h1>
        <p class="lede">
          Cole o treino que a IA montou. O Kinexus reconhece os exercícios no catálogo da Garmin e traz imagem, vídeo
          e passo a passo de quem tiver.
        </p>
        {error && (
          <p role="alert" style="color:var(--flag);font-size:13px;margin:14px 0 0;">
            {error}
          </p>
        )}
        <form method="post" action="/importar/preview">
          <textarea class="field" name="raw" rows={12} style="margin-top:16px;" spellcheck={false}>
            {raw ?? ''}
          </textarea>
          <button type="submit" class="btn btn-band" style="margin-top:14px;">
            Ler o treino
          </button>
        </form>
        <details style="margin-top:20px;">
          <summary class="link" style="cursor:pointer;">
            Ver formato esperado do JSON
          </summary>
          <pre
            style="margin-top:10px;padding:12px;background:var(--surface-2);border-radius:10px;font-size:11px;overflow-x:auto;"
          >{`{
  "plano": "Nome da planilha",
  "dias": [
    {
      "label": "A",
      "foco": "Peito/Tríceps",
      "exercicios": [
        {
          "nome": "Supino reto com barra",
          "series": 4,
          "reps": "8-10",
          "youtube": "https://youtube.com/watch?v=..."
        }
      ]
    }
  ]
}`}</pre>
          <p class="meta" style="margin-top:8px;">
            O campo <code>youtube</code> é opcional — use quando o exercício não existir no catálogo da Garmin (ex:
            exercícios de reabilitação/estabilização).
          </p>
        </details>
      </div>
      <aside>
        <div class="block" style="margin-top:0;">
          <div class="block-head">
            <h2>Prévia</h2>
            <span class="meta">aguardando</span>
          </div>
          <div class="panel">
            <p class="meta" style="margin:0;">
              Nada lido ainda. Cole o conteúdo e toque em Ler o treino — nada é salvo até você confirmar.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ImportPreview({ preview }: { preview: PreviewWorkout }) {
  return (
    <div>
      <h1 class="display d-lg">Revisar: {preview.planName}</h1>
      <form method="post" action="/importar/confirm">
        <input type="hidden" name="workout" value={JSON.stringify(preview)} />
        {preview.days.map((day, dayIndex) => (
          <div class="block">
            <div class="panel">
              <div class="block-head">
                <h2>
                  Treino {day.label} — {day.focusName}
                </h2>
              </div>
              <ul class="list">
                {day.exercises.map((ex, exIndex) => (
                  <li class="preview-row" style="flex-direction:column;align-items:stretch;gap:6px;">
                    <div>
                      <b>{ex.name}</b> <span class="meta">— {ex.sets}x{ex.reps}</span>
                    </div>
                    {ex.exerciseId === null && (
                      <select class="field" name={`resolve_${dayIndex}_${exIndex}`}>
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
          </div>
        ))}
        <button type="submit" class="btn btn-band" style="margin-top:22px;">
          Confirmar e salvar planilha
        </button>
      </form>
    </div>
  );
}
