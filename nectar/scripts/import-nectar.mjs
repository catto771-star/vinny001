// Imports a Néctar export (JSON) into your own Supabase project.
//
// Usage:
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/import-nectar.mjs nectar-dados.json voce@email.com
//
// The service role key bypasses row level security, so run this only on your
// own computer and never commit or share the key. Re-running is safe: rows are
// upserted by id.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { mapExport } from './nectar-map.mjs';

const [file, email] = process.argv.slice(2);
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!file || !email || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-nectar.mjs <export.json> <email>');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function findUser(target) {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === target.toLowerCase());
    if (user) return user;
    if (data.users.length < 200) return null;
  }
}

const user = await findUser(email);
if (!user) {
  console.error(`No user with e-mail ${email}. Create your account in the app first, then run this again.`);
  process.exit(1);
}

const data = JSON.parse(readFileSync(file, 'utf8'));
for (const [table, rows] of mapExport(data, user.id)) {
  if (!rows.length) continue;
  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
  if (error) {
    console.error(`${table}: ${error.message}`);
    process.exit(1);
  }
  console.log(`${table}: ${rows.length}`);
}
console.log('Import finished.');
