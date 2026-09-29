import type { Env } from '../src/types';

// O pool de testes do Workers expõe os bindings via `env` de 'cloudflare:test',
// mas só conhece os tipos que a gente declarar aqui.
declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: D1Migration[];
  }
}
