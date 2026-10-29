import { allDays, weekdays, activePlan } from "./planning.mjs";
export function assertDietSlot(db, student, days, exclude = []) {
  const rows = db
    .prepare(
      "SELECT clinical.* FROM clinical JOIN students ON students.id=clinical.student WHERE clinical.kind='protocol' AND (students.email=? OR (? IS NOT NULL AND students.user_id=?))",
    )
    .all(student.email, student.user_id, student.user_id);
  for (const row of rows) {
    if (exclude.includes(row.id)) continue;
    const p = JSON.parse(row.payload);
    if (activePlan(p) && weekdays(p.weekdays).some((d) => days.includes(d)))
      throw Object.assign(
        Error("Já existe uma dieta ativa em um dos dias selecionados para este aluno"),
        { status: 409 },
      );
  }
}
export function migratePlans(db) {
  const version = db.prepare("PRAGMA user_version").get().user_version;
  if (version >= 3) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const row of db.prepare("SELECT * FROM records WHERE kind='workouts'").all()) {
      const p = JSON.parse(row.payload);
      p.active = p.active !== false;
      p.weekdays = p.weekdays || allDays;
      db.prepare("UPDATE records SET payload=? WHERE id=?").run(JSON.stringify(p), row.id);
    }
    for (const row of db.prepare("SELECT * FROM clinical WHERE kind='protocol'").all()) {
      const p = JSON.parse(row.payload);
      if (p.active === undefined) {
        const meals = db
          .prepare("SELECT payload FROM records WHERE student=? AND kind='meals'")
          .all(row.student)
          .map((r) => JSON.parse(r.payload));
        p.active = meals.some((m) => m.protocolId === p.id && !m.archived);
      }
      p.weekdays = p.weekdays || allDays;
      db.prepare("UPDATE clinical SET payload=? WHERE id=?").run(JSON.stringify(p), row.id);
    }
    // Give legacy independent meals a containing diet without inventing food quantities.
    for (const s of db.prepare("SELECT * FROM students").all()) {
      const loose = db
        .prepare("SELECT * FROM records WHERE student=? AND kind='meals'")
        .all(s.id)
        .filter((r) => !JSON.parse(r.payload).protocolId);
      if (!loose.length) continue;
      const id = "legacy-diet-" + s.id,
        created = loose[0].created,
        meals = loose.map((r) => JSON.parse(r.payload));
      const p = {
        id,
        student: s.id,
        name: "Dieta anterior",
        version: 1,
        dietId: id,
        items: [],
        totals: Object.fromEntries(
          ["kcal", "protein", "carbs", "fat"].map((n) => [
            n,
            meals.reduce((sum, m) => sum + (m[n] || 0), 0),
          ]),
        ),
        date: created.slice(0, 10),
        created,
        active: !db
          .prepare("SELECT id FROM clinical WHERE student=? AND kind='protocol'")
          .get(s.id),
        weekdays: allDays,
        legacy: true,
      };
      db.prepare("INSERT INTO clinical VALUES(?,?,?,?,?,?)").run(
        id,
        s.id,
        s.owner,
        "protocol",
        JSON.stringify(p),
        created,
      );
      for (const r of loose) {
        const m = JSON.parse(r.payload);
        m.protocolId = id;
        db.prepare("UPDATE records SET payload=? WHERE id=?").run(JSON.stringify(m), r.id);
      }
    }
    db.exec("PRAGMA user_version=3; COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
