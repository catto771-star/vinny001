import { randomUUID, createHash } from "node:crypto";
import { scheduleInput, allDays } from "./planning.mjs";
import { assertDietSlot } from "./plan-rules.mjs";
import { sources } from "./catalogs/sources.mjs";
import { exerciseTemplates } from "./catalogs/exercises.mjs";
const nutrients = ["kcal", "protein", "carbs", "fat"];
export function nutrition(items, foodLookup) {
  if (!Array.isArray(items) || !items.length || items.length > 150)
    throw Object.assign(Error("Informe de 1 a 150 alimentos"), { status: 400 });
  return items.map((i) => {
    const food = foodLookup(i.foodId);
    if (!food) throw Object.assign(Error("Alimento não encontrado"), { status: 404 });
    if (typeof i.grams !== "number" || !Number.isFinite(i.grams) || i.grams <= 0 || i.grams > 10000)
      throw Object.assign(Error("Quantidade inválida em gramas"), { status: 400 });
    const totals = Object.fromEntries(nutrients.map((n) => [n, (food[n] * i.grams) / 100]));
    return {
      foodId: food.id,
      name: food.name,
      grams: i.grams,
      meal: String(i.meal || "Refeição").slice(0, 100),
      time: /^([01]\d|2[0-3]):[0-5]\d$/.test(i.time) ? i.time : "12:00",
      source: food.source,
      sourceId: food.sourceId,
      edition: food.edition,
      sourceUrl: food.sourceUrl,
      verified: food.verified,
      per100g: Object.fromEntries(nutrients.map((n) => [n, food[n]])),
      ...totals,
    };
  });
}
export function youtube(value) {
  if (!value) return "";
  let url;
  try {
    url = new URL(value);
  } catch {
    throw Object.assign(Error("URL do YouTube inválida"), { status: 400 });
  }
  if (url.protocol !== "https:")
    throw Object.assign(Error("Use um link HTTPS do YouTube"), { status: 400 });
  let id;
  if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) {
    id =
      url.pathname === "/watch"
        ? url.searchParams.get("v")
        : url.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})\/?$/)?.[1];
  } else if (url.hostname === "youtu.be") id = url.pathname.slice(1);
  if (!/^[\w-]{11}$/.test(id || ""))
    throw Object.assign(Error("Vídeo do YouTube inválido"), { status: 400 });
  return "https://www.youtube.com/watch?v=" + id;
}
export function modules({ db, scope, fail, text, num, audit, date }) {
  const run = (sql, ...p) => db.prepare(sql).run(...p),
    one = (sql, ...p) => db.prepare(sql).get(...p),
    all = (sql, ...p) => db.prepare(sql).all(...p);
  db.exec(`CREATE TABLE IF NOT EXISTS library(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('exercise','food')),payload TEXT NOT NULL,created TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS library_owner ON library(owner,kind);
CREATE TABLE IF NOT EXISTS clinical(id TEXT PRIMARY KEY,student TEXT NOT NULL REFERENCES students(id),author TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('protocol','performance','assessment','prescription')),payload TEXT NOT NULL,created TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS clinical_student ON clinical(student,kind);`);
  if (db.prepare("PRAGMA user_version").get().user_version < 2) db.exec("PRAGMA user_version=2");
  const decode = (rows) => rows.map((r) => JSON.parse(r.payload));
  const pro = (u) => {
    if (u.role === "student") fail(403, "Apenas profissionais podem alterar esta biblioteca");
  };
  const permission = (u, kind) => {
    if (
      (kind === "workout" && !["trainer", "both"].includes(u.role)) ||
      (kind === "diet" && !["nutritionist", "both"].includes(u.role))
    )
      fail(403, "Seu perfil não permite esta prescrição");
  };
  const ownedFood = (u, id) => {
    const row = one("SELECT * FROM library WHERE id=? AND owner=? AND kind='food'", id, u.id);
    return row ? JSON.parse(row.payload) : null;
  };
  function state(u, students) {
    const result = {
      exercises:
        u.role === "student"
          ? []
          : decode(
              all("SELECT * FROM library WHERE owner=? AND kind='exercise' ORDER BY created", u.id),
            ),
      foods:
        u.role === "student"
          ? []
          : decode(
              all("SELECT * FROM library WHERE owner=? AND kind='food' ORDER BY created", u.id),
            ),
      protocols: [],
      performances: [],
      assessments: [],
      prescriptions: [],
      sources: sources.map((s) => ({
        ...s,
        status:
          s.id === "usda"
            ? process.env.USDA_FDC_API_KEY
              ? "configured"
              : "requires_key"
            : s.method === "file"
              ? "requires_import"
              : "available",
      })),
    };
    for (const s of students)
      for (const r of all("SELECT * FROM clinical WHERE student=? ORDER BY created,id", s.id)) {
        const key = {
          protocol: "protocols",
          performance: "performances",
          assessment: "assessments",
          prescription: "prescriptions",
        }[r.kind];
        result[key].push(JSON.parse(r.payload));
      }
    return result;
  }
  function store(u, student, kind, payload) {
    const id = randomUUID(),
      created = new Date().toISOString();
    const value = { ...payload, id, student, created };
    run(
      "INSERT INTO clinical VALUES(?,?,?,?,?,?)",
      id,
      student,
      u.id,
      kind,
      JSON.stringify(value),
      created,
    );
    audit(u, "create:" + kind, id);
    return value;
  }
  function foodInput(p, { verified = false } = {}) {
    const source = sources.find((s) => s.id === p.source);
    if (!source) fail(400, "Fonte alimentar inválida");
    return {
      name: text(p.name),
      source: source.id,
      sourceId: text(p.sourceId || "manual", 100),
      edition: text(p.edition || "Cadastro manual", 100),
      sourceUrl: source.url,
      verified,
      licenseAccepted: !!p.licenseAccepted,
      ...Object.fromEntries(nutrients.map((n) => [n, num(p[n], 0, n === "kcal" ? 1000 : 100)])),
      fiber: p.fiber == null ? null : num(p.fiber, 0, 100),
      sodium: p.sodium == null ? null : num(p.sodium, 0, 100000),
      basis: "100 g",
      importedAt: new Date().toISOString(),
    };
  }
  function saveLibrary(u, kind, p) {
    const id = randomUUID(),
      v = { ...p, id };
    run(
      "INSERT INTO library VALUES(?,?,?,?,?)",
      id,
      u.id,
      kind,
      JSON.stringify(v),
      new Date().toISOString(),
    );
    audit(u, "library:" + kind, id);
    return v;
  }
  async function route(path, method, body, u, query) {
    if (path === "/api/library/exercises/starter" && method === "POST") {
      pro(u);
      permission(u, "workout");
      const existing = decode(all("SELECT * FROM library WHERE owner=? AND kind='exercise'", u.id));
      let count = 0;
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const [templateKey, name, muscleGroup, equipment, instructions] of exerciseTemplates) {
          if (existing.some((e) => e.templateKey === templateKey)) continue;
          saveLibrary(u, "exercise", {
            name,
            muscleGroup,
            equipment,
            instructions,
            videoUrl: "",
            templateKey,
            source: "Eir Fit",
          });
          count++;
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return { status: 201, value: { imported: count } };
    }
    if (path === "/api/library/exercises" && method === "POST") {
      pro(u);
      permission(u, "workout");
      return {
        status: 201,
        value: saveLibrary(u, "exercise", {
          name: text(body.name),
          muscleGroup: text(body.muscleGroup, 80),
          equipment: text(body.equipment || "Livre", 100),
          instructions: text(body.instructions || "Execução orientada pelo profissional", 4000),
          videoUrl: youtube(body.videoUrl),
        }),
      };
    }
    if (path === "/api/library/foods" && method === "POST") {
      pro(u);
      if (body.source && body.source !== "custom")
        fail(400, "Use a importação identificada para dados de tabelas");
      return {
        status: 201,
        value: saveLibrary(u, "food", foodInput({ ...body, source: "custom" })),
      };
    }
    if (path === "/api/library/import" && method === "POST") {
      pro(u);
      const source = sources.find((s) => s.id === body.source && s.method === "file");
      if (!source || !body.licenseAccepted)
        fail(400, "Selecione a fonte e confirme os direitos de uso");
      if (!Array.isArray(body.foods) || body.foods.length < 1 || body.foods.length > 100)
        fail(400, "Importe entre 1 e 100 alimentos por lote");
      const foods = body.foods.map((f) =>
        foodInput({
          ...f,
          source: source.id,
          edition: text(body.edition, 100),
          licenseAccepted: true,
        }),
      );
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = foods.map((f) => saveLibrary(u, "food", f));
        db.exec("COMMIT");
        return { status: 201, value: { imported: result.length } };
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
    if (path === "/api/foods/usda" && method === "GET") {
      pro(u);
      const key = process.env.USDA_FDC_API_KEY;
      if (!key) fail(503, "USDA: configure USDA_FDC_API_KEY para consultar a base oficial");
      const q = text(query.get("q"), 120);
      let response;
      try {
        response = await fetch(
          "https://api.nal.usda.gov/fdc/v1/foods/search?" +
            new URLSearchParams({
              query: q,
              pageSize: "15",
              dataType: "Foundation,SR Legacy,Survey (FNDDS)",
            }),
          { headers: { "X-Api-Key": key }, signal: AbortSignal.timeout(12000) },
        );
      } catch {
        fail(502, "USDA indisponível. Tente novamente mais tarde");
      }
      if (!response.ok) fail(502, "A consulta USDA não foi autorizada ou está indisponível");
      const data = await response.json();
      const foods = (data.foods || [])
        .map((f) => {
          const get = (id) => f.foodNutrients?.find((n) => n.nutrientId === id)?.value;
          const kcal = get(1008) ?? (get(1062) != null ? get(1062) / 4.184 : undefined);
          return {
            name: f.description,
            source: "usda",
            sourceId: String(f.fdcId),
            edition: f.publicationDate || f.dataType,
            sourceUrl: "https://fdc.nal.usda.gov/food-details/" + f.fdcId + "/nutrients",
            verified: true,
            kcal,
            protein: get(1003),
            carbs: get(1005),
            fat: get(1004),
            fiber: get(1079) ?? null,
            sodium: get(1093) ?? null,
          };
        })
        .filter((f) => nutrients.every((n) => typeof f[n] === "number" && Number.isFinite(f[n])));
      return { value: { foods } };
    }
    if (path === "/api/foods/usda/import" && method === "POST") {
      pro(u);
      const key = process.env.USDA_FDC_API_KEY;
      if (!key) fail(503, "USDA: configure USDA_FDC_API_KEY");
      if (!/^\d{1,12}$/.test(String(body.fdcId))) fail(400, "Identificador USDA inválido");
      let response;
      try {
        response = await fetch("https://api.nal.usda.gov/fdc/v1/food/" + body.fdcId, {
          headers: { "X-Api-Key": key },
          signal: AbortSignal.timeout(12000),
        });
      } catch {
        fail(502, "USDA indisponível");
      }
      if (!response.ok) fail(502, "Alimento USDA indisponível");
      const f = await response.json();
      const get = (id) => f.foodNutrients?.find((n) => n.nutrient?.id === id)?.amount;
      const v = foodInput(
        {
          name: f.description,
          source: "usda",
          sourceId: String(f.fdcId),
          edition: f.publicationDate || f.dataType,
          kcal: get(1008) ?? (get(1062) != null ? get(1062) / 4.184 : undefined),
          protein: get(1003),
          carbs: get(1005),
          fat: get(1004),
          fiber: get(1079),
          sodium: get(1093),
        },
        { verified: true },
      );
      return { status: 201, value: saveLibrary(u, "food", v) };
    }
    if (path === "/api/protocols" && method === "POST") {
      pro(u);
      permission(u, "diet");
      const s = scope(u, body.student),
        items = nutrition(body.items, (id) => ownedFood(u, id)),
        totals = Object.fromEntries(
          nutrients.map((n) => [n, items.reduce((sum, i) => sum + i[n], 0)]),
        );
      for (const item of body.items) {
        text(item.meal, 100);
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time)) fail(400, "Horário da refeição inválido");
      }
      const grouped = new Map();
      for (const i of items) {
        const key = i.meal + "|" + i.time;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(i);
      }
      if (grouped.size > 20) fail(400, "Máximo de 20 refeições");
      const schedule = scheduleInput(body);
      const previous = body.revisionOf
        ? one(
            "SELECT * FROM clinical WHERE id=? AND student=? AND kind='protocol'",
            body.revisionOf,
            s.id,
          )
        : null;
      if (body.revisionOf && !previous) fail(404, "Dieta anterior não encontrada");
      const parent = previous ? JSON.parse(previous.payload) : null;
      if (
        parent &&
        all("SELECT payload FROM clinical WHERE student=? AND kind='protocol'", s.id)
          .map((r) => JSON.parse(r.payload))
          .some(
            (p) =>
              (p.dietId || p.id) === (parent.dietId || parent.id) && p.version > parent.version,
          )
      )
        fail(409, "Revise a versão mais recente desta dieta");
      db.exec("BEGIN IMMEDIATE");
      try {
        if (schedule.active)
          assertDietSlot(db, s, schedule.weekdays, previous ? [previous.id] : []);
        if (previous)
          run(
            "UPDATE clinical SET payload=? WHERE id=?",
            JSON.stringify({ ...parent, active: false }),
            previous.id,
          );
        const version = parent ? parent.version + 1 : 1;
        const protocol = store(u, s.id, "protocol", {
          name: text(body.name),
          version,
          items,
          totals,
          date: date(),
          ...schedule,
          dietId: parent ? parent.dietId || parent.id : randomUUID(),
          revisionOf: previous?.id || null,
        });
        for (const r of all(
          "SELECT id,payload FROM records WHERE student=? AND kind='meals'",
          s.id,
        )) {
          const p = JSON.parse(r.payload);
          if (previous && p.protocolId === previous.id) {
            p.archived = true;
            run("UPDATE records SET payload=? WHERE id=?", JSON.stringify(p), r.id);
          }
        }
        for (const list of grouped.values()) {
          const id = randomUUID(),
            value = {
              id,
              student: s.id,
              name: list[0].meal,
              time: list[0].time,
              foods: list.map((i) => `${i.name} (${i.grams} g)`).join(", "),
              items: list,
              protocolId: protocol.id,
              ...Object.fromEntries(
                nutrients.map((n) => [n, list.reduce((sum, i) => sum + i[n], 0)]),
              ),
            };
          run(
            "INSERT INTO records VALUES(?,?,?,?,?,?)",
            id,
            "meals",
            s.id,
            u.id,
            JSON.stringify(value),
            new Date().toISOString(),
          );
        }
        db.exec("COMMIT");
        return { status: 201, value: protocol };
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
    if (path === "/api/performances" && method === "POST") {
      if (u.role !== "student") fail(403, "Apenas o aluno registra a execução");
      fail(400, "Registre as séries durante a sessão de treino");
    }
    if (path === "/api/assessments" && method === "POST") {
      pro(u);
      const s = scope(u, body.student),
        values = {};
      for (const [key, min, max] of [
        ["weight", 20, 400],
        ["bodyFat", 0, 75],
        ["waist", 10, 250],
        ["hip", 10, 250],
        ["chest", 10, 250],
        ["arm", 5, 100],
        ["thigh", 10, 150],
        ["calf", 5, 100],
      ])
        if (body[key] !== "" && body[key] != null) values[key] = num(body[key], min, max);
      if (!Object.keys(values).length) fail(400, "Informe ao menos uma medida");
      db.exec("BEGIN IMMEDIATE");
      try {
        const value = store(u, s.id, "assessment", {
          ...values,
          bmi: values.weight ? values.weight / (s.height / 100) ** 2 : null,
          waistHeightRatio: values.waist ? values.waist / s.height : null,
          note: typeof body.note === "string" ? body.note.slice(0, 2000) : "",
          date: date(),
          authorName: u.name,
        });
        if (values.weight != null)
          run("UPDATE students SET weight=? WHERE id=?", values.weight, s.id);
        db.exec("COMMIT");
        return { status: 201, value };
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
    if (path === "/api/prescriptions" && method === "POST") {
      pro(u);
      const s = scope(u, body.student);
      if (!["supplement", "substance"].includes(body.type))
        fail(400, "Tipo de prescrição inválido");
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(body.startDate) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(body.endDate) ||
        !Number.isFinite(Date.parse(body.startDate)) ||
        body.endDate < body.startDate
      )
        fail(400, "Período inválido");
      return {
        status: 201,
        value: store(u, s.id, "prescription", {
          type: body.type,
          name: text(body.name),
          instructions: text(body.instructions, 4000),
          frequency: text(body.frequency, 300),
          route: text(body.route, 100),
          startDate: body.startDate,
          endDate: body.endDate,
          credential: text(body.credential, 200),
          prescriber: u.name,
          notes: typeof body.notes === "string" ? body.notes.slice(0, 3000) : "",
          status: "active",
        }),
      };
    }
    if (path === "/api/prescriptions/stop" && method === "POST") {
      pro(u);
      const r = one("SELECT * FROM clinical WHERE id=? AND kind='prescription'", body.id);
      if (!r) fail(404, "Prescrição não encontrada");
      scope(u, r.student);
      const p = JSON.parse(r.payload);
      p.status = "stopped";
      p.stoppedAt = new Date().toISOString();
      p.stopReason = text(body.reason, 1000);
      run("UPDATE clinical SET payload=? WHERE id=?", JSON.stringify(p), r.id);
      audit(u, "stop:prescription", r.id);
      return { value: p };
    }
    return null;
  }
  return {
    state,
    route,
    manualDiet: (u, s, meal) => {
      assertDietSlot(db, s, allDays);
      const diet = store(u, s.id, "protocol", {
        name: meal.name,
        version: 1,
        items: [],
        totals: Object.fromEntries(nutrients.map((n) => [n, meal[n]])),
        date: date(),
        active: true,
        weekdays: allDays,
        legacy: true,
      });
      return diet.id;
    },
    ownedExercise: (u, id) => {
      const r = one(
        "SELECT payload FROM library WHERE id=? AND owner=? AND kind='exercise'",
        id,
        u.id,
      );
      return r ? JSON.parse(r.payload) : null;
    },
  };
}
