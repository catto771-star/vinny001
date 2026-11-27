// Cria a PRIMEIRA conta de gestão (ou a conta Developer), quando ainda não há
// ninguém no sistema para criá-la pela tela de Usuários.
// Uso (chaves só por variável de ambiente, nunca no repositório):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/bootstrap-account.mjs --role owner --name "Nome" --email a@b.c [--locale pt-PT]
// Imprime a primeira senha; a pessoa troca no primeiro acesso.
import { createClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => (cur.startsWith("--") ? [...acc, [cur.slice(2), all[i + 1]]] : acc), []),
);
const { role, name, email, locale = "pt-PT" } = args;
if (!["owner", "manager", "developer"].includes(role) || !name || !email) {
  console.error("Uso: --role owner|manager|developer --name \"Nome\" --email e-mail [--locale pt-PT|en-IE|pl-PL]");
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const digits = "23456789";
let password = digits[randomInt(digits.length)] + digits[randomInt(digits.length)];
while (password.length < 14) password += (letters + digits)[randomInt(letters.length + digits.length)];

const admin = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await admin.auth.admin.createUser({ email: email.toLowerCase(), password, email_confirm: true });
if (error) {
  console.error("Falha ao criar login:", error.message);
  process.exit(1);
}
const { error: staffError } = await admin.from("staff").insert({
  user_id: data.user.id,
  full_name: name,
  role,
  email: email.toLowerCase(),
  locale,
  must_change_password: true,
});
if (staffError) {
  await admin.auth.admin.deleteUser(data.user.id);
  console.error("Falha ao criar cadastro:", staffError.message);
  process.exit(1);
}
console.log(JSON.stringify({ email: email.toLowerCase(), role, first_password: password }));
