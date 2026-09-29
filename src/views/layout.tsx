import type { PropsWithChildren } from 'hono/jsx';

// CSS extraído do mockup aprovado (temp/mockup-kinexus.html). Mantém os tokens de
// cor (colchonete/faixa/tinta), o modo escuro, a tipografia Archivo com eixo de
// largura variável, réguas (.row) vs cartão acionável (.act), e o rail/tabbar
// responsivos. As regras específicas do protótipo estático de página única
// (.screen/.is-on, .sheet de modal) não se aplicam aqui — cada tela é uma rota
// própria renderizada no servidor — mas o resto foi transportado como está.
const STYLES = `
:root {
  --mat:        #e9ede6;
  --surface:    #fdfdfc;
  --surface-2:  #f3f6f1;
  --ink:        #16211c;
  --ink-2:      #5e6e66;
  --ink-3:      #6f7d74;
  --rule:       #cfd7cc;
  --rule-soft:  #e0e6dd;
  --band:       #1d6b45;
  --band-ink:   #ffffff;
  --band-wash:  #e4f0e8;
  --flag:       #b03a26;
  --flag-wash:  #f7e7e3;

  --z1: #7d8a83; --z2: #2e6fb8; --z3: #2f8f4e; --z4: #d98324; --z5: #b03a26;

  --r-sm: 8px;
  --r-md: 14px;
  --r-lg: 22px;
  --shadow-lift: 0 1px 2px rgba(22,33,28,.06), 0 8px 24px -12px rgba(22,33,28,.28);

  --rail: 232px;
  --gutter: 20px;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --mat:       #121613;
    --surface:   #1b211c;
    --surface-2: #232b25;
    --ink:       #e7ede5;
    --ink-2:     #9aa89f;
    --ink-3:     #8a978e;
    --rule:      #2e3730;
    --rule-soft: #262e28;
    --band:      #55c98d;
    --band-ink:  #0d1a12;
    --band-wash: #1a2f23;
    --flag:      #e4705a;
    --flag-wash: #32201c;
    --z1: #8b968f; --z2: #6aa6e8; --z3: #63c184; --z4: #e8a24a; --z5: #e4705a;
    --shadow-lift: 0 1px 2px rgba(0,0,0,.4), 0 10px 28px -14px rgba(0,0,0,.7);
  }
}
:root[data-theme="dark"] {
  --mat:#121613; --surface:#1b211c; --surface-2:#232b25;
  --ink:#e7ede5; --ink-2:#9aa89f; --ink-3:#8a978e;
  --rule:#2e3730; --rule-soft:#262e28;
  --band:#55c98d; --band-ink:#0d1a12; --band-wash:#1a2f23;
  --flag:#e4705a; --flag-wash:#32201c;
  --z1:#8b968f; --z2:#6aa6e8; --z3:#63c184; --z4:#e8a24a; --z5:#e4705a;
  --shadow-lift: 0 1px 2px rgba(0,0,0,.4), 0 10px 28px -14px rgba(0,0,0,.7);
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--mat);
  color: var(--ink);
  font-family: "Archivo", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-variation-settings: "wdth" 100;
  font-size: 15px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  font-variant-numeric: tabular-nums;
}
button, input, textarea, select { font: inherit; color: inherit; }
a { color: inherit; }

.display {
  font-variation-settings: "wdth" 112;
  font-weight: 600;
  letter-spacing: -0.022em;
  line-height: 1.04;
  margin: 0;
}
.d-xl { font-size: clamp(34px, 9vw, 46px); }
.d-lg { font-size: clamp(25px, 6vw, 31px); }
.d-md { font-size: 20px; }
.lede { color: var(--ink-2); margin: 6px 0 0; font-size: 15px; max-width: 46ch; }
.meta { color: var(--ink-2); font-size: 13px; }
.dim  { color: var(--ink-3); }
.num  { font-variation-settings: "wdth" 96; font-weight: 600; }

.app { min-height: 100dvh; }

.view {
  max-width: 620px;
  margin: 0 auto;
  padding: 22px var(--gutter) 108px;
}
.topbar {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 12px; margin-bottom: 18px;
}
.stamp { font-size: 13px; color: var(--ink-2); }

.tabbar {
  position: fixed; inset: auto 0 0 0; z-index: 40;
  display: grid; grid-template-columns: repeat(4, 1fr);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  backdrop-filter: blur(14px) saturate(1.4);
  border-top: 1px solid var(--rule);
  padding-bottom: env(safe-area-inset-bottom);
  margin: 0;
}
.tabbar a, .tabbar button {
  background: none; border: 0; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 11px 4px 10px; color: var(--ink-3); font-size: 11px;
  text-decoration: none; width: 100%;
}
.tabbar a[aria-current="page"], .tabbar button[aria-current="page"] { color: var(--band); }
.tabbar svg { width: 21px; height: 21px; }

.rail { display: none; }

.act {
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  padding: 22px;
  box-shadow: var(--shadow-lift);
}
.panel {
  background: var(--surface);
  border: 1px solid var(--rule-soft);
  border-radius: var(--r-md);
  padding: 18px;
}
.block + .block { margin-top: 26px; }
.split > * + * { margin-top: 26px; }
.block-head {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 10px; margin-bottom: 12px;
}
.block-head h2 { font-size: 15px; font-weight: 600; margin: 0; }

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 9px;
  border: 1px solid transparent; border-radius: 999px;
  padding: 14px 22px; font-size: 16px; font-weight: 600;
  cursor: pointer; text-decoration: none; white-space: nowrap;
  transition: transform .12s ease, background-color .15s ease;
}
.btn:active { transform: scale(.985); }
.btn-band  { background: var(--band); color: var(--band-ink); width: 100%; }
.btn-flag  { background: var(--flag); color: #fff; width: 100%; }
.btn-quiet { background: transparent; border-color: var(--rule); color: var(--ink); }
.btn-sm    { padding: 8px 15px; font-size: 13px; width: auto; }
.btn svg { width: 18px; height: 18px; }

:focus-visible { outline: 2px solid var(--band); outline-offset: 2px; border-radius: 4px; }

.tag {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11.5px; line-height: 1; padding: 4px 8px;
  border-radius: 999px; border: 1px solid var(--rule); color: var(--ink-2);
  white-space: nowrap;
}
.tag-band { background: var(--band-wash); border-color: transparent; color: var(--band); }
.tag-none { border-style: dashed; color: var(--ink-3); }
.tag i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

.zone { font-weight: 600; }
.zone-2 { color: var(--z2); }

.list { list-style: none; margin: 0; padding: 0; }
.row {
  display: grid;
  grid-template-columns: 56px 1fr auto;
  gap: 14px; align-items: center;
  padding: 13px 2px;
  border-bottom: 1px solid var(--rule-soft);
  width: 100%; background: none; border-left: 0; border-right: 0; border-top: 0;
  text-align: left; cursor: pointer; font: inherit; color: inherit;
}
li:last-child > .row { border-bottom: 0; }
.row:hover .row-name { color: var(--band); }
.row-name { font-weight: 600; font-size: 15px; line-height: 1.25; }
.row-dose { color: var(--ink-2); font-size: 13px; margin-top: 3px; }
.row-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
.row-go { color: var(--ink-3); }
.row-go svg { width: 16px; height: 16px; display: block; }

.thumb {
  width: 56px; height: 56px; border-radius: 10px; overflow: hidden;
  background: var(--surface-2); flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  color: var(--ink-3);
}
.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.thumb svg { width: 22px; height: 22px; }
.thumb-none { border: 1px dashed var(--rule); background: transparent; }
.thumb-yt { background: var(--band-wash); color: var(--band); }

.cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.cal-wd { text-align: center; font-size: 11px; color: var(--ink-3); padding-bottom: 6px; }
.cal-d {
  aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
  font-size: 13px; border-radius: 9px; color: var(--ink-3);
}
.cal-d.on-month { background: var(--surface-2); color: var(--ink); }
.cal-d.did { background: var(--band); color: var(--band-ink); font-weight: 600; }
.cal-d.now { box-shadow: inset 0 0 0 2px var(--band); font-weight: 700; color: var(--ink); }
.cal-legend { display: flex; gap: 16px; margin-top: 14px; font-size: 12.5px; color: var(--ink-2); }
.cal-legend span { display: flex; align-items: center; gap: 6px; }
.chip { width: 11px; height: 11px; border-radius: 4px; display: inline-block; }

.stat-row { display: flex; gap: 28px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--rule-soft); }
.stat b { display: block; font-size: 26px; font-variation-settings: "wdth" 96; font-weight: 600; line-height: 1.1; }
.stat span { font-size: 12.5px; color: var(--ink-2); }

.days { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; margin-bottom: 18px; scrollbar-width: none; }
.days::-webkit-scrollbar { display: none; }
.day {
  flex: 1 0 auto; min-width: 74px; text-align: center; cursor: pointer;
  padding: 10px 14px; border-radius: 999px; font-size: 14px; font-weight: 600;
  background: var(--surface); border: 1px solid var(--rule); color: var(--ink-2);
  text-decoration: none; display: inline-block;
}
.day[aria-selected="true"] { background: var(--ink); border-color: var(--ink); color: var(--mat); }

.field {
  width: 100%; padding: 12px 15px; border-radius: 12px;
  border: 1px solid var(--rule); background: var(--surface); color: var(--ink);
  font-size: 16px;
}
.field::placeholder { color: var(--ink-3); }
textarea.field { font-size: 14px; line-height: 1.55; resize: vertical; min-height: 190px; }

.run-head {
  position: sticky; top: 0; z-index: 20; margin: -22px calc(var(--gutter) * -1) 18px;
  padding: 16px var(--gutter) 14px;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--rule);
}
.clock {
  font-size: 40px; font-variation-settings: "wdth" 92; font-weight: 600;
  letter-spacing: -0.02em; line-height: 1; margin: 0;
}
.bar { height: 5px; border-radius: 999px; background: var(--rule-soft); overflow: hidden; margin-top: 14px; }
.bar > i { display: block; height: 100%; background: var(--band); border-radius: 999px; transition: width .3s ease; }

.tick {
  width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0;
  border: 2px solid var(--rule); background: transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: center; color: transparent;
  transition: background-color .15s ease, border-color .15s ease;
}
.tick svg { width: 15px; height: 15px; }
.row.done .tick { background: var(--band); border-color: var(--band); color: var(--band-ink); }
.row.done .row-name { text-decoration: line-through; color: var(--ink-3); }
.row.done .thumb { opacity: .45; }

.hero {
  width: 100%; aspect-ratio: 16 / 10; border-radius: var(--r-md); overflow: hidden;
  background: var(--surface-2); margin-bottom: 18px; position: relative;
  display: flex; align-items: center; justify-content: center;
}
.hero img, .hero video { width: 100%; height: 100%; object-fit: cover; display: block; }
.hero-play {
  position: absolute; inset: auto 12px 12px auto;
  background: rgba(12,20,16,.72); color: #fff; border: 0; cursor: pointer;
  border-radius: 999px; padding: 9px 15px; font-size: 13px; font-weight: 600;
  display: inline-flex; align-items: center; gap: 7px; backdrop-filter: blur(6px);
  text-decoration: none;
}
.hero-play svg { width: 14px; height: 14px; }
.hero-empty { aspect-ratio: auto; flex-direction: column; gap: 10px; padding: 30px 22px; text-align: center;
  color: var(--ink-2); font-size: 14px; border: 1px dashed var(--rule); background: transparent; }
.hero-empty svg { width: 26px; height: 26px; color: var(--ink-3); }

.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: 1px; background: var(--rule-soft); border-radius: var(--r-sm); overflow: hidden; margin: 18px 0; }
.fact { background: var(--surface); padding: 11px 13px; }
.fact dt { font-size: 11.5px; color: var(--ink-3); margin: 0 0 2px; }
.fact dd { margin: 0; font-size: 14px; font-weight: 600; }

.steps { counter-reset: s; list-style: none; margin: 0; padding: 0; }
.steps li {
  counter-increment: s; position: relative; padding: 0 0 14px 34px; font-size: 14.5px;
  color: var(--ink-2); line-height: 1.55;
}
.steps li::before {
  content: counter(s); position: absolute; left: 0; top: 1px;
  width: 22px; height: 22px; border-radius: 50%; background: var(--surface-2);
  color: var(--ink); font-size: 12px; font-weight: 600;
  display: flex; align-items: center; justify-content: center;
}
.src {
  display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--ink-3);
  border-top: 1px solid var(--rule-soft); padding-top: 14px; margin-top: 4px;
}

.yt-form { display: flex; gap: 8px; margin-top: 10px; }
.yt-form .field { flex: 1; }

.preview-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--rule-soft); font-size: 14px; }
.preview-row:last-child { border-bottom: 0; }
.preview-row b { font-weight: 600; }

.link { color: var(--band); text-decoration: underline; font-weight: 600; }

.gate { min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 28px var(--gutter); }
.gate-inner { width: 100%; max-width: 380px; }
.who { display: flex; flex-direction: column; gap: 9px; margin-top: 26px; }
.who a, .who button {
  display: flex; align-items: center; gap: 13px; width: 100%; cursor: pointer;
  padding: 13px 16px; border-radius: 14px; border: 1px solid var(--rule);
  background: var(--surface); font-size: 16px; font-weight: 600; text-align: left;
  text-decoration: none; color: inherit;
}
.who a:hover, .who button:hover { border-color: var(--band); }
.who .av {
  width: 38px; height: 38px; border-radius: 50%; background: var(--band-wash); color: var(--band);
  display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 15px;
  flex-shrink: 0;
}
.pips { display: flex; gap: 12px; justify-content: center; margin: 30px 0 26px; }
.pip { width: 13px; height: 13px; border-radius: 50%; border: 1.5px solid var(--rule); display: inline-block; }
.pip.full { background: var(--ink); border-color: var(--ink); }
.pad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 11px; }
.pad button {
  aspect-ratio: 1.55; border-radius: 14px; border: 1px solid var(--rule);
  background: var(--surface); font-size: 22px; font-variation-settings: "wdth" 96;
  font-weight: 500; cursor: pointer;
}
.pad button:active { background: var(--surface-2); }
.pad button.ghost { border-color: transparent; background: transparent; font-size: 15px; font-weight: 600; color: var(--ink-2); }
.pin-fallback { margin-top: 18px; }
.pin-fallback input { text-align: center; letter-spacing: 8px; font-size: 20px; margin-bottom: 12px; }

@media (min-width: 900px) {
  .tabbar { display: none; }
  .app { padding-left: var(--rail); }
  .rail {
    display: flex; flex-direction: column; gap: 4px;
    position: fixed; inset: 0 auto 0 0; width: var(--rail); z-index: 30;
    padding: 26px 16px; border-right: 1px solid var(--rule); background: var(--surface);
  }
  .rail .brand { font-variation-settings: "wdth" 112; font-weight: 600; font-size: 19px; letter-spacing: -.02em; margin: 0 8px 22px; }
  .rail a, .rail button {
    display: flex; align-items: center; gap: 11px; width: 100%; cursor: pointer;
    padding: 10px 12px; border-radius: 10px; border: 0; background: none;
    color: var(--ink-2); font-size: 14.5px; font-weight: 500; text-align: left;
    text-decoration: none;
  }
  .rail a:hover, .rail button:hover { background: var(--surface-2); color: var(--ink); }
  .rail a[aria-current="page"], .rail button[aria-current="page"] { background: var(--band-wash); color: var(--band); font-weight: 600; }
  .rail svg { width: 19px; height: 19px; }
  .rail .spacer { flex: 1; }
  .rail form { margin: 0; width: 100%; }

  .view { max-width: 1060px; padding: 34px 34px 56px; }
  .split { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 34px; align-items: start; }
  .split > * + * { margin-top: 0; }
  .split .block + .block { margin-top: 26px; }
  .split > aside .block:first-child { margin-top: 0; }
  .days { margin-bottom: 22px; }
  .day { flex: 0 0 auto; }
  .run-head { margin: -34px -34px 22px; padding: 22px 34px 16px; top: 0; }
}

@media (min-width: 1240px) {
  .view { max-width: 1160px; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: .01ms !important; animation-duration: .01ms !important; }
}
`;

