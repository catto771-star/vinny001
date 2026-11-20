// Dados de demonstração (fictícios) no projeto Supabase.
//   node scripts/demo.mjs seed   → cria os logins da equipe demo (8 Porters) e ~30 dias de operação
//   node scripts/demo.mjs clear  → remove tudo o que é demo (residentes, equipe, registros, logins)
// Variáveis: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (logins), SUPABASE_PROJECT_REF e
// SUPABASE_ACCESS_TOKEN (SQL pela Management API; o token pode vir de um proxy que já autentica).
// DEMO_PASSWORD opcional: senha comum dos logins demo (senão é gerada e impressa uma vez).
import { readFileSync } from "node:fs";
import { randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const action = process.argv[2];
if (!["seed", "clear"].includes(action)) {
  console.error("Uso: node scripts/demo.mjs seed|clear");
  process.exit(1);
}
const ref = process.env.SUPABASE_PROJECT_REF ?? new URL(process.env.SUPABASE_URL ?? "https://x.supabase.co").hostname.split(".")[0];

async function sql(query) {
  const headers = { "Content-Type": "application/json" };
  if (process.env.SUPABASE_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`;
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: "POST", headers, body: JSON.stringify({ query }) });
  const body = await res.text();
  if (!res.ok) throw new Error(`SQL falhou (${res.status}): ${body.slice(0, 400)}`);
  return JSON.parse(body);
}

const PORTERS = ["pedro.almeida", "aoife.kelly", "tomasz.nowak", "lucas.ferreira", "ciaran.byrne", "marta.wisniewska", "rafael.souza", "niamh.doyle"]
  .map((n) => `${n}@demo.ds-lodge.test`);

if (action === "seed") {
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  let password = process.env.DEMO_PASSWORD;
  if (!password) {
    password = "Demo" + String(randomInt(10, 99));
    while (password.length < 12) password += letters[randomInt(letters.length)];
  }
  const existing = new Map();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) existing.set(u.email, u.id);
    if (data.users.length < 200) break;
  }
  for (const email of PORTERS) {
    if (existing.has(email)) {
      await admin.auth.admin.updateUserById(existing.get(email), { password, ban_duration: "none" });
    } else {
      const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
    }
  }
  await sql(readFileSync(new URL("../supabase/seed/demo.sql", import.meta.url), "utf8"));
  const [{ r }] = await sql("select demo.seed() as r");
  console.log(JSON.stringify({ seeded: r, logins: PORTERS, password }, null, 2));
} else {
  const [{ r }] = await sql("select demo.clear() as r");
  console.log(JSON.stringify({ cleared: r }, null, 2));
}
