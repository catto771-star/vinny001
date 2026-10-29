import { randomUUID, createHash } from "node:crypto";
import { weekdays, scheduleInput, activePlan, scheduled } from "./planning.mjs";
import { assertDietSlot, migratePlans } from "./plan-rules.mjs";
const macros = ["kcal", "protein", "carbs", "fat"];
export function tracking({ db, scope, fail, text, num, audit, date }) {
  const run = (sql, ...p) => db.prepare(sql).run(...p),
    one = (sql, ...p) => db.prepare(sql).get(...p),
    all = (sql, ...p) => db.prepare(sql).all(...p);
  db.exec(`CREATE TABLE IF NOT EXISTS workout_sessions(id TEXT PRIMARY KEY,student TEXT NOT NULL REFERENCES students(id),actor TEXT NOT NULL REFERENCES users(id),workout TEXT NOT NULL REFERENCES records(id),snapshot TEXT NOT NULL,started TEXT NOT NULL,finished TEXT);
 CREATE INDEX IF NOT EXISTS session_student ON workout_sessions(student);
 CREATE TABLE IF NOT EXISTS workout_sets(id TEXT PRIMARY KEY,session TEXT NOT NULL REFERENCES workout_sessions(id),exercise_index INTEGER NOT NULL,set_index INTEGER NOT NULL,load REAL NOT NULL,reps INTEGER NOT NULL,recorded TEXT NOT NULL,UNIQUE(session,exercise_index,set_index));
 CREATE TABLE IF NOT EXISTS meal_consumptions(id TEXT PRIMARY KEY,student TEXT NOT NULL REFERENCES students(id),actor TEXT NOT NULL REFERENCES users(id),meal TEXT NOT NULL REFERENCES records(id),date TEXT NOT NULL,payload TEXT NOT NULL,recorded TEXT NOT NULL,UNIQUE(student,meal,date));
 CREATE INDEX IF NOT EXISTS consumption_student ON meal_consumptions(student,date);`);
  migratePlans(db);
  function sessionValue(row) {
    return {
      id: row.id,
      student: row.student,
      workoutId: row.workout,
      workout: JSON.parse(row.snapshot),
      started: row.started,
      finished: row.finished,
      sets: all(
        "SELECT * FROM workout_sets WHERE session=? ORDER BY exercise_index,set_index",
        row.id,
      ).map(({ session, ...s }) => s),
    };
  }
  function state(u, students) {
    const sessions = [],
      consumptions = [],
      performances = [];
    for (const s of students) {
      for (const row of all(
        "SELECT * FROM workout_sessions WHERE student=? ORDER BY started,id",
        s.id,
      )) {
        const value = sessionValue(row);
        sessions.push(value);
        for (const set of value.sets) {
          const ex = value.workout.exercises[set.exercise_index];
          performances.push({
            id: set.id,
            student: s.id,
            sessionId: row.id,
            workoutId: row.workout,
            exerciseIndex: set.exercise_index,
            exerciseId:
              ex.libraryId ||
              createHash("sha256").update(ex.name.toLowerCase().trim()).digest("hex"),
            exercise: ex.name,
            muscleGroup: ex.muscleGroup || "Não classificado",
            load: set.load,
            reps: set.reps,
            sets: 1,
            volume: set.load * set.reps,
            date: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
              new Date(set.recorded),
            ),
            created: set.recorded,
          });
        }
      }
      for (const row of all(
        "SELECT payload FROM meal_consumptions WHERE student=? ORDER BY recorded,id",
        s.id,
      ))
        consumptions.push(JSON.parse(row.payload));
    }
    return { workoutSessions: sessions, consumptions, setPerformances: performances };
  }
  const studentOnly = (u) => {
    if (u.role !== "student") fail(403, "Apenas o aluno registra sua execução");
  };
  function ownedSession(u, id) {
    studentOnly(u);
    const row = one("SELECT * FROM workout_sessions WHERE id=?", id);
    if (!row || row.actor !== u.id) fail(404, "Sessão não encontrada");
    scope(u, row.student);
    return row;
  }
  async function route(path, method, body, u) {
    if (path === "/api/plans/schedule" && method === "POST") {
      if (u.role === "student") fail(403, "Apenas o profissional altera o planejamento");
      const diet = body.type === "diet";
      if (!diet && body.type !== "workout") fail(400, "Tipo de plano inválido");
      if (
        (diet && !["nutritionist", "both"].includes(u.role)) ||
        (!diet && !["trainer", "both"].includes(u.role))
      )
        fail(403, "Seu perfil não permite esta prescrição");
      const row = one(
        diet
          ? "SELECT * FROM clinical WHERE id=? AND kind='protocol'"
          : "SELECT * FROM records WHERE id=? AND kind='workouts'",
        body.id,
      );
      if (!row) fail(404, "Plano não encontrado");
      const s = scope(u, row.student),
        schedule = scheduleInput(body);
      db.exec("BEGIN IMMEDIATE");
      try {
        if (diet && schedule.active) assertDietSlot(db, s, schedule.weekdays, [row.id]);
        const value = { ...JSON.parse(row.payload), ...schedule };
        run(
          diet
            ? "UPDATE clinical SET payload=? WHERE id=?"
            : "UPDATE records SET payload=? WHERE id=?",
          JSON.stringify(value),
          row.id,
        );
        if(diet&&schedule.active){for(const r of all("SELECT id,payload FROM records WHERE student=? AND kind='meals'",s.id)){const meal=JSON.parse(r.payload);if(meal.protocolId===row.id&&meal.archived){meal.archived=false;run('UPDATE records SET payload=? WHERE id=?',JSON.stringify(meal),r.id)}}}
        audit(u, "schedule:" + body.type, row.id);
        db.exec("COMMIT");
        return { value };
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
    if (path === "/api/workout-sessions/start" && method === "POST") {
      studentOnly(u);
      const s = scope(u, body.student),
        w = one(
          "SELECT * FROM records WHERE id=? AND student=? AND kind='workouts'",
          body.workoutId,
          s.id,
        );
      if (!w) fail(404, "Treino não encontrado");
      const workout = JSON.parse(w.payload);
      const existing = one(
        "SELECT * FROM workout_sessions WHERE student=? AND actor=? AND workout=? AND finished IS NULL",
        s.id,
        u.id,
        w.id,
      );
      if (existing) return { value: sessionValue(existing) };
      if (!activePlan(workout)) fail(409, "Este treino está inativo");
      const id = randomUUID(),
        started = new Date().toISOString();
      run(
        "INSERT INTO workout_sessions VALUES(?,?,?,?,?,?,NULL)",
        id,
        s.id,
        u.id,
        w.id,
        JSON.stringify(workout),
        started,
      );
      audit(u, "start:workout", id);
      return {
        status: 201,
        value: sessionValue(one("SELECT * FROM workout_sessions WHERE id=?", id)),
      };
    }
    if (path === "/api/workout-sessions/set" && method === "POST") {
      const row = ownedSession(u, body.sessionId);
      if (row.finished) fail(409, "Esta sessão já foi finalizada");
      const workout = JSON.parse(row.snapshot);
      if (
        !Number.isInteger(body.exerciseIndex) ||
        !workout.exercises[body.exerciseIndex] ||
        !Number.isInteger(body.setIndex) ||
        body.setIndex < 1 ||
        body.setIndex > 100
      )
        fail(400, "Exercício ou série inválidos");
      const load = num(body.load, 0, 1500),
        reps = num(body.reps, 1, 1000);
      if (!Number.isInteger(reps)) fail(400, "Repetições devem ser inteiras");
      run(
        "INSERT INTO workout_sets VALUES(?,?,?,?,?,?,?) ON CONFLICT(session,exercise_index,set_index) DO UPDATE SET load=excluded.load,reps=excluded.reps,recorded=excluded.recorded",
        randomUUID(),
        row.id,
        body.exerciseIndex,
        body.setIndex,
        load,
        reps,
        new Date().toISOString(),
      );
      audit(u, "record:set", row.id);
      return { value: sessionValue(row) };
    }
    if (path === "/api/workout-sessions/finish" && method === "POST") {
      const row = ownedSession(u, body.sessionId);
      if (row.finished) return { value: sessionValue(row) };
      const session = sessionValue(row);
      if (
        session.workout.exercises.some((_, i) => !session.sets.some((s) => s.exercise_index === i))
      )
        fail(400, "Registre ao menos uma série de cada exercício antes de finalizar");
      const finished = new Date().toISOString();
      db.exec("BEGIN IMMEDIATE");
      try {
        run("UPDATE workout_sessions SET finished=? WHERE id=?", finished, row.id);
        const id = randomUUID(),
          value = {
            id,
            student: row.student,
            type: "workout",
            item: row.workout,
            sessionId: row.id,
            date: date(),
          };
        run(
          "INSERT INTO records VALUES(?,?,?,?,?,?)",
          id,
          "logs",
          row.student,
          u.id,
          JSON.stringify(value),
          finished,
        );
        audit(u, "finish:workout", row.id);
        db.exec("COMMIT");
        return { value: sessionValue({ ...row, finished }) };
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
    if (path === "/api/meal-consumptions" && method === "POST") {
      studentOnly(u);
      const s = scope(u, body.student),
        row = one(
          "SELECT * FROM records WHERE id=? AND student=? AND kind='meals'",
          body.mealId,
          s.id,
        );
      if (!row) fail(404, "Refeição não encontrada");
      const meal = JSON.parse(row.payload),
        dietRow = one(
          "SELECT * FROM clinical WHERE id=? AND student=? AND kind='protocol'",
          meal.protocolId || "",
          s.id,
        );
      if (!dietRow || !scheduled(JSON.parse(dietRow.payload), date()) || meal.archived)
        fail(409, "Esta refeição não faz parte da dieta ativa de hoje");
      const conflicts = all(
        "SELECT clinical.payload FROM clinical JOIN students ON students.id=clinical.student WHERE clinical.kind='protocol' AND students.email=?",
        s.email,
      ).filter((r) => scheduled(JSON.parse(r.payload), date()));
      if (conflicts.length > 1)
        fail(409, "O profissional precisa resolver um conflito de dietas para hoje");
      let items;
      if (meal.items?.length) {
        if (!Array.isArray(body.quantities) || body.quantities.length !== meal.items.length)
          fail(400, "Informe a quantidade de cada alimento previsto");
        items = meal.items.map((item, i) => {
          const grams = num(body.quantities[i], 0, 10000);
          return {
            ...item,
            grams,
            ...Object.fromEntries(macros.map((n) => [n, (item.per100g[n] * grams) / 100])),
          };
        });
      } else {
        if (body.quantities?.length)
          fail(400, "Esta refeição antiga não tem alimentos estruturados para ajustar");
        items = [];
      }
      const totals = items.length
        ? Object.fromEntries(macros.map((n) => [n, items.reduce((sum, i) => sum + i[n], 0)]))
        : Object.fromEntries(macros.map((n) => [n, meal[n]]));
      const old = one(
          "SELECT id,payload FROM meal_consumptions WHERE student=? AND meal=? AND date=?",
          s.id,
          row.id,
          date(),
        ),
        id = old?.id || randomUUID(),
        recorded = new Date().toISOString();
      const value = {
        id,
        student: s.id,
        mealId: row.id,
        protocolId: meal.protocolId,
        date: date(),
        executedAt: old ? JSON.parse(old.payload).executedAt : recorded,
        updatedAt: recorded,
        scheduledTime: meal.time,
        mealName: meal.name,
        items,
        totals,
        planned: {
          items: meal.items || [],
          totals: Object.fromEntries(macros.map((n) => [n, meal[n]])),
        },
      };
      db.exec("BEGIN IMMEDIATE");
      try {
        run(
          "INSERT INTO meal_consumptions VALUES(?,?,?,?,?,?,?) ON CONFLICT(student,meal,date) DO UPDATE SET payload=excluded.payload,recorded=excluded.recorded",
          id,
          s.id,
          u.id,
          row.id,
          date(),
          JSON.stringify(value),
          recorded,
        );
        const logs = all("SELECT * FROM records WHERE student=? AND kind='logs'", s.id).filter(
          (r) => {
            const p = JSON.parse(r.payload);
            return p.type === "meal" && p.item === row.id && p.date === date();
          },
        );
        if (!logs.length) {
          const logId = randomUUID();
          run(
            "INSERT INTO records VALUES(?,?,?,?,?,?)",
            logId,
            "logs",
            s.id,
            u.id,
            JSON.stringify({
              id: logId,
              student: s.id,
              type: "meal",
              item: row.id,
              date: date(),
              consumptionId: id,
            }),
            recorded,
          );
        }
        audit(u, "record:consumption", id);
        db.exec("COMMIT");
        return { status: old ? 200 : 201, value };
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
    return null;
  }
  return { state, route };
}