// Sprite de ícones (mesmos símbolos do mockup), reaproveitado no rail, no tabbar
// e nas réguas de exercício.
const ICONS = `
<svg style="display:none" aria-hidden="true">
  <symbol id="i-today" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none"/>
  </symbol>
  <symbol id="i-plan" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 4.5h14v15H5z"/><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4"/>
  </symbol>
  <symbol id="i-import" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3.5v11M8 7.5l4-4 4 4M4.5 16v2.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V16"/>
  </symbol>
  <symbol id="i-exit" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14.5 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8M18.5 12h-9M15.5 8.5 19 12l-3.5 3.5"/>
  </symbol>
  <symbol id="i-play" viewBox="0 0 24 24"><path d="M8 5.2v13.6l11-6.8z" fill="currentColor"/></symbol>
  <symbol id="i-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17.5 19 7"/></symbol>
  <symbol id="i-next" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></symbol>
  <symbol id="i-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 6v12M6 12h12"/></symbol>
  <symbol id="i-body" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="4.6" r="2.1"/><path d="M12 7v7M12 14l-3 6M12 14l3 6M7.5 9.5 12 8.4l4.5 1.1"/>
  </symbol>
</svg>
`;

export type NavKey = 'hoje' | 'treinos' | 'importar';

interface LayoutProps {
  title: string;
  showNav?: boolean;
  /** Qual item de navegação destacar como atual (rail e tabbar). */
  active?: NavKey;
}

