import type { PropsWithChildren } from 'hono/jsx';

export function Layout({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title} — Kinexus</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
