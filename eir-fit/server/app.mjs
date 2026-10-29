import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  randomUUID,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { mkdirSync, chmodSync, readFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { tracking } from "./tracking.mjs";
import { scheduleInput } from "./planning.mjs";
import { modules } from "./modules.mjs";
const scrypt = promisify(scryptCallback),
  hash = (s) => createHash("sha256").update(s).digest("hex");
export function createApp({
  database = process.env.DATABASE_PATH || "./data/eir-fit.sqlite",
  origin = process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL || "http://localhost:5173",
  production = process.env.NODE_ENV === "production",
  dist = resolve("dist"),
} = {}) {
  if (production && !origin.startsWith("https://"))
    throw Error("APP_ORIGIN deve usar HTTPS em produção");
  mkdirSync(dirname(resolve(database)), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(database);
  chmodSync(database, 0o600);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('student','trainer','nutritionist','both')),created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS students(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id),user_id TEXT REFERENCES users(id),name TEXT NOT NULL,email TEXT NOT NULL,goal TEXT NOT NULL,initial REAL NOT NULL,weight REAL NOT NULL,height REAL NOT NULL,UNIQUE(owner,email));
 CREATE TABLE IF NOT EXISTS invitations(token TEXT PRIMARY KEY,student TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('workouts','meals','logs','measurements','messages')),student TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,author TEXT NOT NULL REFERENCES users(id),payload TEXT NOT NULL,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS water(student TEXT NOT NULL REFERENCES students(id),date TEXT NOT NULL,cups INTEGER NOT NULL CHECK(cups BETWEEN 0 AND 8),PRIMARY KEY(student,date));
 CREATE INDEX IF NOT EXISTS student_user ON students(user_id); CREATE INDEX IF NOT EXISTS record_student ON records(student,kind); CREATE INDEX IF NOT EXISTS session_user ON sessions(user_id);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,subject TEXT NOT NULL,created TEXT NOT NULL);