function NavLinks({ active }: { active?: NavKey }) {
  const items: { key: NavKey; href: string; icon: string; label: string }[] = [
    { key: 'hoje', href: '/', icon: 'i-today', label: 'Hoje' },
    { key: 'treinos', href: '/treinos', icon: 'i-plan', label: 'Treinos' },
    { key: 'importar', href: '/importar', icon: 'i-import', label: 'Importar' },
  ];
  return (
    <>
      {items.map(item => (
        <a href={item.href} aria-current={item.key === active ? 'page' : undefined}>
          <svg>
            <use href={`#${item.icon}`} />
          </svg>
          {item.label}
        </a>
      ))}
    </>
  );
}

function LogoutControl() {
  return (
    <form method="post" action="/logout">
      <button type="submit">
        <svg>
          <use href="#i-exit" />
        </svg>
        Sair
      </button>
    </form>
  );
}

export function Layout({ title, showNav, active, children }: PropsWithChildren<LayoutProps>) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{title} — Kinexus</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,300..700&display=swap"
          rel="stylesheet"
        />
        <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      </head>
      <body>
        <span dangerouslySetInnerHTML={{ __html: ICONS }} />
        <div class="app">
          {showNav && (
            <nav class="rail" aria-label="Seções">
              <p class="brand">Kinexus</p>
              <NavLinks active={active} />
              <span class="spacer"></span>
              <LogoutControl />
            </nav>
          )}
          <div class="view">{children}</div>
          {showNav && (
            <nav class="tabbar" aria-label="Seções">
              <NavLinks active={active} />
              <LogoutControl />
            </nav>
          )}
        </div>
      </body>
    </html>
  );
}
