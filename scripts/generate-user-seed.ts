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
