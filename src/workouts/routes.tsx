import { Hono } from 'hono';
import {
  getActivePlan,
  getDayExercises,
  getExerciseDetail,
  updateExerciseYoutubeUrl,
  deleteActivePlan,
} from './repo';
import { Layout } from '../views/layout';
import { ExerciseRow, refState } from '../views/exercise-row';
import { httpUrlOrNull, youtubeEmbedUrl } from '../safeUrl';
import type { Env } from '../types';
import type { AuthedVars } from '../auth/middleware';

export const workoutsRoutes = new Hono<{ Bindings: Env; Variables: AuthedVars }>();

// Filtro de busca por nome do exercício, dentro do dia selecionado — uma das
// exceções explícitas do mockup para JS no cliente (não muda nada no servidor).
const SEARCH_SCRIPT = `
(() => {
  const input = document.getElementById('search');
  if (!input) return;
  const rows = Array.from(document.querySelectorAll('#plan-list > li'));
  const empty = document.getElementById('empty-search');
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    let visible = 0;
    rows.forEach(li => {
      const name = (li.querySelector('.row-name')?.textContent || '').toLowerCase();
      const show = !q || name.includes(q);
      li.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    if (empty) empty.style.display = visible ? 'none' : 'block';
  });
})();
`;

workoutsRoutes.post('/exercicio/:id/youtube', async c => {
  const userId = c.get('userId');
  const exerciseId = Number(c.req.param('id'));
  const body = await c.req.parseBody();
  const youtube = String(body.youtube ?? '').trim();
  const dia = body.dia ? String(body.dia) : null;

  // Campo vazio apaga o link; um link que não é http(s) é ignorado e o anterior fica.
  const safe = httpUrlOrNull(youtube);
  if (!youtube || safe) {
    await updateExerciseYoutubeUrl(c.env.DB, userId, exerciseId, safe);
  }

  return c.redirect(dia ? `/treinos/exercicio/${exerciseId}?dia=${dia}` : `/treinos/exercicio/${exerciseId}`);
});

workoutsRoutes.post('/excluir', async c => {
  const userId = c.get('userId');
  await deleteActivePlan(c.env.DB, userId);
  return c.redirect('/treinos');
});

workoutsRoutes.get('/exercicio/:id', async c => {
  const userId = c.get('userId');
  const exerciseId = Number(c.req.param('id'));
  const dia = c.req.query('dia');

  const detail = await getExerciseDetail(c.env.DB, userId, exerciseId);
  if (!detail) return c.notFound();

  const state = refState(detail);
  // Linhas gravadas antes da validação podem ter qualquer coisa em youtube_url.
  const youtubeHref = httpUrlOrNull(detail.youtubeUrl);
  const youtubeEmbed = youtubeEmbedUrl(detail.youtubeUrl);
  const backHref = dia ? `/treinos?dia=${dia}` : '/treinos';

  return c.html(
    <Layout title={detail.name} showNav active="treinos">
      <a href={backHref} class="btn btn-quiet btn-sm" style="margin-bottom:18px;">
        ← Voltar
      </a>

      {state === 'garmin' ? (
        <div class="hero">
          {detail.garminImageUrl && !detail.garminVideoUrl && (
            <img src={detail.garminImageUrl} alt={`Demonstração do exercício ${detail.name}`} />
          )}
          {detail.garminVideoUrl && (
            // connectvideo.garmin.com manda Access-Control-Allow-Origin: * e aceita
            // range, então o vídeo toca aqui mesmo em vez de abrir o .mp4 cru.
            <video
              src={detail.garminVideoUrl}
              poster={detail.garminImageUrl ?? undefined}
              controls
              loop
              muted
              playsinline
              preload="none"
            />
          )}
        </div>
      ) : state === 'youtube' && youtubeEmbed ? (
        <>
          <div class="hero hero-yt">
            <iframe
              src={youtubeEmbed}
              title={`Vídeo do exercício ${detail.name}`}
              loading="lazy"
              allow="encrypted-media; picture-in-picture; fullscreen"
              allowfullscreen
              referrerpolicy="strict-origin-when-cross-origin"
            />
          </div>
          {/* Há vídeos com incorporação bloqueada pelo dono; o link direto cobre esse caso. */}
          <p class="meta" style="margin:-8px 0 18px;">
            <a class="link" href={youtubeHref!} target="_blank" rel="noreferrer">
              Abrir no YouTube
            </a>
          </p>
        </>
      ) : state === 'youtube' ? (
        <div class="hero hero-empty">
          <svg>
            <use href="#i-play" />
          </svg>
          <span>Vídeo que você salvou</span>
          {youtubeHref && (
            <a class="btn btn-quiet btn-sm" href={youtubeHref} target="_blank" rel="noreferrer">
              Abrir no YouTube
            </a>
          )}
        </div>
      ) : (
        <div class="hero hero-empty">
          <svg>
            <use href="#i-body" />
          </svg>
          <span>{state === 'catalogo' ? 'A Garmin não tem vídeo deste exercício' : 'Este exercício não está no catálogo'}</span>
        </div>
      )}

      <h1 class="display d-lg">{detail.name}</h1>
      <p class="lede">
        {detail.sets} séries de {detail.reps}
      </p>

      <dl class="facts">
        {detail.difficulty && (
          <div class="fact">
            <dt>Dificuldade</dt>
            <dd>{detail.difficulty}</dd>
          </div>
        )}
        {detail.equipment && (
          <div class="fact">
            <dt>Equipamento</dt>
            <dd>{detail.equipment}</dd>
          </div>
        )}
        {detail.muscleGroup && (
          <div class="fact">
            <dt>Músculo principal</dt>
            <dd>{detail.muscleGroup}</dd>
          </div>
        )}
        {detail.secondaryMuscles && (
          <div class="fact">
            <dt>Também trabalha</dt>
            <dd>{detail.secondaryMuscles}</dd>
          </div>
        )}
      </dl>

      {detail.description && <p class="lede">{detail.description}</p>}

      {detail.steps && detail.steps.length > 0 && (
        <>
          <h2 class="display d-md" style="margin:22px 0 12px;">
            Como fazer
          </h2>
          <ol class="steps">
            {detail.steps.map(step => (
              <li>{step}</li>
            ))}
          </ol>
        </>
      )}

      {state === 'garmin' && (
        <p class="src">
          <svg>
            <use href="#i-body" />
          </svg>
          Imagem, vídeo e passo a passo do catálogo da Garmin
        </p>
      )}

      <h2 class="display d-md" style="margin:22px 0 8px;">
        Seu vídeo
      </h2>
      <p class="meta" style="margin:0 0 4px;">
        {state === 'youtube'
          ? 'O link vale só neste dia da planilha. Se o exercício se repete em outro treino, cole lá também.'
          : 'Cole um link do YouTube para ter a referência aqui dentro na hora do treino.'}
      </p>
      <form method="post" action={`/treinos/exercicio/${detail.id}/youtube`} class="yt-form">
        {dia && <input type="hidden" name="dia" value={dia} />}
        <input class="field" type="url" name="youtube" placeholder="https://youtube.com/..." value={detail.youtubeUrl ?? ''} />
        <button class="btn btn-band btn-sm" type="submit">
          Salvar
        </button>
      </form>
    </Layout>
  );
});

