/**
 * Devolve o link só se for http(s) absoluto; qualquer outra coisa vira null.
 * O link do YouTube vem de texto colado (pela pessoa ou pela IA que gerou o
 * treino) e vai parar em um href — `javascript:` e afins não podem passar.
 */
export function httpUrlOrNull(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:' ? trimmed : null;
  } catch {
    return null;
  }
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Converte um link de vídeo do YouTube (watch, youtu.be, shorts, embed, live)
 * no endereço de incorporação do youtube-nocookie.com, que não grava cookie
 * até o play. Mantém o tempo inicial (`t=90`, `t=1m30s`). Devolve null para
 * qualquer coisa que não seja um vídeo único do YouTube — aí a página mostra
 * só o link.
 */
export function youtubeEmbedUrl(raw: unknown): string | null {
  const safe = httpUrlOrNull(raw);
  if (!safe) return null;
  const url = new URL(safe);
  const host = url.hostname.toLowerCase();

  let id: string | null = null;
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    const [, first, second] = url.pathname.split('/');
    if (first === 'watch') id = url.searchParams.get('v');
    else if (first === 'shorts' || first === 'embed' || first === 'live') id = second ?? null;
  }
  if (!id || !VIDEO_ID_RE.test(id)) return null;

  const start = parseStartSeconds(url.searchParams.get('t') ?? url.searchParams.get('start'));
  return `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ''}`;
}

/** `90`, `90s`, `1m30s`, `1h2m3s` → segundos; qualquer outra coisa → 0. */
function parseStartSeconds(t: string | null): number {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}
