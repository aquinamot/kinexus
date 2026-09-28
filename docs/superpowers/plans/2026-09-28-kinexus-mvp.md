# Kinexus MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Kinexus MVP — a single-Worker web app where 3 fixed users log in with a PIN, paste AI-generated workout plans, view them with Garmin exercise references, and track frequency via check-in/checkout sessions.

**Architecture:** One Cloudflare Worker (Hono, server-rendered JSX) backed by one Cloudflare D1 database. No client framework, no build pipeline beyond the Workers bundler. Business logic (PIN hashing, import parsing, exercise matching, calendar/rotation math) lives in pure, unit-tested functions; D1 access lives in thin repo modules; Hono routes wire them together.

**Tech Stack:** TypeScript, Hono (`hono`, `hono/jsx`, `hono/cookie`), Cloudflare D1, Vitest + `@cloudflare/vitest-pool-workers` (Miniflare-backed tests with real D1 bindings), Wrangler.

**Spec:** [docs/superpowers/specs/2026-09-28-kinexus-mvp-design.md](../specs/2026-09-28-kinexus-mvp-design.md)

## Global Constraints

- Single Cloudflare Worker + single D1 database. No other paid/external services except hotlinked Garmin image URLs and optional YouTube embeds.
- Must fit inside the Cloudflare free tier (target cost: $0/month).
- Exactly 3 fixed users (Bruno, Michele, Cecília), seeded directly in the database — no self-service signup in the MVP.
- Auth is PIN-based (4 digits) for this testing phase, not a full password system.
- No per-set load/rep performance tracking in the MVP — "progress" means adherence/frequency only.
- An open workout session auto-closes after **5 hours** with no manual checkout; it still counts as a trained day but its duration is not counted.
- Exercise names must follow Garmin's own naming convention (sourced from Garmin Connect's public pt-BR data, not invented).

## Review Focus

- Pasted import text that matches neither the JSON schema nor the list format → must show a clear error and persist nothing (Task 8, Task 10).
- Repeated wrong PINs → lock out after 5 failed attempts for 30s, without leaking whether the wrong PIN belongs to a real lockout vs. a fresh account (Task 6).
- A workout session left open past 5 hours → auto-closes on the next read, still counts toward the frequency calendar, but its duration is not counted (Task 12, Task 14).
- Exercise names that differ only by case/accents/abbreviation (e.g. "Supino reto com barra" vs "supino reto c/ barra") → normalized comparison so exact matches aren't missed (Task 7).
- Starting a workout session while one is already open for that user → reuses the existing open session instead of creating a duplicate (Task 12).

---

## File Structure

```
package.json
tsconfig.json
wrangler.toml
vitest.config.ts
.gitignore
migrations/
  0001_init.sql
  0002_seed_users.sql            (generated, not hand-written — see Task 4)
  0003_seed_exercises.sql        (generated, not hand-written — see Task 17)
scripts/
  generate-user-seed.ts
seed/
  fetch-garmin-catalog.ts
  users.local.json               (gitignored — real PINs live only here, locally)
src/
  index.ts
  types.ts
  auth/
    pin.ts
    session.ts
    middleware.ts
    routes.tsx
  exercises/
    match.ts
  import/
    parse.ts
    routes.tsx
  workouts/
    repo.ts
    routes.tsx
  sessions/
    repo.ts
    routes.tsx
  dashboard/
    calendar.ts
    next-day.ts
    routes.tsx
  views/
    layout.tsx
tests/
  setup/apply-migrations.ts
  auth/pin.test.ts
  auth/session.test.ts
  auth/routes.test.ts
  exercises/match.test.ts
  import/parse.test.ts
  workouts/repo.test.ts
  sessions/repo.test.ts
  dashboard/calendar.test.ts
  dashboard/next-day.test.ts
  dashboard/routes.test.ts
```

---

### Task 1: Project scaffolding + health check

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `wrangler.toml`
- Create: `vitest.config.ts`
- Create: `.gitignore` (extend the existing one)
- Create: `src/index.ts`
- Create: `src/types.ts`
- Test: `tests/health.test.ts`

**Interfaces:**
- Produces: `Env` type (`{ DB: D1Database }`) exported from `src/index.ts`, consumed by every later route/middleware file.
- Produces: default-exported Hono `app` from `src/index.ts`, consumed by every route-mounting task.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "kinexus",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "db:migrate:local": "wrangler d1 migrations apply kinexus --local",
    "db:migrate:remote": "wrangler d1 migrations apply kinexus --remote",
    "seed:users": "tsx scripts/generate-user-seed.ts",
    "seed:exercises": "tsx seed/fetch-garmin-catalog.ts"
  },
  "dependencies": {
    "hono": "^4.6.0"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.6.0",
    "@cloudflare/workers-types": "^4.20240925.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "wrangler": "^3.80.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "jsxImportSource": "hono/jsx",
    "types": ["@cloudflare/workers-types", "vitest/globals"],
    "noEmit": true
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Create `wrangler.toml`**

```toml
name = "kinexus"
main = "src/index.ts"
compatibility_date = "2026-09-01"

[[d1_databases]]
binding = "DB"
database_name = "kinexus"
database_id = "REPLACE_WITH_REAL_ID"
migrations_dir = "migrations"
```

Run `npx wrangler d1 create kinexus`, copy the `database_id` from the output, and replace `REPLACE_WITH_REAL_ID` in `wrangler.toml` with it. This is a one-time, account-specific setup step — not something the code can supply on its own.

- [ ] **Step 4: Create `src/types.ts`**

```typescript
export interface Env {
  DB: D1Database;
}
```

- [ ] **Step 5: Create `src/index.ts`**

```typescript
import { Hono } from 'hono';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

app.get('/health', c => c.text('ok'));

export default app;
```

- [ ] **Step 6: Create `vitest.config.ts`**

```typescript
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';
import path from 'node:path';

const migrationsPath = path.join(__dirname, 'migrations');
const migrations = await readD1Migrations(migrationsPath);

export default defineWorkersConfig({
  test: {
    setupFiles: ['./tests/setup/apply-migrations.ts'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations },
        },
      },
    },
  },
});
```

- [ ] **Step 7: Create `tests/setup/apply-migrations.ts`**

```typescript
import { applyD1Migrations, env } from 'cloudflare:test';

await applyD1Migrations(env.DB, (env as any).TEST_MIGRATIONS);
```

(`migrations/` is empty right now — Task 2 adds the first migration. This setup file will start applying it automatically once it exists.)

- [ ] **Step 8: Write the failing test — `tests/health.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

describe('health check', () => {
  it('GET /health returns ok', async () => {
    const res = await SELF.fetch('http://local/health');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });
});
```

- [ ] **Step 9: Install dependencies and run the test**

Run: `npm install && npm test`
Expected: PASS (this is the first real test, written against code that already exists — confirms the whole toolchain wires together before anything else is built).

- [ ] **Step 10: Extend `.gitignore`**

Add to the existing `.gitignore`:

```
node_modules/
dist/
seed/users.local.json
```

- [ ] **Step 11: Commit**

```bash
git add package.json tsconfig.json wrangler.toml vitest.config.ts .gitignore src/index.ts src/types.ts tests/health.test.ts tests/setup/apply-migrations.ts package-lock.json
git commit -m "chore: scaffold Hono/D1 Worker project with health check"
```

---

### Task 2: D1 schema migration

**Files:**
- Create: `migrations/0001_init.sql`
- Test: `tests/schema.test.ts`

**Interfaces:**
- Produces: tables `users`, `sessions_auth`, `exercises`, `workout_plans`, `workout_days`, `workout_exercises`, `workout_sessions`, consumed by every repo module from Task 4 onward. Exact column names are load-bearing — later tasks' SQL uses them verbatim.

- [ ] **Step 1: Write the failing test — `tests/schema.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';

describe('schema', () => {
  it('creates all expected tables', async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'"
    ).all<{ name: string }>();
    const names = (results ?? []).map(r => r.name).sort();
    expect(names).toEqual([
      'exercises',
      'sessions_auth',
      'users',
      'workout_days',
      'workout_exercises',
      'workout_plans',
      'workout_sessions',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/schema.test.ts`
Expected: FAIL (no tables exist yet — `names` is empty)

- [ ] **Step 3: Create `migrations/0001_init.sql`**

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  failed_pin_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions_auth (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);

CREATE TABLE exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  muscle_group TEXT NOT NULL,
  equipment TEXT NOT NULL DEFAULT '',
  garmin_image_url TEXT,
  garmin_video_url TEXT
);

CREATE TABLE workout_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE workout_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES workout_plans(id),
  label TEXT NOT NULL,
  focus_name TEXT NOT NULL,
  day_order INTEGER NOT NULL
);

CREATE TABLE workout_exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workout_day_id INTEGER NOT NULL REFERENCES workout_days(id),
  exercise_id INTEGER REFERENCES exercises(id),
  custom_name TEXT,
  sets INTEGER NOT NULL,
  reps TEXT NOT NULL,
  exercise_order INTEGER NOT NULL,
  youtube_url TEXT
);

CREATE TABLE workout_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  workout_day_id INTEGER REFERENCES workout_days(id),
  date TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  duration_counted INTEGER
);

CREATE INDEX idx_workout_plans_user_active ON workout_plans(user_id, is_active);
CREATE INDEX idx_workout_days_plan ON workout_days(plan_id);
CREATE INDEX idx_workout_exercises_day ON workout_exercises(workout_day_id);
CREATE INDEX idx_workout_sessions_user_date ON workout_sessions(user_id, date);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/schema.test.ts`
Expected: PASS

- [ ] **Step 5: Apply the migration locally for manual testing later**

Run: `npm run db:migrate:local`
Expected: confirms 1 migration applied.

- [ ] **Step 6: Commit**

```bash
git add migrations/0001_init.sql tests/schema.test.ts
git commit -m "feat: add D1 schema for users, exercises, plans, sessions"
```

---

### Task 3: PIN hashing

**Files:**
- Create: `src/auth/pin.ts`
- Test: `tests/auth/pin.test.ts`

**Interfaces:**
- Produces: `hashPin(pin: string): Promise<string>` and `verifyPin(pin: string, stored: string): Promise<boolean>`, consumed by Task 4 (user seed script) and Task 6 (login route).

- [ ] **Step 1: Write the failing tests — `tests/auth/pin.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { hashPin, verifyPin } from '../../src/auth/pin';