workoutsRoutes.get('/', async c => {
  const userId = c.get('userId');
  const plan = await getActivePlan(c.env.DB, userId);

  if (!plan || plan.days.length === 0) {
    return c.html(
      <Layout title="Meus treinos" showNav active="treinos">
        <h1 class="display d-lg">Meus treinos</h1>
        <p class="lede">
          Nenhuma planilha ativa.{' '}
          <a href="/importar" class="link">
            Importar treino
          </a>
          .
        </p>
      </Layout>
    );
  }

  const dayIdParam = c.req.query('dia');
  const activeDay = dayIdParam ? plan.days.find(d => String(d.id) === dayIdParam) ?? plan.days[0] : plan.days[0];
  const exercises = await getDayExercises(c.env.DB, activeDay.id);

  return c.html(
    <Layout title="Meus treinos" showNav active="treinos">
      <div class="topbar">
        <div>
          <h1 class="display d-lg">{plan.name}</h1>
        </div>
        <form
          method="post"
          action="/treinos/excluir"
          onsubmit="return confirm('Excluir esta planilha? O histórico de frequência é mantido.')"
        >
          <button type="submit" class="btn btn-quiet btn-sm">
            Excluir
          </button>
        </form>
      </div>

      <div class="days" role="tablist">
        {plan.days.map(d => (
          <a href={`/treinos?dia=${d.id}`} class="day" role="tab" aria-selected={d.id === activeDay.id ? 'true' : 'false'}>
            Treino {d.label}
          </a>
        ))}
      </div>

      <div class="block-head">
        <h2>{activeDay.focusName}</h2>
        <span class="meta">{exercises.length} exercícios</span>
      </div>
      <input class="field" id="search" type="search" placeholder="Buscar exercício" style="margin-bottom:6px;" />
      <ul class="list" id="plan-list">
        {exercises.map(ex => (
          <ExerciseRow exercise={ex} href={`/treinos/exercicio/${ex.id}?dia=${activeDay.id}`} />
        ))}
      </ul>
      <p class="meta" id="empty-search" style="display:none;padding:22px 2px;">
        Nenhum exercício com esse nome neste dia.
      </p>
      <script dangerouslySetInnerHTML={{ __html: SEARCH_SCRIPT }} />
    </Layout>
  );
});