`);
  if (db.prepare("PRAGMA user_version").get().user_version < 1) db.exec("PRAGMA user_version=1");
  const run = (sql, ...args) => db.prepare(sql).run(...args),
    one = (sql, ...args) => db.prepare(sql).get(...args),
    all = (sql, ...args) => db.prepare(sql).all(...args);
  const fail = (code, message) => {
    throw Object.assign(Error(message), { status: code });
  };
  const text = (v, max = 200) =>
    typeof v === "string" && v.trim() && v.length <= max
      ? v.trim()
      : fail(400, "Campo de texto inválido");
  const num = (v, min, max) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max
      ? v
      : fail(400, "Número fora do intervalo permitido");
  const email = (v) => {
    v = text(v, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail(400, "E-mail inválido");
    return v;
  };
  const password = async (p) => {
    if (typeof p !== "string" || p.length < 12 || p.length > 128)
      fail(400, "Use uma senha entre 12 e 128 caracteres");
    const salt = randomBytes(16).toString("hex");
    return salt + ":" + (await scrypt(p, salt, 64)).toString("hex");
  };
  const publicUser = (u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role === "both" ? "coach" : u.role,
  });
  const date = () =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const cookie = (token, maxAge) =>
    `eir_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${production ? "; Secure" : ""}`;
  const audit = (u, action, id) =>
    run(
      "INSERT INTO audit(actor,action,subject,created) VALUES(?,?,?,?)",
      u.id,
      action,
      id,
      new Date().toISOString(),
    );
  function scope(u, id) {
    const s = one("SELECT * FROM students WHERE id=?", id);
    if (!s || (u.role === "student" ? s.user_id !== u.id : s.owner !== u.id))
      fail(404, "Aluno não encontrado");
    return s;
  }
  const extra = modules({ db, scope, fail, text, num, audit, date });
  const execution = tracking({ db, scope, fail, text, num, audit, date });
  function state(u) {
    const students = all(
      u.role === "student"
        ? "SELECT * FROM students WHERE user_id=?"
        : "SELECT * FROM students WHERE owner=?",
      u.id,
    ).map(({ owner, user_id, ...s }) => ({
      ...s,
      status: user_id ? "Vinculado" : "Convite pendente",
      color: "#d5e1cd",
      professionalName: one("SELECT name FROM users WHERE id=?", owner).name,
    }));
    const ids = students.map((s) => s.id);
    const data = {
      students,
      workouts: [],
      meals: [],
      logs: [],
      measurements: [],
      messages: [],
      water: {},
    };
    for (const id of ids) {
      for (const r of all("SELECT * FROM records WHERE student=? ORDER BY created,id", id))
        data[r.kind].push(JSON.parse(r.payload));
      for (const w of all("SELECT * FROM water WHERE student=?", id))
        data.water[w.student + w.date] = w.cups;
    }
    data.meals = data.meals.filter((m) => !m.archived);
    const extensions = extra.state(u, students),
      actual = execution.state(u, students);
    return {
      ...data,
      ...extensions,
      ...actual,
      performances: [...extensions.performances, ...actual.setPerformances].sort((a, b) =>
        (a.created || a.date).localeCompare(b.created || b.date),
      ),
    };
  }
  function command(u, c) {
    const kind = c.kind,
      p = c.payload || {},
      s = scope(u, c.student),
      id = randomUUID();
    if (c.action === "water") {
      if (u.role !== "student") fail(403, "Apenas o aluno registra hidratação");
      run(
        "INSERT INTO water VALUES(?,?,?) ON CONFLICT(student,date) DO UPDATE SET cups=excluded.cups",
        s.id,
        date(),
        num(p.cups, 0, 8),
      );
      return;
    }
    if (c.action === "remove-log") fail(400, "Edite o consumo pelo diário alimentar");
    let value;
    if (kind === "workouts" || kind === "meals") {
      if (
        u.role === "student" ||
        (kind === "workouts" && !["trainer", "both"].includes(u.role)) ||
        (kind === "meals" && !["nutritionist", "both"].includes(u.role))
      )
        fail(403, "Seu perfil não permite esta prescrição");
      if (kind === "workouts") {
        if (!Array.isArray(p.exercises) || !p.exercises.length || p.exercises.length > 50)
          fail(400, "Informe de 1 a 50 exercícios");
        value = {
          ...scheduleInput(p),
          name: text(p.name),
          focus: text(p.focus),
          duration: num(p.duration, 5, 240),
          exercises: p.exercises.map((e) => {
            const library = e.libraryId ? extra.ownedExercise(u, e.libraryId) : null;
            if (e.libraryId && !library) fail(404, "Exercício da biblioteca não encontrado");
            return {
              libraryId: library?.id || null,
              muscleGroup: library?.muscleGroup || text(e.muscleGroup || "Não classificado", 80),
              videoUrl: library?.videoUrl || "",
              instructions: library?.instructions || "",
              name: library?.name || text(e.name),
              sets: text(String(e.sets), 20),
              reps: text(String(e.reps), 30),
              load: text(String(e.load), 60),
            };
          }),
        };
      } else {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.time)) fail(400, "Horário inválido");
        value = {
          name: text(p.name),
          time: p.time,
          foods: text(p.foods, 4000),
          kcal: num(p.kcal, 0, 5000),
          protein: num(p.protein, 0, 500),
          carbs: num(p.carbs, 0, 1000),
          fat: num(p.fat, 0, 500),
        };
      }
    } else if (kind === "logs") {
      if (u.role !== "student") fail(403, "Apenas o aluno registra atividades");
      fail(400, "Registre a execução na sessão de treino ou no diário alimentar");
    } else if (kind === "measurements") {
      value = {
        weight: num(p.weight, 20, 400),
        date: date(),
        note: typeof p.note === "string" ? p.note.slice(0, 2000) : "",
      };
      run("UPDATE students SET weight=? WHERE id=?", value.weight, s.id);
    } else if (kind === "messages") {
      value = {
        text: text(p.text, 2000),
        role: u.role === "student" ? "student" : "professional",
        sender: u.name,
        at: new Date().toISOString(),
      };
    } else fail(400, "Operação inválida");
    const record = { ...value, id, student: s.id };
    if (kind === "meals") record.protocolId = extra.manualDiet(u, s, record);
    run(
      "INSERT INTO records VALUES(?,?,?,?,?,?)",
      id,
      kind,
      s.id,
      u.id,
      JSON.stringify(record),
      new Date().toISOString(),
    );
    audit(u, "create:" + kind, id);
  }
  const limiter = new Map();
  const limited = (key, max) => {
    const now = Date.now();
    let v = limiter.get(key);
    if (!v || v.until < now) {
      v = { count: 0, until: now + 900000 };
      limiter.set(key, v);
    }
    if (++v.count > max) fail(429, "Muitas tentativas. Aguarde 15 minutos.");
    if (limiter.size > 10000) for (const [k, v] of limiter) if (v.until < now) limiter.delete(k);
  };
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    if (production) res.setHeader("Strict-Transport-Security", "max-age=31536000");
    const send = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(data));
    };
    try {
      const requestUrl = new URL(req.url, "http://local");
      const path = requestUrl.pathname;
      if (!path.startsWith("/api/")) {
        if (req.method !== "GET" && req.method !== "HEAD")
          return send(405, { error: "Método inválido" });
        let file = resolve(dist, "." + decodeURIComponent(path));
        if (!file.startsWith(dist + "/")) file = resolve(dist, "index.html");
        if (!existsSync(file) || statSync(file).isDirectory()) file = resolve(dist, "index.html");
        if (!existsSync(file)) return send(404, { error: "Execute npm run build" });
        res.setHeader(
          "Content-Type",
          {
            ".html": "text/html; charset=utf-8",
            ".js": "text/javascript",
            ".css": "text/css",
            ".svg": "image/svg+xml",
            ".png": "image/png",
          }[extname(file)] || "application/octet-stream",
        );
        res.setHeader(
          "Cache-Control",
          file.includes("/assets/") ? "public,max-age=31536000,immutable" : "no-cache",
        );
        res.end(req.method === "HEAD" ? undefined : readFileSync(file));
        return;
      }
      if (path === "/api/health" && req.method === "GET")
        return send(200, { ok: one("SELECT 1 AS ok").ok === 1 });
      let body = {};
      if (!["GET", "HEAD"].includes(req.method)) {
        if (req.headers.origin !== origin) fail(403, "Origem da requisição não permitida");
        if (!req.headers["content-type"]?.startsWith("application/json"))
          fail(415, "Use application/json");
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (Buffer.byteLength(raw) > 100000) fail(413, "Requisição muito grande");
        }
        try {
          body = JSON.parse(raw || "{}");
        } catch {
          fail(400, "JSON inválido");
        }
        if (!body || typeof body !== "object" || Array.isArray(body))
          fail(400, "Objeto JSON esperado");
      }
      if (path === "/api/auth/register" && req.method === "POST") {
        limited("register:" + req.socket.remoteAddress, 20);
        const name = text(body.name),
          mail = email(body.email);
        if (body.role === "coach") body.role = "both";
        if (!["student", "trainer", "nutritionist", "both"].includes(body.role))
          fail(400, "Perfil inválido");
        const encoded = await password(body.password);
        try {
          run(
            "INSERT INTO users VALUES(?,?,?,?,?,?)",
            randomUUID(),
            name,
            mail,
            encoded,
            body.role,
            new Date().toISOString(),
          );
        } catch (e) {
          if (e.code?.includes("CONSTRAINT") || e.errcode === 2067)
            fail(409, "Não foi possível cadastrar este e-mail");
          throw e;
        }
        return send(201, { ok: true });
      }
      if (path === "/api/auth/login" && req.method === "POST") {
        const mail = email(body.email);
        limited("login:" + req.socket.remoteAddress, 100);
        limited("login-email:" + mail, 20);
        const u = one("SELECT * FROM users WHERE email=?", mail);
        const [salt, stored] = u?.password.split(":") || [
          "00000000000000000000000000000000",
          "00".repeat(64),
        ];
        const supplied = await scrypt(
          typeof body.password === "string" ? body.password.slice(0, 128) : "",
          salt,
          64,
        );
        if (!u || !timingSafeEqual(Buffer.from(stored, "hex"), supplied))
          fail(401, "E-mail ou senha incorretos");
        const token = randomBytes(32).toString("hex");
        run("DELETE FROM sessions WHERE expires<?", Date.now());
        run("INSERT INTO sessions VALUES(?,?,?)", hash(token), u.id, Date.now() + 7 * 86400000);
        res.setHeader("Set-Cookie", cookie(token, 7 * 86400));
        return send(200, { user: publicUser(u) });
      }
      const token = req.headers.cookie
        ?.split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("eir_session="))
        ?.slice(12);
      const u = token
        ? one(
            "SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token=? AND expires>?",
            hash(token),
            Date.now(),
          )
        : null;
      if (!u && path !== "/api/auth/logout") fail(401, "Entre para continuar");
      if (path === "/api/auth/me" && req.method === "GET")
        return send(200, { user: publicUser(u) });
      if (path === "/api/auth/logout" && req.method === "POST") {
        if (token) run("DELETE FROM sessions WHERE token=?", hash(token));
        res.setHeader("Set-Cookie", cookie("", 0));
        return send(200, { ok: true });
      }
      if (path === "/api/state" && req.method === "GET") return send(200, state(u));
      const tracked = await execution.route(path, req.method, body, u);
      if (tracked) return send(tracked.status || 200, tracked.value);
      const extension = await extra.route(path, req.method, body, u, requestUrl.searchParams);
      if (extension) return send(extension.status || 200, extension.value);
      if (path === "/api/students" && req.method === "POST") {
        if (u.role === "student") fail(403, "Somente profissionais cadastram alunos");
        let id = randomUUID();
        try {
          run(
            "INSERT INTO students VALUES(?,?,NULL,?,?,?,?,?,?)",
            id,
            u.id,
            text(body.name),
            email(body.email),
            text(body.goal),
            num(body.initial, 20, 400),
            num(body.initial, 20, 400),
            num(body.height, 80, 250),
          );
        } catch (e) {
          if (e.code?.includes("CONSTRAINT") || e.errcode === 2067)
            fail(409, "Este aluno já está cadastrado");
          throw e;
        }
        audit(u, "create:student", id);
        return send(201, state(u));
      }
      if (path === "/api/invitations" && req.method === "POST") {
        if (u.role === "student") fail(403, "Apenas profissionais criam convites");
        const s = scope(u, body.student);
        if (s.user_id) fail(409, "Aluno já vinculado");
        const token = randomBytes(32).toString("hex");
        run("DELETE FROM invitations WHERE student=? AND used=0", s.id);
        run(
          "INSERT INTO invitations VALUES(?,?,?,0)",
          hash(token),
          s.id,
          Date.now() + 72 * 3600000,
        );
        audit(u, "invite", s.id);
        return send(201, { url: origin + "/#invite=" + token, expiresHours: 72, email: s.email });
      }
      if (path === "/api/invitations/accept" && req.method === "POST") {
        if (u.role !== "student") fail(403, "Entre com uma conta de aluno");
        const i = one(
          "SELECT invitations.*,students.email,students.user_id FROM invitations JOIN students ON students.id=invitations.student WHERE token=? AND used=0 AND expires>?",
          hash(text(body.token, 128)),
          Date.now(),
        );
        if (!i || i.email !== u.email || i.user_id)
          fail(400, "Convite inválido, expirado ou destinado a outro e-mail");
        db.exec("BEGIN IMMEDIATE");
        try {
          run("UPDATE students SET user_id=? WHERE id=?", u.id, i.student);
          run("UPDATE invitations SET used=1 WHERE token=?", i.token);
          audit(u, "accept-invite", i.student);
          db.exec("COMMIT");
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
        return send(200, state(u));
      }
      if (path === "/api/commands" && req.method === "POST") {
        if (!Array.isArray(body.commands) || body.commands.length < 1 || body.commands.length > 20)
          fail(400, "Comandos inválidos");
        db.exec("BEGIN IMMEDIATE");
        try {
          for (const c of body.commands) command(u, c);
          db.exec("COMMIT");
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
        return send(200, state(u));
      }
      return send(404, { error: "Rota não encontrada" });
    } catch (e) {
      if (!res.headersSent)
        send(e.status || 500, { error: e.status ? e.message : "Erro interno. Tente novamente." });
      else res.end();
      if (!e.status) console.error("Request error:", e.code || e.name);
    }
  });
  return { server, db };
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const { server } = createApp();
  server.listen(Number(process.env.PORT) || 3001, "0.0.0.0", () =>
    console.log("Eir Fit API iniciada"),
  );
}
