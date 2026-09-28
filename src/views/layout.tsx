import type { PropsWithChildren } from 'hono/jsx';

const STYLES = `
  :root {
    --bg: #f7f7f8;
    --surface: #ffffff;
    --text: #18181b;
    --muted: #71717a;
    --border: #e4e4e7;
    --accent: #16a34a;
    --accent-contrast: #ffffff;
    --danger: #dc2626;
    --radius: 14px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f0f11;
      --surface: #1c1c1f;
      --text: #f4f4f5;
      --muted: #a1a1aa;
      --border: #302f33;
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  a { color: inherit; }
  h1 { font-size: 20px; margin: 0 0 16px; }
  h2 { font-size: 16px; margin: 0 0 12px; }
  ul { margin: 0; padding: 0; list-style: none; }
  .page { max-width: 480px; margin: 0 auto; padding: 24px 16px 96px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; margin-bottom: 16px; }
  .muted { color: var(--muted); font-size: 13px; }
  .center { text-align: center; }
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; padding: 13px; border-radius: 10px; border: none;
    font-size: 15px; font-weight: 600; cursor: pointer; text-align: center; text-decoration: none;
    font-family: inherit;
  }
  .btn-primary { background: var(--accent); color: var(--accent-contrast); }
  .btn-danger { background: var(--danger); color: #fff; }
  .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text); }
  input[type="password"], input[type="tel"], textarea, select {
    width: 100%; padding: 12px; border-radius: 10px; border: 1px solid var(--border);
    background: var(--surface); color: var(--text); font-size: 16px; font-family: inherit;
  }
  textarea { font-family: ui-monospace, monospace; font-size: 13px; resize: vertical; }
  .link { font-size: 13px; color: var(--muted); text-decoration: underline; }
  .bottom-nav {
    position: fixed; bottom: 0; left: 0; right: 0;
    display: flex; justify-content: space-around; align-items: center;
    background: var(--surface); border-top: 1px solid var(--border);
    padding: 10px 8px calc(10px + env(safe-area-inset-bottom));
  }
  .bottom-nav a, .bottom-nav button {
    background: none; border: none; color: var(--muted); font-size: 12px;
    font-family: inherit; display: flex; flex-direction: column; align-items: center; gap: 2px;
    text-decoration: none; cursor: pointer; padding: 4px 10px;
  }
  .bottom-nav .icon { font-size: 18px; }
  .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .cal-weekday { text-align: center; font-size: 10px; color: var(--muted); padding-bottom: 4px; }
  .cal-day {
    aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
    font-size: 12px; border-radius: 8px; color: var(--muted);
  }
  .cal-day.in-month { background: var(--bg); }
  .cal-day.trained { background: var(--accent); color: var(--accent-contrast); font-weight: 600; }
  .cal-day.today { box-shadow: inset 0 0 0 2px var(--accent); }
  .day-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
  .day-tab {
    flex: 1; text-align: center; padding: 10px; border-radius: 10px; text-decoration: none;
    font-size: 14px; font-weight: 600; background: var(--surface); border: 1px solid var(--border); color: var(--muted);
  }
  .day-tab.active { background: var(--accent); color: var(--accent-contrast); border-color: var(--accent); }
  .exercise-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); }
  .exercise-row:last-child { border-bottom: none; }
  .exercise-thumb { width: 52px; height: 52px; border-radius: 8px; object-fit: cover; flex-shrink: 0; background: var(--bg); }
  .exercise-thumb-placeholder {
    width: 52px; height: 52px; border-radius: 8px; flex-shrink: 0; background: var(--bg);
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
