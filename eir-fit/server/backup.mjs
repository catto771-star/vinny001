import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
const destination = process.argv[2];
if (!destination) throw Error("Uso: node server/backup.mjs /caminho/backup.sqlite");
mkdirSync(dirname(resolve(destination)), { recursive: true, mode: 0o700 });
const db = new DatabaseSync(process.env.DATABASE_PATH || "./data/eir-fit.sqlite", {
  readOnly: true,
});
try {
  await backup(db, destination);
  const copy = new DatabaseSync(destination, { readOnly: true });
  try {
    if (copy.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
      throw Error("Backup inválido");
  } finally {
    copy.close();
  }
  console.log("Backup concluído e integridade verificada.");
} finally {
  db.close();
}
