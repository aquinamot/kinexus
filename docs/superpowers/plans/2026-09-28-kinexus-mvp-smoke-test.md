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

## Changing a PIN after the first remote deploy

`npm run seed:users` only regenerates `migrations/0002_seed_users.sql` — once that
migration has been applied to the **remote** database (`npm run db:migrate:remote`
or the first `deploy`), re-running the generator and re-migrating does **nothing**,
because `wrangler d1 migrations` tracks migrations as already-applied by filename
and never re-runs one. Editing 0002 after that point is a no-op against production.

To change a PIN on an already-deployed database, run a one-off statement directly
against the remote D1 database instead of touching migrations:

```bash
# 1. Compute the new hash locally (uses the same hashPin() the app verifies against):
node -e "import('./src/auth/pin.ts').then(m => m.hashPin('NEW-4-DIGIT-PIN')).then(console.log)"

# 2. Apply it directly to the remote database (never commit this command's PIN to git):
npx wrangler d1 execute kinexus --remote --command "UPDATE users SET pin_hash = 'PASTE_HASH_HERE', failed_pin_attempts = 0, locked_until = NULL WHERE name = 'Bruno'"
```

The PINs generated for local development (`seed/users.local.json`, gitignored) are
throwaway/testing-phase values — treat them as placeholders to replace this way
before sharing the deployed URL with anyone.