describe('pin hashing', () => {
  it('hashes and verifies a correct pin', async () => {
    const hash = await hashPin('1234');
    expect(await verifyPin('1234', hash)).toBe(true);
  });

  it('rejects an incorrect pin', async () => {
    const hash = await hashPin('1234');
    expect(await verifyPin('9999', hash)).toBe(false);
  });

  it('produces a different hash each time (random salt)', async () => {
    const a = await hashPin('1234');
    const b = await hashPin('1234');
    expect(a).not.toBe(b);
    expect(await verifyPin('1234', a)).toBe(true);
    expect(await verifyPin('1234', b)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/auth/pin.test.ts`
Expected: FAIL with "Cannot find module '../../src/auth/pin'"

- [ ] **Step 3: Create `src/auth/pin.ts`**

```typescript
const PBKDF2_ITERATIONS = 100_000;

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt);
  return `${toHex(salt)}:${toHex(hash)}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = fromHex(saltHex);
  const expected = fromHex(hashHex);
  const actual = await derive(pin, salt);
  return timingSafeEqual(actual, expected);
}

async function derive(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/auth/pin.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth/pin.ts tests/auth/pin.test.ts
git commit -m "feat: add PBKDF2-based PIN hashing"
```

---

### Task 4: Seed the 3 fixed users

**Files:**
- Create: `scripts/generate-user-seed.ts`
- Create (locally, gitignored — do not commit): `seed/users.local.json`
- Create (generated output, committed): `migrations/0002_seed_users.sql`
- Test: `tests/users-seeded.test.ts`

**Interfaces:**
- Consumes: `hashPin` from Task 3 (`src/auth/pin.ts`).
- Produces: 3 rows in `users` (Bruno, Michele, Cecília) once the generated migration is applied — consumed by Task 6 (login) and every later task that needs a `user_id`.

- [ ] **Step 1: Write the failing test — `tests/users-seeded.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';

describe('seeded users', () => {
  it('has exactly Bruno, Michele and Cecília', async () => {
    const { results } = await env.DB.prepare('SELECT name FROM users ORDER BY name').all<{ name: string }>();
    const names = (results ?? []).map(r => r.name);
    expect(names).toEqual(['Bruno', 'Cecília', 'Michele']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/users-seeded.test.ts`
Expected: FAIL (only `migrations/0001_init.sql` exists so far — the `users` table is empty)

- [ ] **Step 3: Create `seed/users.local.json` (not committed)**

```json
[
  { "name": "Bruno", "pin": "CHOOSE-A-4-DIGIT-PIN" },
  { "name": "Michele", "pin": "CHOOSE-A-4-DIGIT-PIN" },
  { "name": "Cecília", "pin": "CHOOSE-A-4-DIGIT-PIN" }
]
```

Replace each `pin` with a real 4-digit PIN before running the script. This file is gitignored (Task 1, Step 10) — the real PINs never reach the repository, only their hashes do.

- [ ] **Step 4: Create `scripts/generate-user-seed.ts`**

```typescript
import { readFile, writeFile } from 'node:fs/promises';
import { hashPin } from '../src/auth/pin';

interface SeedUser {
  name: string;
  pin: string;
}

async function main() {
  const raw = await readFile(new URL('../seed/users.local.json', import.meta.url), 'utf-8');
  const users: SeedUser[] = JSON.parse(raw);

  const statements: string[] = [];
  for (const user of users) {
    const hash = await hashPin(user.pin);
    const escapedName = user.name.replace(/'/g, "''");
    statements.push(
      `INSERT INTO users (name, pin_hash, failed_pin_attempts, locked_until, created_at) VALUES ('${escapedName}', '${hash}', 0, NULL, ${Date.now()});`
    );
  }

  const sql = statements.join('\n') + '\n';
  await writeFile(new URL('../migrations/0002_seed_users.sql', import.meta.url), sql);
  console.log(`Wrote ${statements.length} user(s) to migrations/0002_seed_users.sql`);
}

main();
```

- [ ] **Step 5: Fill in real PINs and run the generator**

Edit `seed/users.local.json` with 3 real PINs, then run:

Run: `npm run seed:users`
Expected: prints `Wrote 3 user(s) to migrations/0002_seed_users.sql`, and that file now contains 3 INSERT statements (with hashes, not raw PINs).

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- tests/users-seeded.test.ts`
Expected: PASS (the test pool applies every file under `migrations/` automatically, including the one just generated in Step 5)

- [ ] **Step 7: Apply to the local dev database too**

Run: `npm run db:migrate:local`

- [ ] **Step 8: Commit (the generated SQL, never the raw-PIN JSON)**

```bash
git add scripts/generate-user-seed.ts migrations/0002_seed_users.sql tests/users-seeded.test.ts
git commit -m "feat: seed the 3 fixed users with hashed PINs"
```

---

### Task 5: Auth session helpers (D1-backed)

**Files:**
- Create: `src/auth/session.ts`
- Test: `tests/auth/session.test.ts`

**Interfaces:**
- Consumes: `env.DB` (D1Database from Task 2's `sessions_auth` table).
- Produces: `createSession(db, userId): Promise<Session>`, `validateSession(db, sessionId): Promise<Session | null>`, `deleteSession(db, sessionId): Promise<void>`, and the `Session` type (`{ id: string; userId: number; expiresAt: number }`) — all consumed by Task 6 (login/logout routes) and Task 6's `requireAuth` middleware.

- [ ] **Step 1: Write the failing tests — `tests/auth/session.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { createSession, validateSession, deleteSession } from '../../src/auth/session';

describe('auth sessions', () => {
  it('creates a session and validates it', async () => {
    const user = await env.DB.prepare(
      "INSERT INTO users (name, pin_hash, created_at) VALUES ('Test', 'x', ?) RETURNING id"
    ).bind(Date.now()).first<{ id: number }>();

    const session = await createSession(env.DB, user!.id);
    const validated = await validateSession(env.DB, session.id);

    expect(validated?.userId).toBe(user!.id);
  });

  it('returns null for an unknown session id', async () => {
    expect(await validateSession(env.DB, 'does-not-exist')).toBeNull();
  });

  it('returns null after the session is deleted', async () => {
    const user = await env.DB.prepare(
      "INSERT INTO users (name, pin_hash, created_at) VALUES ('Test2', 'x', ?) RETURNING id"
    ).bind(Date.now()).first<{ id: number }>();

    const session = await createSession(env.DB, user!.id);
    await deleteSession(env.DB, session.id);

    expect(await validateSession(env.DB, session.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/auth/session.test.ts`
Expected: FAIL with "Cannot find module '../../src/auth/session'"

- [ ] **Step 3: Create `src/auth/session.ts`**

```typescript
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface Session {
  id: string;
  userId: number;
  expiresAt: number;
}

export async function createSession(db: D1Database, userId: number): Promise<Session> {
  const id = randomToken();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await db.prepare('INSERT INTO sessions_auth (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(id, userId, expiresAt)
    .run();
  return { id, userId, expiresAt };
}

export async function validateSession(db: D1Database, sessionId: string): Promise<Session | null> {
  const row = await db.prepare(
    'SELECT id, user_id as userId, expires_at as expiresAt FROM sessions_auth WHERE id = ?'
  ).bind(sessionId).first<Session>();

  if (!row) return null;

  if (row.expiresAt < Date.now()) {
    await deleteSession(db, sessionId);
    return null;
  }

  return row;
}

export async function deleteSession(db: D1Database, sessionId: string): Promise<void> {
  await db.prepare('DELETE FROM sessions_auth WHERE id = ?').bind(sessionId).run();
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/auth/session.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth/session.ts tests/auth/session.test.ts
git commit -m "feat: add D1-backed auth session helpers"
```

---

### Task 6: Login routes + requireAuth middleware

**Files:**
- Create: `src/views/layout.tsx`
- Create: `src/auth/middleware.ts`
- Create: `src/auth/routes.tsx`
- Modify: `src/index.ts`
- Test: `tests/auth/routes.test.ts`

**Interfaces:**
- Consumes: `hashPin`/`verifyPin` (Task 3), `createSession`/`validateSession`/`deleteSession` (Task 5), `Env` (Task 1).
- Produces: `Layout` component (`src/views/layout.tsx`), consumed by every later `routes.tsx` file. `requireAuth` middleware and `AuthedVars` type (`{ userId: number }`), consumed by Tasks 9, 11, 13, 16.

- [ ] **Step 1: Create `src/views/layout.tsx`**

```tsx
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
```

- [ ] **Step 2: Write the failing tests — `tests/auth/routes.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { hashPin } from '../../src/auth/pin';

async function seedUser(name: string, pin: string) {
  const hash = await hashPin(pin);
  const row = await env.DB.prepare(
    'INSERT INTO users (name, pin_hash, created_at) VALUES (?, ?, ?) RETURNING id'
  ).bind(name, hash, Date.now()).first<{ id: number }>();
  return row!.id;
}

describe('login routes', () => {
  it('lists users on GET /login', async () => {
    await seedUser('Alice', '1111');
    const res = await SELF.fetch('http://local/login');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Alice');
  });

  it('logs in with the correct pin and sets a session cookie', async () => {
    const userId = await seedUser('Bob', '2222');
    const res = await SELF.fetch(`http://local/login/${userId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'pin=2222',
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('set-cookie')).toContain('kinexus_session=');
  });

  it('rejects an incorrect pin', async () => {
    const userId = await seedUser('Carol', '3333');
    const res = await SELF.fetch(`http://local/login/${userId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'pin=0000',
      redirect: 'manual',
    });
    expect(res.status).toBe(401);
  });

  it('locks out after 5 failed attempts', async () => {
    const userId = await seedUser('Dave', '4444');
    for (let i = 0; i < 5; i++) {
      await SELF.fetch(`http://local/login/${userId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'pin=0000',
      });
    }
    const res = await SELF.fetch(`http://local/login/${userId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'pin=4444', // even the CORRECT pin should be rejected while locked
    });
    expect(res.status).toBe(429);
  });

  it('redirects unauthenticated requests to /login', async () => {
    const res = await SELF.fetch('http://local/', { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('skips straight to the pin screen when a user is remembered on this device', async () => {
    const userId = await seedUser('Erin', '5555');
    const visitRes = await SELF.fetch(`http://local/login/${userId}`);
    const remembered = visitRes.headers.get('set-cookie')!.split(';')[0];

    const res = await SELF.fetch('http://local/login', {
      headers: { cookie: remembered },
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`/login/${userId}`);
  });

  it('"trocar usuário" (?trocar=1) shows the full list even when a user is remembered', async () => {
    const userId = await seedUser('Frank', '6666');
    const visitRes = await SELF.fetch(`http://local/login/${userId}`);
    const remembered = visitRes.headers.get('set-cookie')!.split(';')[0];

    const res = await SELF.fetch('http://local/login?trocar=1', { headers: { cookie: remembered } });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Frank');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/auth/routes.test.ts`
Expected: FAIL (route `/login` doesn't exist — 404s)

- [ ] **Step 4: Create `src/auth/middleware.ts`**

```typescript
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { validateSession } from './session';
import type { Env } from '../types';

export interface AuthedVars {
  userId: number;
}

export const requireAuth: MiddlewareHandler<{ Bindings: Env; Variables: AuthedVars }> = async (c, next) => {
  const sessionId = getCookie(c, 'kinexus_session');
  if (!sessionId) return c.redirect('/login');

  const session = await validateSession(c.env.DB, sessionId);
  if (!session) return c.redirect('/login');

  c.set('userId', session.userId);
  await next();
};
```

- [ ] **Step 5: Create `src/auth/routes.tsx`**

```tsx
import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { verifyPin } from './pin';
import { createSession } from './session';
import { Layout } from '../views/layout';
import type { Env } from '../types';

const MAX_ATTEMPTS = 5;
const LOCK_MS = 30_000;

export const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.get('/', async c => {
  const wantsToSwitch = c.req.query('trocar');

  if (!wantsToSwitch) {
    const remembered = getCookie(c, 'kinexus_remembered_user');
    if (remembered) return c.redirect(`/login/${remembered}`);
  } else {
    deleteCookie(c, 'kinexus_remembered_user', { path: '/' });
  }

  const { results: users } = await c.env.DB.prepare('SELECT id, name FROM users ORDER BY name')
    .all<{ id: number; name: string }>();

  return c.html(
    <Layout title="Entrar">
      <h1>Quem está treinando?</h1>
      <ul>
        {(users ?? []).map(u => (
          <li>
            <a href={`/login/${u.id}`}>{u.name}</a>
          </li>
        ))}
      </ul>
    </Layout>
  );
});

authRoutes.get('/:userId', async c => {
  const userId = Number(c.req.param('userId'));
  const user = await c.env.DB.prepare('SELECT id, name FROM users WHERE id = ?')
    .bind(userId)
    .first<{ id: number; name: string }>();

  if (!user) return c.notFound();

  setCookie(c, 'kinexus_remembered_user', String(user.id), {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  return c.html(
    <Layout title={`Entrar — ${user.name}`}>
      <h1>Olá, {user.name}</h1>
      <form method="post" action={`/login/${user.id}`}>
        <input type="password" name="pin" inputmode="numeric" maxlength={4} autofocus />
        <button type="submit">Entrar</button>
      </form>
      <a href="/login?trocar=1">Trocar usuário</a>
    </Layout>
  );
});

authRoutes.post('/:userId', async c => {
  const userId = Number(c.req.param('userId'));
  const body = await c.req.parseBody();
  const pin = String(body.pin ?? '');

  const user = await c.env.DB.prepare(
    'SELECT id, name, pin_hash as pinHash, failed_pin_attempts as failedAttempts, locked_until as lockedUntil FROM users WHERE id = ?'
  ).bind(userId).first<{
    id: number;
    name: string;
    pinHash: string;
    failedAttempts: number;
    lockedUntil: number | null;
  }>();

  if (!user) return c.notFound();

  if (user.lockedUntil && user.lockedUntil > Date.now()) {
    return c.html(<Layout title="Entrar"><p>Muitas tentativas. Tente novamente em instantes.</p></Layout>, 429);
  }

  const valid = await verifyPin(pin, user.pinHash);
  if (!valid) {
    const attempts = user.failedAttempts + 1;
    const lockedUntil = attempts >= MAX_ATTEMPTS ? Date.now() + LOCK_MS : null;
    await c.env.DB.prepare('UPDATE users SET failed_pin_attempts = ?, locked_until = ? WHERE id = ?')
      .bind(lockedUntil ? 0 : attempts, lockedUntil, userId)
      .run();
    return c.html(<Layout title="Entrar"><p>PIN incorreto.</p></Layout>, 401);
  }

  await c.env.DB.prepare('UPDATE users SET failed_pin_attempts = 0, locked_until = NULL WHERE id = ?')
    .bind(userId)
    .run();

  const session = await createSession(c.env.DB, userId);
  setCookie(c, 'kinexus_session', session.id, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    expires: new Date(session.expiresAt),
  });

  return c.redirect('/');
});
```

- [ ] **Step 6: Wire routes into `src/index.ts`**

```typescript
import { Hono } from 'hono';
import { deleteCookie } from 'hono/cookie';
import type { Env } from './types';
import { authRoutes } from './auth/routes';
import { requireAuth, type AuthedVars } from './auth/middleware';

const app = new Hono<{ Bindings: Env; Variables: AuthedVars }>();

app.get('/health', c => c.text('ok'));

app.route('/login', authRoutes);

app.post('/logout', c => {
  deleteCookie(c, 'kinexus_session', { path: '/' });
  deleteCookie(c, 'kinexus_remembered_user', { path: '/' });
  return c.redirect('/login');
});

app.use('*', requireAuth);

app.get('/', c => c.text(`Logged in as user ${c.get('userId')}`)); // replaced by Task 16

export default app;
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- tests/auth/routes.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/views/layout.tsx src/auth/middleware.ts src/auth/routes.tsx src/index.ts tests/auth/routes.test.ts
git commit -m "feat: add PIN login flow with lockout and session cookie"
```

---

### Task 7: Exercise name matching

**Files:**
- Create: `src/exercises/match.ts`
- Test: `tests/exercises/match.test.ts`

**Interfaces:**
- Produces: `CatalogExercise` type (`{ id: number; name: string }`), `normalize(name: string): string`, `findExactMatch(name, catalog): CatalogExercise | null`, `findClosestMatches(name, catalog, limit?): MatchCandidate[]` — all consumed by Task 10 (import preview).

- [ ] **Step 1: Write the failing tests — `tests/exercises/match.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { normalize, findExactMatch, findClosestMatches, type CatalogExercise } from '../../src/exercises/match';

const catalog: CatalogExercise[] = [
  { id: 1, name: 'Supino reto com barra' },
  { id: 2, name: 'Supino inclinado com halteres' },
  { id: 3, name: 'Agachamento livre' },
];

describe('normalize', () => {
  it('lowercases and strips accents', () => {
    expect(normalize('Supino Reto Com Barra')).toBe('supino reto com barra');
    expect(normalize('Agachamento')).toBe('agachamento');
  });
});

describe('findExactMatch', () => {
  it('matches ignoring case and accents', () => {
    const match = findExactMatch('SUPINO RETO COM BARRA', catalog);
    expect(match?.id).toBe(1);
  });

  it('returns null when nothing matches exactly', () => {
    expect(findExactMatch('Rosca direta', catalog)).toBeNull();
  });
});

describe('findClosestMatches', () => {
  it('ranks the closest name first', () => {
    const results = findClosestMatches('Supino reto com halteres', catalog);
    expect(results[0].exercise.id).toBe(1);
  });

  it('filters out very dissimilar names', () => {
    const results = findClosestMatches('xyz completely unrelated text', catalog);
    expect(results).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/exercises/match.test.ts`
Expected: FAIL with "Cannot find module '../../src/exercises/match'"

- [ ] **Step 3: Create `src/exercises/match.ts`**

```typescript
export interface CatalogExercise {
  id: number;
  name: string;
}

export interface MatchCandidate {
  exercise: CatalogExercise;
  score: number;
}

export function normalize(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function findExactMatch(name: string, catalog: CatalogExercise[]): CatalogExercise | null {
  const target = normalize(name);
  return catalog.find(e => normalize(e.name) === target) ?? null;
}

export function findClosestMatches(name: string, catalog: CatalogExercise[], limit = 3): MatchCandidate[] {
  const target = normalize(name);
  return catalog
    .map(exercise => ({ exercise, score: similarity(target, normalize(exercise.name)) }))
    .filter(c => c.score > 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function similarity(a: string, b: string): number {
  const distance = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - distance / maxLen;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/exercises/match.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/exercises/match.ts tests/exercises/match.test.ts
git commit -m "feat: add accent/case-insensitive exercise name matching"
```

---

### Task 8: Workout import parser

**Files:**
- Create: `src/import/parse.ts`
- Test: `tests/import/parse.test.ts`

**Interfaces:**
- Produces: `ParsedExercise`, `ParsedDay`, `ParsedWorkout`, `ParseResult` types and `parseWorkoutInput(raw: string): ParseResult`, consumed by Task 10 (import routes).

- [ ] **Step 1: Write the failing tests — `tests/import/parse.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { parseWorkoutInput } from '../../src/import/parse';

describe('parseWorkoutInput', () => {
  it('parses a well-formed JSON workout', () => {
    const raw = JSON.stringify({
      plano: 'Hipertrofia Set/26',
      dias: [
        {
          label: 'A',
          foco: 'Peito/Tríceps',
          exercicios: [{ nome: 'Supino reto com barra', series: 4, reps: '8-10' }],
        },
      ],
    });
    const result = parseWorkoutInput(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workout.planName).toBe('Hipertrofia Set/26');
      expect(result.workout.days[0].exercises[0].name).toBe('Supino reto com barra');
    }
  });

  it('rejects JSON missing required fields', () => {
    const result = parseWorkoutInput(JSON.stringify({ foo: 'bar' }));
    expect(result.ok).toBe(false);
  });

  it('parses a semi-structured list', () => {
    const raw = `
Treino A - Peito/Tríceps
Supino reto com barra: 4x8-10
Crucifixo na polia: 3x12-15

Treino B - Costas
Puxada frontal: 4x10
`;
    const result = parseWorkoutInput(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workout.days).toHaveLength(2);
      expect(result.workout.days[0].label).toBe('A');
      expect(result.workout.days[0].exercises).toHaveLength(2);
      expect(result.workout.days[1].exercises[0]).toEqual({
        name: 'Puxada frontal',
        sets: 4,
        reps: '10',
      });
    }
  });

  it('rejects empty input', () => {
    expect(parseWorkoutInput('').ok).toBe(false);
    expect(parseWorkoutInput('   ').ok).toBe(false);
  });

  it('rejects text that matches neither format', () => {
    const result = parseWorkoutInput('Hoje treinei bem e me senti ótimo, foi um dia produtivo na academia.');
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/import/parse.test.ts`
Expected: FAIL with "Cannot find module '../../src/import/parse'"

- [ ] **Step 3: Create `src/import/parse.ts`**

```typescript
export interface ParsedExercise {
  name: string;
  sets: number;
  reps: string;
}

export interface ParsedDay {
  label: string;
  focusName: string;
  exercises: ParsedExercise[];
}

export interface ParsedWorkout {
  planName: string;
  days: ParsedDay[];
}

export type ParseResult = { ok: true; workout: ParsedWorkout } | { ok: false; error: string };

export function parseWorkoutInput(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: 'Cole o conteúdo do treino antes de analisar.' };
  }

  const jsonResult = tryParseJson(trimmed);
  if (jsonResult) return jsonResult;

  const listResult = tryParseList(trimmed);
  if (listResult) return listResult;

  return {
    ok: false,
    error: 'Não consegui reconhecer o formato. Cole um JSON ou uma lista como "Nome do exercício: 4x8-10".',
  };
}

function tryParseJson(text: string): ParseResult | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }

  if (typeof data !== 'object' || data === null) {
    return { ok: false, error: 'JSON reconhecido, mas não é um objeto de treino válido.' };
  }

  const obj = data as Record<string, unknown>;
  if (typeof obj.plano !== 'string' || !Array.isArray(obj.dias)) {
    return { ok: false, error: 'JSON reconhecido, mas faltam os campos "plano" e "dias".' };
  }

  const days: ParsedDay[] = [];
  for (const rawDay of obj.dias) {
    if (typeof rawDay !== 'object' || rawDay === null) {
      return { ok: false, error: 'Cada item de "dias" precisa ser um objeto com label, foco e exercicios.' };
    }
    const d = rawDay as Record<string, unknown>;
    if (typeof d.label !== 'string' || typeof d.foco !== 'string' || !Array.isArray(d.exercicios)) {
      return { ok: false, error: 'Cada dia precisa de "label", "foco" e "exercicios".' };
    }

    const exercises: ParsedExercise[] = [];
    for (const rawEx of d.exercicios) {
      if (typeof rawEx !== 'object' || rawEx === null) {
        return { ok: false, error: `Cada exercício em "${d.label}" precisa de nome, series e reps.` };
      }
      const e = rawEx as Record<string, unknown>;
      if (typeof e.nome !== 'string' || typeof e.series !== 'number' || typeof e.reps !== 'string') {
        return {
          ok: false,
          error: `Exercício inválido em "${d.label}": precisa de nome (texto), series (número) e reps (texto).`,
        };
      }
      exercises.push({ name: e.nome, sets: e.series, reps: e.reps });
    }

    days.push({ label: d.label, focusName: d.foco, exercises });
  }

  return { ok: true, workout: { planName: obj.plano, days } };
}

const DAY_HEADER_RE = /^treino\s+([a-z0-9]+)\s*-\s*(.+)$/i;
const EXERCISE_RE = /^(.+?):\s*(\d+)\s*x\s*([\d-]+)\s*$/i;

function tryParseList(text: string): ParseResult | null {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  const days: ParsedDay[] = [];
  let current: ParsedDay | null = null;
  let matchedAnyLine = false;

  for (const line of lines) {
    const headerMatch = line.match(DAY_HEADER_RE);
    if (headerMatch) {
      matchedAnyLine = true;
      current = { label: headerMatch[1].toUpperCase(), focusName: headerMatch[2].trim(), exercises: [] };
      days.push(current);
      continue;
    }

    const exMatch = line.match(EXERCISE_RE);
    if (exMatch && current) {
      matchedAnyLine = true;
      current.exercises.push({
        name: exMatch[1].trim(),
        sets: parseInt(exMatch[2], 10),
        reps: exMatch[3].trim(),
      });
    }
  }

  if (!matchedAnyLine || days.length === 0) return null;
  return { ok: true, workout: { planName: 'Treino importado', days } };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/import/parse.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/import/parse.ts tests/import/parse.test.ts
git commit -m "feat: add JSON and semi-structured list workout parser"
```

Document the expected JSON schema for the user (they instruct their AI to produce it):

```json
{
  "plano": "Nome da planilha",
  "dias": [
    {
      "label": "A",
      "foco": "Peito/Tríceps",
      "exercicios": [{ "nome": "Supino reto com barra", "series": 4, "reps": "8-10" }]
    }
  ]
}
```

---

### Task 9: Workouts repo (persist + query)

**Files:**
- Create: `src/workouts/repo.ts`
- Test: `tests/workouts/repo.test.ts`

**Interfaces:**
- Consumes: `env.DB` (Task 2 schema).
- Produces: `ResolvedExercise`, `ResolvedDay`, `ResolvedWorkout`, `ActiveDay`, `ActivePlan`, `DayExercise` types; `persistImportedPlan(db, userId, workout): Promise<number>`, `getActivePlan(db, userId): Promise<ActivePlan | null>`, `getDayExercises(db, workoutDayId): Promise<DayExercise[]>` — consumed by Task 10 (import confirm), Task 11 (workouts routes), Task 16 (dashboard routes).

- [ ] **Step 1: Write the failing tests — `tests/workouts/repo.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { persistImportedPlan, getActivePlan, getDayExercises, type ResolvedWorkout } from '../../src/workouts/repo';

let userId: number;

beforeEach(async () => {
  const row = await env.DB.prepare(
    "INSERT INTO users (name, pin_hash, created_at) VALUES (?, 'x', ?) RETURNING id"
  ).bind(`user-${Math.random()}`, Date.now()).first<{ id: number }>();
  userId = row!.id;
});

const sampleWorkout: ResolvedWorkout = {
  planName: 'Plano Teste',
  days: [
    {
      label: 'A',
      focusName: 'Peito',
      exercises: [
        { exerciseId: null, customName: 'Supino reto com barra', sets: 4, reps: '8-10', youtubeUrl: null },
      ],
    },
  ],
};

describe('persistImportedPlan + getActivePlan', () => {
  it('persists a plan and makes it the active one', async () => {
    await persistImportedPlan(env.DB, userId, sampleWorkout);

    const active = await getActivePlan(env.DB, userId);
    expect(active?.name).toBe('Plano Teste');
    expect(active?.days).toHaveLength(1);
    expect(active?.days[0].label).toBe('A');
  });

  it('deactivates the previous plan when a new one is imported', async () => {
    const firstId = await persistImportedPlan(env.DB, userId, sampleWorkout);
    await persistImportedPlan(env.DB, userId, { ...sampleWorkout, planName: 'Plano Novo' });

    const active = await getActivePlan(env.DB, userId);
    expect(active?.name).toBe('Plano Novo');

    const oldPlan = await env.DB.prepare('SELECT is_active FROM workout_plans WHERE id = ?')
      .bind(firstId)
      .first<{ is_active: number }>();
    expect(oldPlan?.is_active).toBe(0);
  });

  it('returns null when the user has no active plan', async () => {
    expect(await getActivePlan(env.DB, userId)).toBeNull();
  });
});

describe('getDayExercises', () => {
  it('resolves catalog exercise name over custom name when both could apply', async () => {
    const exerciseRow = await env.DB.prepare(
      "INSERT INTO exercises (name, muscle_group) VALUES ('Supino reto com barra', 'Peito') RETURNING id"
    ).first<{ id: number }>();

    await persistImportedPlan(env.DB, userId, {
      planName: 'Plano Teste 2',
      days: [
        {
          label: 'A',
          focusName: 'Peito',
          exercises: [
            { exerciseId: exerciseRow!.id, customName: null, sets: 4, reps: '8-10', youtubeUrl: null },
          ],
        },
      ],
    });

    const plan = await getActivePlan(env.DB, userId);
    const exercises = await getDayExercises(env.DB, plan!.days[0].id);

    expect(exercises).toHaveLength(1);
    expect(exercises[0].name).toBe('Supino reto com barra');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/workouts/repo.test.ts`
Expected: FAIL with "Cannot find module '../../src/workouts/repo'"

- [ ] **Step 3: Create `src/workouts/repo.ts`**

```typescript
export interface ResolvedExercise {
  exerciseId: number | null;
  customName: string | null;
  sets: number;
  reps: string;
  youtubeUrl: string | null;
}

export interface ResolvedDay {
  label: string;
  focusName: string;
  exercises: ResolvedExercise[];
}

export interface ResolvedWorkout {
  planName: string;
  days: ResolvedDay[];
}

export interface ActiveDay {
  id: number;
  label: string;
  focusName: string;
  dayOrder: number;
}

export interface ActivePlan {
  id: number;
  name: string;
  days: ActiveDay[];
}

export interface DayExercise {
  id: number;
  name: string;
  sets: number;
  reps: string;
  garminImageUrl: string | null;
  garminVideoUrl: string | null;
  youtubeUrl: string | null;
}

export async function persistImportedPlan(
  db: D1Database,
  userId: number,
  workout: ResolvedWorkout
): Promise<number> {
  await db.prepare('UPDATE workout_plans SET is_active = 0 WHERE user_id = ? AND is_active = 1')
    .bind(userId)
    .run();

  const planRow = await db.prepare(
    'INSERT INTO workout_plans (user_id, name, created_at, is_active) VALUES (?, ?, ?, 1) RETURNING id'
  ).bind(userId, workout.planName, Date.now()).first<{ id: number }>();
  const planId = planRow!.id;

  for (let dayIndex = 0; dayIndex < workout.days.length; dayIndex++) {
    const day = workout.days[dayIndex];
    const dayRow = await db.prepare(
      'INSERT INTO workout_days (plan_id, label, focus_name, day_order) VALUES (?, ?, ?, ?) RETURNING id'
    ).bind(planId, day.label, day.focusName, dayIndex).first<{ id: number }>();
    const dayId = dayRow!.id;

    for (let exIndex = 0; exIndex < day.exercises.length; exIndex++) {
      const ex = day.exercises[exIndex];
      await db.prepare(
        `INSERT INTO workout_exercises
         (workout_day_id, exercise_id, custom_name, sets, reps, exercise_order, youtube_url)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(dayId, ex.exerciseId, ex.customName, ex.sets, ex.reps, exIndex, ex.youtubeUrl).run();
    }
  }

  return planId;
}

export async function getActivePlan(db: D1Database, userId: number): Promise<ActivePlan | null> {
  const plan = await db.prepare('SELECT id, name FROM workout_plans WHERE user_id = ? AND is_active = 1 LIMIT 1')
    .bind(userId)
    .first<{ id: number; name: string }>();

  if (!plan) return null;

  const { results: days } = await db.prepare(
    'SELECT id, label, focus_name as focusName, day_order as dayOrder FROM workout_days WHERE plan_id = ? ORDER BY day_order'
  ).bind(plan.id).all<ActiveDay>();

  return { id: plan.id, name: plan.name, days: days ?? [] };
}

export async function getDayExercises(db: D1Database, workoutDayId: number): Promise<DayExercise[]> {
  const { results } = await db.prepare(
    `SELECT
       we.id,
       COALESCE(e.name, we.custom_name) as name,
       we.sets,
       we.reps,
       e.garmin_image_url as garminImageUrl,
       e.garmin_video_url as garminVideoUrl,
       we.youtube_url as youtubeUrl
     FROM workout_exercises we
     LEFT JOIN exercises e ON e.id = we.exercise_id
     WHERE we.workout_day_id = ?
     ORDER BY we.exercise_order`
  ).bind(workoutDayId).all<DayExercise>();

  return results ?? [];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/workouts/repo.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/workouts/repo.ts tests/workouts/repo.test.ts
git commit -m "feat: add workout plan persistence and active-plan queries"
```

---

### Task 10: Import routes (paste → preview → confirm)

**Files:**
- Create: `src/import/routes.tsx`
- Modify: `src/index.ts`
- Test: `tests/import/routes.test.ts`

**Interfaces:**
- Consumes: `parseWorkoutInput` (Task 8), `findExactMatch`/`findClosestMatches`/`CatalogExercise` (Task 7), `persistImportedPlan`/`ResolvedWorkout` (Task 9), `Layout` (Task 6), `AuthedVars` (Task 6).
- Produces: mounted at `/importar`, consumed only by `src/index.ts`.

- [ ] **Step 1: Write the failing tests — `tests/import/routes.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { hashPin } from '../../src/auth/pin';

let sessionCookie: string;
let userId: number;

beforeEach(async () => {
  const hash = await hashPin('1234');
  const userRow = await env.DB.prepare(
    "INSERT INTO users (name, pin_hash, created_at) VALUES (?, ?, ?) RETURNING id"
  ).bind(`import-user-${Math.random()}`, hash, Date.now()).first<{ id: number }>();
  userId = userRow!.id;

  const loginRes = await SELF.fetch(`http://local/login/${userId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'pin=1234',
    redirect: 'manual',
  });
  sessionCookie = loginRes.headers.get('set-cookie')!.split(';')[0];
});

describe('import routes', () => {
  it('shows an error for unparseable input, without saving anything', async () => {
    const res = await SELF.fetch('http://local/importar/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: sessionCookie },
      body: 'raw=' + encodeURIComponent('texto solto sem nenhum padrão reconhecível'),
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Não consegui reconhecer');

    const plans = await env.DB.prepare('SELECT COUNT(*) as n FROM workout_plans WHERE user_id = ?')
      .bind(userId)
      .first<{ n: number }>();
    expect(plans?.n).toBe(0);
  });

  it('previews a valid JSON workout with an exact catalog match', async () => {
    await env.DB.prepare("INSERT INTO exercises (name, muscle_group) VALUES ('Supino reto com barra', 'Peito')").run();

    const raw = JSON.stringify({
      plano: 'Plano A',
      dias: [{ label: 'A', foco: 'Peito', exercicios: [{ nome: 'Supino reto com barra', series: 4, reps: '8-10' }] }],
    });

    const res = await SELF.fetch('http://local/importar/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: sessionCookie },
      body: 'raw=' + encodeURIComponent(raw),
    });

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Supino reto com barra');
    expect(html).not.toContain('resolve_'); // matched exactly, no resolution needed
  });

  it('confirms a previewed plan and persists it', async () => {
    const raw = JSON.stringify({
      plano: 'Plano B',
      dias: [{ label: 'A', foco: 'Peito', exercicios: [{ nome: 'Exercício inexistente', series: 3, reps: '10' }] }],
    });

    const previewRes = await SELF.fetch('http://local/importar/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: sessionCookie },
      body: 'raw=' + encodeURIComponent(raw),
    });
    const previewHtml = await previewRes.text();
    const workoutJson = previewHtml.match(/name="workout" value="([^"]+)"/)?.[1];
    expect(workoutJson).toBeTruthy();

    const confirmBody = new URLSearchParams();
    confirmBody.set('workout', decodeHtmlEntities(workoutJson!));
    confirmBody.set('resolve_0_0', 'avulso');

    const confirmRes = await SELF.fetch('http://local/importar/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: sessionCookie },
      body: confirmBody.toString(),
      redirect: 'manual',
    });

    expect(confirmRes.status).toBe(302);

    const plan = await env.DB.prepare('SELECT name FROM workout_plans WHERE user_id = ? AND is_active = 1')
      .bind(userId)
      .first<{ name: string }>();
    expect(plan?.name).toBe('Plano B');
  });
});

function decodeHtmlEntities(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/import/routes.test.ts`
Expected: FAIL (route `/importar/preview` doesn't exist — 404s)

- [ ] **Step 3: Create `src/import/routes.tsx`**

```tsx
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
    <Layout title="Importar treino">
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
      <Layout title="Importar treino">
        <ImportForm raw={raw} error={result.error} />
      </Layout>
    );
  }

  const { results: catalog } = await c.env.DB.prepare('SELECT id, name FROM exercises').all<CatalogExercise>();
  const preview = buildPreview(result.workout, catalog ?? []);

  return c.html(
    <Layout title="Revisar importação">
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
    <div>
      <h1>Importar treino</h1>
      {error && <p role="alert">{error}</p>}
      <form method="post" action="/importar/preview">
        <textarea name="raw" rows={12} cols={60}>
          {raw ?? ''}
        </textarea>
        <button type="submit">Analisar treino</button>
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
          <section>
            <h2>
              Treino {day.label} — {day.focusName}
            </h2>
            <ul>
              {day.exercises.map((ex, exIndex) => (
                <li>
                  {ex.name} — {ex.sets}x{ex.reps}
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
          </section>
        ))}
        <button type="submit">Confirmar e salvar planilha</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Wire into `src/index.ts`**

Add, after `app.use('*', requireAuth);`:

```typescript
import { importRoutes } from './import/routes';
// ...
app.route('/importar', importRoutes);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/import/routes.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/import/routes.tsx src/index.ts tests/import/routes.test.ts
git commit -m "feat: add import paste/preview/confirm flow"
```

---

### Task 11: Workouts routes ("Meus treinos")

**Files:**
- Create: `src/workouts/routes.tsx`
- Modify: `src/index.ts`
- Test: `tests/workouts/routes.test.ts`

**Interfaces:**
- Consumes: `getActivePlan`, `getDayExercises` (Task 9), `Layout` (Task 6), `AuthedVars` (Task 6).
- Produces: mounted at `/treinos`, consumed only by `src/index.ts`.

- [ ] **Step 1: Write the failing tests — `tests/workouts/routes.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { hashPin } from '../../src/auth/pin';
import { persistImportedPlan } from '../../src/workouts/repo';

let sessionCookie: string;
let userId: number;

beforeEach(async () => {
  const hash = await hashPin('1234');
  const userRow = await env.DB.prepare(
    "INSERT INTO users (name, pin_hash, created_at) VALUES (?, ?, ?) RETURNING id"
  ).bind(`workouts-user-${Math.random()}`, hash, Date.now()).first<{ id: number }>();
  userId = userRow!.id;

  const loginRes = await SELF.fetch(`http://local/login/${userId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'pin=1234',
    redirect: 'manual',
  });
  sessionCookie = loginRes.headers.get('set-cookie')!.split(';')[0];
});

describe('workouts routes', () => {
  it('shows a message when there is no active plan', async () => {
    const res = await SELF.fetch('http://local/treinos', { headers: { cookie: sessionCookie } });
    expect(await res.text()).toContain('Nenhuma planilha ativa');
  });

  it('shows the active plan with day tabs and exercises', async () => {
    await persistImportedPlan(env.DB, userId, {
      planName: 'Plano X',
      days: [
        { label: 'A', focusName: 'Peito', exercises: [{ exerciseId: null, customName: 'Supino', sets: 4, reps: '8-10', youtubeUrl: null }] },
        { label: 'B', focusName: 'Costas', exercises: [{ exerciseId: null, customName: 'Remada', sets: 3, reps: '10', youtubeUrl: null }] },
      ],
    });

    const res = await SELF.fetch('http://local/treinos', { headers: { cookie: sessionCookie } });
    const html = await res.text();
    expect(html).toContain('Treino A');
    expect(html).toContain('Treino B');
    expect(html).toContain('Supino');
  });

  it('shows a YouTube link when the imported exercise has one, and falls back to the Garmin image otherwise', async () => {
    const exerciseRow = await env.DB.prepare(
      "INSERT INTO exercises (name, muscle_group, garmin_image_url) VALUES ('Supino reto com barra', 'Peito', 'https://connect.garmin.com/img.jpg') RETURNING id"
    ).first<{ id: number }>();

    await persistImportedPlan(env.DB, userId, {
      planName: 'Plano Y',
      days: [
        {
          label: 'A',
          focusName: 'Peito',
          exercises: [
            { exerciseId: exerciseRow!.id, customName: null, sets: 4, reps: '8-10', youtubeUrl: 'https://youtube.com/watch?v=abc123' },
            { exerciseId: null, customName: 'Exercício sem nenhuma referência', sets: 3, reps: '12', youtubeUrl: null },
          ],
        },
      ],
    });

    const res = await SELF.fetch('http://local/treinos', { headers: { cookie: sessionCookie } });
    const html = await res.text();
    expect(html).toContain('https://youtube.com/watch?v=abc123');
    expect(html).toContain('Sem referência disponível');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/workouts/routes.test.ts`
Expected: FAIL (route `/treinos` doesn't exist — 404s)

- [ ] **Step 3: Create `src/workouts/routes.tsx`**

```tsx
import { Hono } from 'hono';
import { getActivePlan, getDayExercises, type DayExercise } from './repo';
import { Layout } from '../views/layout';
import type { Env } from '../types';
import type { AuthedVars } from '../auth/middleware';

export const workoutsRoutes = new Hono<{ Bindings: Env; Variables: AuthedVars }>();

workoutsRoutes.get('/', async c => {
  const userId = c.get('userId');
  const plan = await getActivePlan(c.env.DB, userId);

  if (!plan || plan.days.length === 0) {
    return c.html(
      <Layout title="Meus treinos">
        <p>
          Nenhuma planilha ativa. <a href="/importar">Importar treino</a>.
        </p>
      </Layout>
    );
  }

  const dayIdParam = c.req.query('dia');
  const activeDay = dayIdParam ? plan.days.find(d => String(d.id) === dayIdParam) ?? plan.days[0] : plan.days[0];
  const exercises = await getDayExercises(c.env.DB, activeDay.id);

  return c.html(
    <Layout title="Meus treinos">
      <h1>{plan.name}</h1>
      <nav>
        {plan.days.map(d => (
          <a href={`/treinos?dia=${d.id}`}>Treino {d.label}</a>
        ))}
      </nav>
      <h2>{activeDay.focusName}</h2>
      <ul>
        {exercises.map(ex => (
          <li>
            <ExerciseReference exercise={ex} />
            {ex.name} — {ex.sets}x{ex.reps}
          </li>
        ))}
      </ul>
    </Layout>
  );
});

function ExerciseReference({ exercise }: { exercise: DayExercise }) {
  if (exercise.youtubeUrl) {
    return (
      <a href={exercise.youtubeUrl} target="_blank" rel="noreferrer">
        ▶ Assistir no YouTube
      </a>
    );
  }
  if (exercise.garminImageUrl) {
    return (
      <img
        src={exercise.garminImageUrl}
        alt={exercise.name}
        width={56}
        height={56}
        onerror="this.replaceWith(document.createTextNode('Sem referência disponível'))"
      />
    );
  }
  return <span>Sem referência disponível</span>;
}
```

- [ ] **Step 4: Wire into `src/index.ts`**

```typescript
import { workoutsRoutes } from './workouts/routes';
// ...
app.route('/treinos', workoutsRoutes);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/workouts/routes.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/workouts/routes.tsx src/index.ts tests/workouts/routes.test.ts
git commit -m "feat: add Meus Treinos view with day tabs"
```

---

### Task 12: Sessions repo (check-in/checkout + auto-close)

**Files:**
- Create: `src/sessions/repo.ts`
- Test: `tests/sessions/repo.test.ts`

**Interfaces:**
- Consumes: `env.DB` (Task 2 schema).
- Produces: `WorkoutSession` type, `getOpenSession(db, userId)`, `getLastSession(db, userId)`, `startSession(db, userId, workoutDayId)`, `endSession(db, sessionId)`, `getTrainedDaysInMonth(db, userId, year, month): Promise<string[]>` — consumed by Task 13 (sessions routes) and Task 16 (dashboard routes).

- [ ] **Step 1: Write the failing tests — `tests/sessions/repo.test.ts`**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { startSession, endSession, getOpenSession, getLastSession, getTrainedDaysInMonth } from '../../src/sessions/repo';

let userId: number;

beforeEach(async () => {
  const row = await env.DB.prepare(
    "INSERT INTO users (name, pin_hash, created_at) VALUES (?, 'x', ?) RETURNING id"
  ).bind(`session-user-${Math.random()}`, Date.now()).first<{ id: number }>();
  userId = row!.id;
});

describe('startSession / getOpenSession / endSession', () => {
  it('starts a session and finds it as open', async () => {
    const session = await startSession(env.DB, userId, null);
    const open = await getOpenSession(env.DB, userId);
    expect(open?.id).toBe(session.id);
    expect(open?.endedAt).toBeNull();
  });

  it('reuses the existing open session instead of creating a new one', async () => {
    const first = await startSession(env.DB, userId, null);
    const second = await startSession(env.DB, userId, null);
    expect(second.id).toBe(first.id);

    const { results } = await env.DB.prepare('SELECT COUNT(*) as n FROM workout_sessions WHERE user_id = ?')
      .bind(userId)
      .all<{ n: number }>();
    expect(results![0].n).toBe(1);
  });

  it('ends a session and it is no longer open', async () => {
    const session = await startSession(env.DB, userId, null);
    await endSession(env.DB, session.id);
    expect(await getOpenSession(env.DB, userId)).toBeNull();

    const row = await env.DB.prepare('SELECT duration_counted as durationCounted FROM workout_sessions WHERE id = ?')
      .bind(session.id)
      .first<{ durationCounted: number }>();
    expect(row?.durationCounted).toBe(1);
  });

  it('auto-closes a session open for more than 5 hours, without counting duration', async () => {
    const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
    const row = await env.DB.prepare(
      'INSERT INTO workout_sessions (user_id, workout_day_id, date, started_at, ended_at, duration_counted) VALUES (?, NULL, ?, ?, NULL, NULL) RETURNING id'
    ).bind(userId, '2026-09-01', sixHoursAgo).first<{ id: number }>();

    expect(await getOpenSession(env.DB, userId)).toBeNull();

    const closed = await env.DB.prepare(
      'SELECT ended_at as endedAt, duration_counted as durationCounted FROM workout_sessions WHERE id = ?'
    ).bind(row!.id).first<{ endedAt: number; durationCounted: number }>();
    expect(closed?.endedAt).toBe(sixHoursAgo + 5 * 60 * 60 * 1000);
    expect(closed?.durationCounted).toBe(0);
  });
});

describe('getTrainedDaysInMonth', () => {
  it('includes days from auto-closed sessions', async () => {
    await env.DB.prepare(
      "INSERT INTO workout_sessions (user_id, workout_day_id, date, started_at, ended_at, duration_counted) VALUES (?, NULL, '2026-09-15', 0, 100, 0)"
    ).bind(userId).run();

    const days = await getTrainedDaysInMonth(env.DB, userId, 2026, 9);
    expect(days).toContain('2026-09-15');
  });
});

describe('getLastSession', () => {
  it('returns the most recently started session, whether open or closed', async () => {
    await env.DB.prepare(
      "INSERT INTO workout_sessions (user_id, workout_day_id, date, started_at, ended_at, duration_counted) VALUES (?, 111, '2026-09-10', 1000, 2000, 1)"
    ).bind(userId).run();
    await env.DB.prepare(
      "INSERT INTO workout_sessions (user_id, workout_day_id, date, started_at, ended_at, duration_counted) VALUES (?, 222, '2026-09-20', 5000, 6000, 1)"
    ).bind(userId).run();

    const last = await getLastSession(env.DB, userId);
    expect(last?.workoutDayId).toBe(222);
  });

  it('returns null when the user has never trained', async () => {
    expect(await getLastSession(env.DB, userId)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/sessions/repo.test.ts`
Expected: FAIL with "Cannot find module '../../src/sessions/repo'"

- [ ] **Step 3: Create `src/sessions/repo.ts`**

```typescript
const AUTO_CLOSE_MS = 5 * 60 * 60 * 1000; // 5 hours

export interface WorkoutSession {
  id: number;
  userId: number;
  workoutDayId: number | null;
  date: string;
  startedAt: number;
  endedAt: number | null;
  durationCounted: boolean | null;
}

export async function getOpenSession(db: D1Database, userId: number): Promise<WorkoutSession | null> {
  const row = await db.prepare(
    `SELECT id, user_id as userId, workout_day_id as workoutDayId, date,
            started_at as startedAt, ended_at as endedAt, duration_counted as durationCounted
     FROM workout_sessions
     WHERE user_id = ? AND ended_at IS NULL
     ORDER BY started_at DESC
     LIMIT 1`
  ).bind(userId).first<WorkoutSession>();

  if (!row) return null;

  if (Date.now() - row.startedAt > AUTO_CLOSE_MS) {
    await db.prepare('UPDATE workout_sessions SET ended_at = ?, duration_counted = 0 WHERE id = ?')
      .bind(row.startedAt + AUTO_CLOSE_MS, row.id)
      .run();
    return null;
  }

  return row;
}

export async function startSession(
  db: D1Database,
  userId: number,
  workoutDayId: number | null
): Promise<WorkoutSession> {
  const existing = await getOpenSession(db, userId);
  if (existing) return existing;

  const now = Date.now();
  const date = new Date(now).toISOString().slice(0, 10);
  const row = await db.prepare(
    'INSERT INTO workout_sessions (user_id, workout_day_id, date, started_at, ended_at, duration_counted) VALUES (?, ?, ?, ?, NULL, NULL) RETURNING id'
  ).bind(userId, workoutDayId, date, now).first<{ id: number }>();

  return { id: row!.id, userId, workoutDayId, date, startedAt: now, endedAt: null, durationCounted: null };
}

export async function endSession(db: D1Database, sessionId: number): Promise<void> {
  await db.prepare('UPDATE workout_sessions SET ended_at = ?, duration_counted = 1 WHERE id = ? AND ended_at IS NULL')
    .bind(Date.now(), sessionId)
    .run();
}

export async function getTrainedDaysInMonth(
  db: D1Database,
  userId: number,
  year: number,
  month: number
): Promise<string[]> {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const { results } = await db.prepare('SELECT DISTINCT date FROM workout_sessions WHERE user_id = ? AND date LIKE ?')
    .bind(userId, `${prefix}-%`)
    .all<{ date: string }>();
  return (results ?? []).map(r => r.date);
}

export async function getLastSession(db: D1Database, userId: number): Promise<WorkoutSession | null> {
  const row = await db.prepare(
    `SELECT id, user_id as userId, workout_day_id as workoutDayId, date,
            started_at as startedAt, ended_at as endedAt, duration_counted as durationCounted
     FROM workout_sessions
     WHERE user_id = ?
     ORDER BY started_at DESC
     LIMIT 1`
  ).bind(userId).first<WorkoutSession>();

  return row ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/sessions/repo.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sessions/repo.ts tests/sessions/repo.test.ts
git commit -m "feat: add workout session check-in/checkout with 5h auto-close"
```

**Note for Task 16:** the A/B/C rotation must advance based on the **last trained day**, whether that session is still open or already closed — use `getLastSession`, not `getOpenSession`, to compute it. `getOpenSession` is only for deciding whether to render "Iniciar treino" or "Finalizar treino".

---

### Task 13: Sessions routes (start/end endpoints)

**Files:**
- Create: `src/sessions/routes.ts`
- Modify: `src/index.ts`
- Test: `tests/sessions/routes.test.ts`

**Interfaces:**
- Consumes: `startSession`, `endSession`, `getOpenSession` (Task 12), `AuthedVars` (Task 6).
- Produces: mounted at `/sessoes`, consumed only by `src/index.ts`.

- [ ] **Step 1: Write the failing tests — `tests/sessions/routes.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { hashPin } from '../../src/auth/pin';

let sessionCookie: string;
let userId: number;

beforeEach(async () => {
  const hash = await hashPin('1234');
  const userRow = await env.DB.prepare(
    "INSERT INTO users (name, pin_hash, created_at) VALUES (?, ?, ?) RETURNING id"
  ).bind(`sessions-route-user-${Math.random()}`, hash, Date.now()).first<{ id: number }>();
  userId = userRow!.id;

  const loginRes = await SELF.fetch(`http://local/login/${userId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'pin=1234',
    redirect: 'manual',
  });
  sessionCookie = loginRes.headers.get('set-cookie')!.split(';')[0];
});

describe('sessions routes', () => {
  it('starts and then ends a session', async () => {
    const startRes = await SELF.fetch('http://local/sessoes/start', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: sessionCookie },
      body: '',
      redirect: 'manual',
    });
    expect(startRes.status).toBe(302);

    const open = await env.DB.prepare('SELECT id FROM workout_sessions WHERE user_id = ? AND ended_at IS NULL')
      .bind(userId)
      .first();
    expect(open).not.toBeNull();

    const endRes = await SELF.fetch('http://local/sessoes/end', {
      method: 'POST',
      headers: { cookie: sessionCookie },
      redirect: 'manual',
    });
    expect(endRes.status).toBe(302);

    const stillOpen = await env.DB.prepare('SELECT id FROM workout_sessions WHERE user_id = ? AND ended_at IS NULL')
      .bind(userId)
      .first();
    expect(stillOpen).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/sessions/routes.test.ts`
Expected: FAIL (route `/sessoes/start` doesn't exist — 404s)

- [ ] **Step 3: Create `src/sessions/routes.ts`**

```typescript
import { Hono } from 'hono';
import { startSession, endSession, getOpenSession } from './repo';
import type { Env } from '../types';
import type { AuthedVars } from '../auth/middleware';

export const sessionsRoutes = new Hono<{ Bindings: Env; Variables: AuthedVars }>();

sessionsRoutes.post('/start', async c => {
  const userId = c.get('userId');
  const body = await c.req.parseBody();
  const workoutDayId = body.workoutDayId ? Number(body.workoutDayId) : null;
  await startSession(c.env.DB, userId, workoutDayId);
  return c.redirect('/');
});

sessionsRoutes.post('/end', async c => {
  const userId = c.get('userId');
  const open = await getOpenSession(c.env.DB, userId);
  if (open) await endSession(c.env.DB, open.id);
  return c.redirect('/');
});
```

- [ ] **Step 4: Wire into `src/index.ts`**

```typescript
import { sessionsRoutes } from './sessions/routes';
// ...
app.route('/sessoes', sessionsRoutes);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/sessions/routes.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/sessions/routes.ts src/index.ts tests/sessions/routes.test.ts
git commit -m "feat: add start/end session endpoints"
```

---

### Task 14: Dashboard calendar computation

**Files:**
- Create: `src/dashboard/calendar.ts`
- Test: `tests/dashboard/calendar.test.ts`

**Interfaces:**
- Produces: `CalendarDay` type, `buildMonthCalendar(year, month, trainedDates, today): CalendarDay[][]` — consumed by Task 16 (dashboard routes).

- [ ] **Step 1: Write the failing tests — `tests/dashboard/calendar.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { buildMonthCalendar } from '../../src/dashboard/calendar';

describe('buildMonthCalendar', () => {
  it('places September 1, 2026 (a Tuesday) in the right column', () => {
    const weeks = buildMonthCalendar(2026, 9, [], new Date('2026-09-28T12:00:00Z'));
    const firstWeek = weeks[0];
    // columns: Sun, Mon, Tue, Wed, Thu, Fri, Sat
    expect(firstWeek[0].inMonth).toBe(false);
    expect(firstWeek[1].inMonth).toBe(false);
    expect(firstWeek[2]).toMatchObject({ day: 1, inMonth: true });
  });

  it('marks trained days', () => {
    const weeks = buildMonthCalendar(2026, 9, ['2026-09-15'], new Date('2026-09-28T12:00:00Z'));
    const day15 = weeks.flat().find(d => d.dateStr === '2026-09-15');
    expect(day15?.trained).toBe(true);
  });

  it('marks today', () => {
    const weeks = buildMonthCalendar(2026, 9, [], new Date('2026-09-28T12:00:00Z'));
    const day28 = weeks.flat().find(d => d.dateStr === '2026-09-28');
    expect(day28?.isToday).toBe(true);
  });

  it('includes every day of the month exactly once', () => {
    const weeks = buildMonthCalendar(2026, 9, [], new Date('2026-09-28T12:00:00Z'));
    const inMonthDays = weeks.flat().filter(d => d.inMonth).map(d => d.day);
    expect(inMonthDays).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/dashboard/calendar.test.ts`
Expected: FAIL with "Cannot find module '../../src/dashboard/calendar'"

- [ ] **Step 3: Create `src/dashboard/calendar.ts`**

```typescript
export interface CalendarDay {
  day: number;
  dateStr: string;
  trained: boolean;
  isToday: boolean;
  inMonth: boolean;
}

export function buildMonthCalendar(
  year: number,
  month: number,
  trainedDates: string[],
  today: Date
): CalendarDay[][] {
  const trainedSet = new Set(trainedDates);
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startWeekday = firstOfMonth.getUTCDay(); // 0 = Sunday
  const todayStr = today.toISOString().slice(0, 10);

  const cells: CalendarDay[] = [];

  for (let i = 0; i < startWeekday; i++) {
    cells.push({ day: 0, dateStr: '', trained: false, isToday: false, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, dateStr, trained: trainedSet.has(dateStr), isToday: dateStr === todayStr, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ day: 0, dateStr: '', trained: false, isToday: false, inMonth: false });
  }

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/dashboard/calendar.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/dashboard/calendar.ts tests/dashboard/calendar.test.ts
git commit -m "feat: add month calendar grid computation"
```

---

### Task 15: Dashboard next-workout-day computation

**Files:**
- Create: `src/dashboard/next-day.ts`
- Test: `tests/dashboard/next-day.test.ts`

**Interfaces:**
- Produces: `DayRef` type, `computeNextWorkoutDay(days, lastTrainedDayId): DayRef | null` — consumed by Task 16 (dashboard routes).

- [ ] **Step 1: Write the failing tests — `tests/dashboard/next-day.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { computeNextWorkoutDay, type DayRef } from '../../src/dashboard/next-day';

const days: DayRef[] = [
  { id: 1, label: 'A', dayOrder: 0 },
  { id: 2, label: 'B', dayOrder: 1 },
  { id: 3, label: 'C', dayOrder: 2 },
];

describe('computeNextWorkoutDay', () => {
  it('returns the first day when nothing has been trained yet', () => {
    expect(computeNextWorkoutDay(days, null)?.label).toBe('A');
  });

  it('returns the next day in order after the last trained one', () => {
    expect(computeNextWorkoutDay(days, 1)?.label).toBe('B');
  });

  it('wraps around after the last day', () => {
    expect(computeNextWorkoutDay(days, 3)?.label).toBe('A');
  });

  it('falls back to the first day if the last trained day id is unknown (e.g. deleted plan)', () => {
    expect(computeNextWorkoutDay(days, 999)?.label).toBe('A');
  });

  it('returns null for an empty plan', () => {
    expect(computeNextWorkoutDay([], null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/dashboard/next-day.test.ts`
Expected: FAIL with "Cannot find module '../../src/dashboard/next-day'"

- [ ] **Step 3: Create `src/dashboard/next-day.ts`**

```typescript
export interface DayRef {
  id: number;
  label: string;
  dayOrder: number;
}

export function computeNextWorkoutDay(days: DayRef[], lastTrainedDayId: number | null): DayRef | null {
  if (days.length === 0) return null;

  const sorted = [...days].sort((a, b) => a.dayOrder - b.dayOrder);
  if (lastTrainedDayId === null) return sorted[0];

  const lastIndex = sorted.findIndex(d => d.id === lastTrainedDayId);
  if (lastIndex === -1) return sorted[0];

  return sorted[(lastIndex + 1) % sorted.length];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/dashboard/next-day.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/dashboard/next-day.ts tests/dashboard/next-day.test.ts
git commit -m "feat: add A/B/C rotation logic for the next workout day"
```

---

### Task 16: Dashboard route

**Files:**
- Create: `src/dashboard/routes.tsx`
- Modify: `src/index.ts`
- Test: `tests/dashboard/routes.test.ts`

**Interfaces:**
- Consumes: `getActivePlan`, `getDayExercises` (Task 9), `getOpenSession`, `getTrainedDaysInMonth` (Task 12), `buildMonthCalendar` (Task 14), `computeNextWorkoutDay` (Task 15), `Layout` (Task 6), `AuthedVars` (Task 6).
- Produces: mounted at `/` (replaces the placeholder from Task 6, Step 6), consumed only by `src/index.ts`.

- [ ] **Step 1: Write the failing tests — `tests/dashboard/routes.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { hashPin } from '../../src/auth/pin';
import { persistImportedPlan } from '../../src/workouts/repo';

let sessionCookie: string;
let userId: number;

beforeEach(async () => {
  const hash = await hashPin('1234');
  const userRow = await env.DB.prepare(
    "INSERT INTO users (name, pin_hash, created_at) VALUES (?, ?, ?) RETURNING id"
  ).bind(`dashboard-user-${Math.random()}`, hash, Date.now()).first<{ id: number }>();
  userId = userRow!.id;

  const loginRes = await SELF.fetch(`http://local/login/${userId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'pin=1234',
    redirect: 'manual',
  });
  sessionCookie = loginRes.headers.get('set-cookie')!.split(';')[0];
});

describe('dashboard route', () => {
  it('prompts to import when there is no active plan', async () => {
    const res = await SELF.fetch('http://local/', { headers: { cookie: sessionCookie } });
    expect(await res.text()).toContain('Nenhuma planilha ativa');
  });

  it('shows the next workout day and an "Iniciar treino" button', async () => {
    await persistImportedPlan(env.DB, userId, {
      planName: 'Plano Dashboard',
      days: [{ label: 'A', focusName: 'Peito', exercises: [{ exerciseId: null, customName: 'Supino', sets: 4, reps: '8-10', youtubeUrl: null }] }],
    });

    const res = await SELF.fetch('http://local/', { headers: { cookie: sessionCookie } });
    const html = await res.text();
    expect(html).toContain('Treino A');
    expect(html).toContain('Iniciar treino');
  });

  it('shows "Finalizar treino" while a session is open', async () => {
    await persistImportedPlan(env.DB, userId, {
      planName: 'Plano Dashboard 2',
      days: [{ label: 'A', focusName: 'Peito', exercises: [{ exerciseId: null, customName: 'Supino', sets: 4, reps: '8-10', youtubeUrl: null }] }],
    });

    await SELF.fetch('http://local/sessoes/start', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: sessionCookie },
      body: '',
    });

    const res = await SELF.fetch('http://local/', { headers: { cookie: sessionCookie } });
    expect(await res.text()).toContain('Finalizar treino');
  });

  it('advances to the next day in rotation after a session is finished (not just while open)', async () => {
    const planId = await persistImportedPlan(env.DB, userId, {
      planName: 'Plano Rotação',
      days: [
        { label: 'A', focusName: 'Peito', exercises: [{ exerciseId: null, customName: 'Supino', sets: 4, reps: '8-10', youtubeUrl: null }] },
        { label: 'B', focusName: 'Costas', exercises: [{ exerciseId: null, customName: 'Remada', sets: 4, reps: '10', youtubeUrl: null }] },
      ],
    });

    // First visit: nothing trained yet, should show Treino A.
    const before = await SELF.fetch('http://local/', { headers: { cookie: sessionCookie } });
    expect(await before.text()).toContain('Treino A');

    // Start and finish Treino A — pass its real workoutDayId, exactly like the
    // dashboard's hidden form field does, so the rotation has something to advance from.
    const dayA = await env.DB.prepare("SELECT id FROM workout_days WHERE plan_id = ? AND label = 'A'")
      .bind(planId)
      .first<{ id: number }>();

    await SELF.fetch('http://local/sessoes/start', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: sessionCookie },
      body: `workoutDayId=${dayA!.id}`,
    });
    await SELF.fetch('http://local/sessoes/end', { method: 'POST', headers: { cookie: sessionCookie } });

    // No session is open anymore, but the dashboard must still advance to Treino B.
    const after = await SELF.fetch('http://local/', { headers: { cookie: sessionCookie } });
    const afterHtml = await after.text();
    expect(afterHtml).toContain('Treino B');
    expect(afterHtml).toContain('Iniciar treino');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/dashboard/routes.test.ts`
Expected: FAIL (root route still shows the Task 6 placeholder text, not "Nenhuma planilha ativa")

- [ ] **Step 3: Create `src/dashboard/routes.tsx`**

```tsx
import { Hono } from 'hono';
import { getActivePlan, getDayExercises, type DayExercise } from '../workouts/repo';
import { getOpenSession, getLastSession, getTrainedDaysInMonth } from '../sessions/repo';
import { buildMonthCalendar } from './calendar';
import { computeNextWorkoutDay } from './next-day';
import { Layout } from '../views/layout';
import type { Env } from '../types';
import type { AuthedVars } from '../auth/middleware';

export const dashboardRoutes = new Hono<{ Bindings: Env; Variables: AuthedVars }>();

dashboardRoutes.get('/', async c => {
  const userId = c.get('userId');
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const trainedDates = await getTrainedDaysInMonth(c.env.DB, userId, year, month);
  const weeks = buildMonthCalendar(year, month, trainedDates, now);

  const plan = await getActivePlan(c.env.DB, userId);
  const openSession = await getOpenSession(c.env.DB, userId);
  const lastSession = await getLastSession(c.env.DB, userId);

  let nextDay: { id: number; label: string } | null = null;
  let exercises: DayExercise[] = [];

  if (plan && plan.days.length > 0) {
    const lastDayId = lastSession?.workoutDayId ?? null;
    nextDay = computeNextWorkoutDay(
      plan.days.map(d => ({ id: d.id, label: d.label, dayOrder: d.dayOrder })),
      lastDayId
    );
    if (nextDay) exercises = await getDayExercises(c.env.DB, nextDay.id);
  }

  return c.html(
    <Layout title="Kinexus">
      <section>
        <h2>
          Frequência — {month}/{year}
        </h2>
        {weeks.map(week => (
          <div>
            {week.map(day => (
              <span>
                {day.inMonth ? day.day : ''}
                {day.trained ? ' ✓' : ''}
                {day.isToday ? ' (hoje)' : ''}
              </span>
            ))}
          </div>
        ))}
      </section>
      <section>
        {nextDay ? (
          <>
            <h2>Treino {nextDay.label}</h2>
            <ul>
              {exercises.map(ex => (
                <li>
                  {ex.name} — {ex.sets}x{ex.reps}
                </li>
              ))}
            </ul>
            {openSession ? (
              <form method="post" action="/sessoes/end">
                <button type="submit">Finalizar treino</button>
              </form>
            ) : (
              <form method="post" action="/sessoes/start">
                <input type="hidden" name="workoutDayId" value={nextDay.id} />
                <button type="submit">Iniciar treino</button>
              </form>
            )}
          </>
        ) : (
          <p>
            Nenhuma planilha ativa. <a href="/importar">Importar treino</a>.
          </p>
        )}
      </section>
    </Layout>
  );
});
```

- [ ] **Step 4: Replace the placeholder route in `src/index.ts`**

Remove the placeholder `app.get('/', c => c.text(...))` line from Task 6 and replace it with:

```typescript
import { dashboardRoutes } from './dashboard/routes';
// ...
app.route('/', dashboardRoutes);
```

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS (all tests from every task, including this one)

- [ ] **Step 6: Commit**

```bash
git add src/dashboard/routes.tsx src/index.ts tests/dashboard/routes.test.ts
git commit -m "feat: add dashboard with frequency calendar and treino-do-dia card"
```

---

### Task 17: Garmin exercise catalog seed script

**Files:**
- Create: `seed/fetch-garmin-catalog.ts`
- Create (generated output, committed): `migrations/0003_seed_exercises.sql`
- Test: `tests/exercises-seeded.test.ts`

**Interfaces:**
- Produces: rows in `exercises` (Task 2 schema) once the generated migration is applied.

**Context confirmed by hand before writing this task** (so nothing here is a guess):
- Master index: `GET https://connect.garmin.com/web-data/exercises/Exercises.json` → `{ categories: { [categoryCode]: { exercises: { [exerciseCode]: { primaryMuscles: string[], secondaryMuscles: string[] } } } } }`.
- pt-BR display names: `GET https://connect.garmin.com/web-translations/exercise_types/exercise_types_pt-BR.properties` → Java-properties text, lines like `exercise_type_PUSH_UP=Flexão de braços`.
- pt-BR detail per exercise: `GET https://connect.garmin.com/web-data/exercises/pt-BR/{CODE}/{CODE}.json` → includes `equipment` (string) and `heroImage` (a path relative to `https://connect.garmin.com`, confirmed to resolve as `https://connect.garmin.com{heroImage}`).
- The `videos[].video` paths (e.g. `/msn-workout/...`) do **not** resolve under `https://connect.garmin.com` and their real CDN host wasn't identified. **Decision: the MVP seed only populates `garmin_image_url`, leaving `garmin_video_url` NULL.** This matches the already-approved design (image by default, optional YouTube link supplied at import time takes priority when present) and isn't a regression — no video reference is lost versus what was designed.

- [ ] **Step 1: Write the failing test — `tests/exercises-seeded.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';

describe('seeded exercise catalog', () => {
  it('has a reasonable number of exercises with pt-BR names and image URLs', async () => {
    const { results } = await env.DB.prepare('SELECT COUNT(*) as n FROM exercises').all<{ n: number }>();
    expect(results![0].n).toBeGreaterThan(50);

    const sample = await env.DB.prepare(
      "SELECT name, garmin_image_url as garminImageUrl FROM exercises WHERE name LIKE '%Flexão%braços%' LIMIT 1"
    ).first<{ name: string; garminImageUrl: string | null }>();
    expect(sample).not.toBeNull();
    expect(sample?.garminImageUrl).toContain('https://connect.garmin.com');
  });
});
```

This test will only pass once `migrations/0003_seed_exercises.sql` exists (Step 3 generates it) — that's expected; don't try to make it pass any other way.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/exercises-seeded.test.ts`
Expected: FAIL (empty `exercises` table)

- [ ] **Step 3: Create `seed/fetch-garmin-catalog.ts`**

```typescript
import { writeFile } from 'node:fs/promises';

const BASE = 'https://connect.garmin.com';

interface MasterIndex {
  categories: Record<string, { exercises: Record<string, { primaryMuscles: string[]; secondaryMuscles: string[] }> }>;
}

interface ExerciseDetail {
  equipment: string;
  heroImage: string | null;
}

async function main() {
  console.log('Fetching master exercise index...');
  const index: MasterIndex = await fetchJson(`${BASE}/web-data/exercises/Exercises.json`);

  const byCode = new Map<string, { primaryMuscles: string[] }>();
  for (const category of Object.values(index.categories)) {
    for (const [code, info] of Object.entries(category.exercises)) {
      if (!byCode.has(code)) byCode.set(code, { primaryMuscles: info.primaryMuscles });
    }
  }
  console.log(`Found ${byCode.size} unique exercise codes.`);

  console.log('Fetching pt-BR name translations...');
  const propertiesText = await fetchText(`${BASE}/web-translations/exercise_types/exercise_types_pt-BR.properties`);
  const names = parseProperties(propertiesText);

  const statements: string[] = [];
  let skipped = 0;

  let i = 0;
  for (const [code, info] of byCode) {
    i++;
    const name = names.get(`exercise_type_${code}`) ?? names.get(`category_type_${code}`);
    if (!name) {
      skipped++;
      continue;
    }

    let detail: ExerciseDetail | null = null;
    try {
      detail = await fetchJson<ExerciseDetail>(`${BASE}/web-data/exercises/pt-BR/${code}/${code}.json`);
    } catch {
      skipped++;
      continue;
    }

    const muscleGroup = info.primaryMuscles[0] ?? '';
    const imageUrl = detail.heroImage ? `${BASE}${detail.heroImage}` : null;

    statements.push(
      `INSERT INTO exercises (name, muscle_group, equipment, garmin_image_url, garmin_video_url) VALUES (${sqlString(name)}, ${sqlString(muscleGroup)}, ${sqlString(detail.equipment ?? '')}, ${sqlString(imageUrl)}, NULL);`
    );

    if (i % 25 === 0) console.log(`Processed ${i}/${byCode.size}...`);
    await sleep(150); // be polite to Garmin's servers
  }

  await writeFile(new URL('../migrations/0003_seed_exercises.sql', import.meta.url), statements.join('\n') + '\n');
  console.log(`Wrote ${statements.length} exercises to migrations/0003_seed_exercises.sql (${skipped} skipped: no name or detail found).`);
}

function parseProperties(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    map.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim());
  }
  return map;
}

function sqlString(value: string | null): string {
  if (value === null) return 'NULL';
  return `'${value.replace(/'/g, "''")}'`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main();
```

- [ ] **Step 4: Run the script**

Run: `npm run seed:exercises`
Expected: takes a few minutes (one request per exercise, throttled). Prints progress every 25 exercises, then a final "Wrote N exercises..." line. Produces `migrations/0003_seed_exercises.sql`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/exercises-seeded.test.ts`
Expected: PASS

- [ ] **Step 6: Apply to the local dev database**

Run: `npm run db:migrate:local`

- [ ] **Step 7: Commit**

```bash
git add seed/fetch-garmin-catalog.ts migrations/0003_seed_exercises.sql tests/exercises-seeded.test.ts
git commit -m "feat: seed exercise catalog from Garmin's public pt-BR data"
```

---

### Task 18: Deploy configuration and manual smoke test

**Files:**
- Modify: `wrangler.toml` (confirm production D1 binding)
- Create: `docs/superpowers/plans/2026-09-28-kinexus-mvp-smoke-test.md` (manual checklist, not automated)

**Interfaces:**
- Consumes: every previous task's routes, deployed together as the final Worker.

- [ ] **Step 1: Apply all migrations to the remote (production) D1 database**

Run: `npm run db:migrate:remote`
Expected: confirms all 4 migrations (`0001_init`, `0002_seed_users`, `0003_seed_exercises`, plus any created above) applied to the remote database.

- [ ] **Step 2: Deploy**

Run: `npm run deploy`
Expected: prints the deployed Worker URL (e.g. `https://kinexus.<account>.workers.dev`).

- [ ] **Step 3: Create the manual smoke-test checklist**

```markdown
# Kinexus MVP — Manual Smoke Test

Run through this once after every deploy to production, using the real deployed URL.

- [ ] Open the deployed URL — redirected to `/login`, all 3 users listed.
- [ ] Click a user, enter the wrong PIN 5 times — 6th attempt (even correct PIN) is rejected for ~30s.
- [ ] Enter the correct PIN — redirected to the dashboard.
- [ ] Reload the browser — still logged in (session cookie persisted).
- [ ] Go to "Importar treino", paste a JSON workout using the documented schema — preview shows matched/unmatched exercises correctly.
- [ ] Confirm the import — redirected to "Meus treinos", plan and exercises appear.
- [ ] Return to the dashboard — "Treino A" card appears with an "Iniciar treino" button.
- [ ] Click "Iniciar treino" — button changes to "Finalizar treino".
- [ ] Click "Finalizar treino" — today's date shows as trained on the calendar.
- [ ] Import a second workout — first plan is replaced, "Meus treinos" shows the new one only.
```

- [ ] **Step 4: Walk through the checklist against the deployed URL and fix anything that fails**

This step has no fixed code — if something in the checklist fails, the fix belongs in whichever task's files own that behavior, followed by re-running that task's tests before re-deploying.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-09-28-kinexus-mvp-smoke-test.md
git commit -m "docs: add manual smoke-test checklist for production deploys"
```
