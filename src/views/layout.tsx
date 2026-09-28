import type { PropsWithChildren } from 'hono/jsx';

const STYLES = `
  :root {
    --bg: #f5f5f7;
    --surface: #ffffff;
    --surface-alt: #e5e5e7;
    --text: #1d1d1f;
    --muted: #86868b;
    --muted-2: #aeaeb2;
    --border: #d1d1d6;
    --accent: #0071e3;
    --accent-hover: #0077ed;
    --accent-contrast: #ffffff;
    --success: #34c759;
    --danger: #ff3b30;
    --radius: 12px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1d1d1f;
      --surface: #2c2c2e;
      --surface-alt: #3a3a3c;
      --text: #f5f5f7;
      --muted: #98989d;
      --muted-2: #636366;
      --border: #424245;
      --accent: #0a84ff;
      --accent-hover: #409cff;
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    line-height: 1.5;
  }
  a { color: inherit; }
  h1 { font-size: 22px; font-weight: 700; margin: 0 0 18px; letter-spacing: -0.01em; }
  h2 { font-size: 15px; font-weight: 600; margin: 0 0 14px; }
  ul { margin: 0; padding: 0; list-style: none; }
  .page { max-width: 480px; margin: 0 auto; padding: 28px 16px 100px; }
  .card {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 20px; margin-bottom: 16px;
  }
  .eyebrow {
    font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em;
    margin-bottom: 6px; font-weight: 600;
  }
  .muted { color: var(--muted); font-size: 13px; }
  .center { text-align: center; }
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; padding: 14px; border-radius: 10px; border: none;
    font-size: 15px; font-weight: 600; cursor: pointer; text-align: center; text-decoration: none;
    font-family: inherit; transition: opacity 0.15s ease;
  }
  .btn:active { opacity: 0.75; }
  .btn-primary { background: var(--accent); color: var(--accent-contrast); }
  .btn-danger { background: var(--danger); color: #fff; }
  .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text); }
  .btn-sm { width: auto; padding: 8px 14px; font-size: 13px; }
  input[type="password"], input[type="tel"], input[type="text"], input[type="url"], textarea, select {
    width: 100%; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--border);
    background: var(--surface); color: var(--text); font-size: 16px; font-family: inherit;
  }
  textarea { font-family: ui-monospace, monospace; font-size: 13px; resize: vertical; }
  .link { font-size: 13px; color: var(--accent); text-decoration: none; }
  .bottom-nav {
    position: fixed; bottom: 0; left: 0; right: 0;
    display: flex; justify-content: space-around; align-items: center;
    background: color-mix(in srgb, var(--surface) 92%, transparent);
    backdrop-filter: blur(12px);
    border-top: 1px solid var(--border);
    padding: 10px 8px calc(10px + env(safe-area-inset-bottom));
  }
  .bottom-nav a, .bottom-nav button {
    background: none; border: none; color: var(--muted); font-size: 11px;
    font-family: inherit; display: flex; flex-direction: column; align-items: center; gap: 3px;
    text-decoration: none; cursor: pointer; padding: 4px 12px;
  }
  .bottom-nav .icon { font-size: 19px; }
  .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; }
  .cal-weekday { text-align: center; font-size: 10px; color: var(--muted-2); padding-bottom: 6px; font-weight: 600; }
  .cal-day {
    aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
    font-size: 12px; border-radius: 8px; color: var(--muted-2);
  }
  .cal-day.in-month { background: var(--bg); color: var(--text); }
  .cal-day.trained { background: var(--accent); color: var(--accent-contrast); font-weight: 600; }
  .cal-day.today { box-shadow: inset 0 0 0 2px var(--accent); font-weight: 700; }
  .day-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
  .day-tab {
    flex: 1; text-align: center; padding: 11px; border-radius: 10px; text-decoration: none;
    font-size: 14px; font-weight: 600; background: var(--surface); border: 1px solid var(--border); color: var(--muted);
  }
  .day-tab.active { background: var(--accent); color: var(--accent-contrast); border-color: var(--accent); }
  .exercise-row { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--border); }
  .exercise-row:last-child { border-bottom: none; }
  .exercise-thumb { width: 52px; height: 52px; border-radius: 10px; object-fit: cover; flex-shrink: 0; background: var(--surface-alt); }
  .exercise-thumb-placeholder {
    width: 52px; height: 52px; border-radius: 10px; flex-shrink: 0; background: var(--surface-alt);
    display: flex; align-items: center; justify-content: center; font-size: 18px; color: var(--muted);
  }
  .exercise-name { font-weight: 600; font-size: 14px; }
  .exercise-meta { font-size: 12px; color: var(--muted); }
`;

interface LayoutProps {
  title: string;
  showNav?: boolean;
}

export function Layout({ title, showNav, children }: PropsWithChildren<LayoutProps>) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title} — Kinexus</title>
        <style>{STYLES}</style>
      </head>
      <body>
        <div class="page">{children}</div>
        {showNav && (
          <nav class="bottom-nav">
            <a href="/">
              <span class="icon">🏠</span>Hoje
            </a>
            <a href="/treinos">
              <span class="icon">📋</span>Treinos
            </a>
            <a href="/importar">
              <span class="icon">⬆️</span>Importar
            </a>
            <form method="post" action="/logout" style="margin:0;">
              <button type="submit">
                <span class="icon">🚪</span>Sair
              </button>
            </form>
          </nav>
        )}
      </body>
    </html>
  );
}
