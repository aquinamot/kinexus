import type { DayExercise } from '../workouts/repo';

/**
 * Os quatro estados de referência de exercício exigidos pelo mockup, sempre
 * explícitos na interface — nunca "tudo vira card igual":
 *   - garmin:   tem vídeo no catálogo da Garmin (imagem + vídeo)
 *   - youtube:  sem vídeo da Garmin, mas o usuário colou um link do YouTube
 *   - catalogo: bate no catálogo da Garmin, mas sem imagem/vídeo
 *   - nenhuma:  exercício avulso, sem nenhuma referência
 */
export type RefState = 'garmin' | 'youtube' | 'catalogo' | 'nenhuma';

/**
 * Recebe só os campos que realmente decidem o estado, para servir tanto a
 * DayExercise quanto a ExerciseDetail (que difere no formato de `steps`).
 * Imagem sozinha já conta como referência da Garmin: um punhado de exercícios
 * tem heroImage sem vídeo, e esconder a imagem deles seria perder referência.
 */
export function refState(
  ex: Pick<DayExercise, 'garminVideoUrl' | 'garminImageUrl' | 'youtubeUrl' | 'exerciseId'>
): RefState {
  // O link que o usuário colou vence a mídia da Garmin — é o que o design do
  // MVP determina, e é o vídeo que ele escolheu para aquele exercício.
  if (ex.youtubeUrl) return 'youtube';
  if (ex.garminVideoUrl || ex.garminImageUrl) return 'garmin';
  if (ex.exerciseId !== null) return 'catalogo';
  return 'nenhuma';
}

export function Thumb({ exercise }: { exercise: DayExercise }) {
  const state = refState(exercise);
  if (state === 'garmin') {
    return (
      <span class="thumb">
        <img src={exercise.garminImageUrl!} alt="" loading="lazy" />
      </span>
    );
  }
  if (state === 'youtube') {
    return (
      <span class="thumb thumb-yt">
        <svg>
          <use href="#i-play" />
        </svg>
      </span>
    );
  }
  if (state === 'catalogo') {
    return (
      <span class="thumb">
        <svg>
          <use href="#i-body" />
        </svg>
      </span>
    );
  }
  return (
    <span class="thumb thumb-none">
      <svg>
        <use href="#i-plus" />
      </svg>
    </span>
  );
}

export function RefTags({ exercise }: { exercise: DayExercise }) {
  const state = refState(exercise);
  return (
    <div class="row-tags">
      {state === 'garmin' && (
        <span class="tag tag-band">
          <i></i>
          {exercise.garminVideoUrl ? 'Garmin com vídeo' : 'Imagem da Garmin'}
        </span>
      )}
      {state === 'youtube' && (
        <span class="tag tag-band">
          <i></i>Seu vídeo
        </span>
      )}
      {state === 'catalogo' && <span class="tag">No catálogo, sem mídia</span>}
      {state === 'nenhuma' && <span class="tag tag-none">Sem referência</span>}
    </div>
  );
}

/** Régua de exercício clicável — leva ao detalhe. Usada em Hoje e em Treinos. */
export function ExerciseRow({ exercise, href }: { exercise: DayExercise; href: string }) {
  return (
    <li>
      <a class="row" href={href}>
        <Thumb exercise={exercise} />
        <span>
          <span class="row-name">{exercise.name}</span>
          <span class="row-dose">
            {exercise.sets} × {exercise.reps}
          </span>
          <RefTags exercise={exercise} />
        </span>
        <span class="row-go">
          <svg>
            <use href="#i-next" />
          </svg>
        </span>
      </a>
    </li>
  );
}

/**
 * Régua da sessão em andamento: o marcador (checklist) é só no cliente — não
 * grava nada no servidor. A régua vira um link para o detalhe (thumb + nome)
 * mais um botão de "feito" separado, para não aninhar elementos interativos.
 */
export function RunRow({ exercise, href }: { exercise: DayExercise; href: string }) {
  return (
    <li>
      <div class="row" data-run-row>
        <a href={href} style="display:contents">
          <Thumb exercise={exercise} />
          <span>
            <span class="row-name">{exercise.name}</span>
            <span class="row-dose">
              {exercise.sets} × {exercise.reps}
            </span>
          </span>
        </a>
        <button type="button" class="tick" data-tick aria-label={`Marcar ${exercise.name} como feito`}>
          <svg>
            <use href="#i-check" />
          </svg>
        </button>
      </div>
    </li>
  );
}
