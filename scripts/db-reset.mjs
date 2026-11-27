// Recria o banco local (Postgres puro + réplica mínima do auth do Supabase)
// e aplica as migrações em ordem. Uso: npm run db:reset
import { readFileSync, readdirSync } from "node:fs";
import pg from "pg";

const base = process.env.LOCAL_PG_URL ?? "postgresql://postgres@localhost:54322";
const dbName = process.env.LOCAL_PG_DB ?? "dslodge";

const admin = new pg.Client({ connectionString: `${base}/postgres` });
await admin.connect();
await admin.query(`drop database if exists ${dbName} with (force)`);
await admin.query(`create database ${dbName}`);
await admin.end();

const db = new pg.Client({ connectionString: `${base}/${dbName}` });
await db.connect();
await db.query(readFileSync("supabase/local/auth_shim.sql", "utf8"));
const files = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
for (const file of files) {
  try {
    await db.query(readFileSync(`supabase/migrations/${file}`, "utf8"));
    console.log(`applied ${file}`);
  } catch (error) {
    console.error(`FAILED ${file}: ${error.message}`);
    if (error.position) {
      const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
      const line = sql.slice(0, Number(error.position)).split("\n").length;
      console.error(`  near line ${line}`);
    }
    process.exitCode = 1;
    break;
  }
}
await db.end();
