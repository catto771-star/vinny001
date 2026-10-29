import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app.mjs";
test("autenticação, isolamento, convites e planos vinculados com persistência", async () => {
  const folder = mkdtempSync(join(tmpdir(), "eir-test-")),
    database = join(folder, "db.sqlite"),
    origin = "http://localhost:5173";
  let app = createApp({ database, origin });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  let base = "http://127.0.0.1:" + app.server.address().port;
  async function req(path, body, cookie, expected = 200, extra = {}) {
    const r = await fetch(base + "/api" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json", Origin: origin }),
        ...(cookie ? { Cookie: cookie } : {}),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await r.json();
    assert.equal(r.status, expected, JSON.stringify(data));
    return { data, cookie: r.headers.get("set-cookie")?.split(";")[0], raw: r };
  }
  async function account(name, role) {
    const email = name + "@example.com",
      password = "UmaSenhaForte-2026!";
    await req("/auth/register", { name, email, password, role }, null, 201);
    return (await req("/auth/login", { email, password })).cookie;
  }
  try {
    await req("/state", undefined, null, 401);
    const trainer = await account("Personal", "trainer"),
      nutritionist = await account("Nutri", "nutritionist"),
      student = await account("Aluno", "student"),
      other = await account("Outro", "student");
    await req("/auth/login", { email: "Personal@example.com", password: "errada" }, null, 401);
    await req(
      "/students",
      { name: "Aluno", email: "aluno@example.com", goal: "Força", initial: 70, height: 170 },
      trainer,
      201,
    );
    let state = (await req("/state", undefined, trainer)).data;
    const id = state.students[0].id;
    assert.equal((await req("/state", undefined, nutritionist)).data.students.length, 0);
    assert.equal((await req("/state", undefined, student)).data.students.length, 0);
    await req("/invitations", { student: id }, nutritionist, 404);
    const invite = (await req("/invitations", { student: id }, trainer, 201)).data.url.split(
      "#invite=",
    )[1];
    await req("/invitations/accept", { token: invite }, other, 400);
    await req("/invitations/accept", { token: invite }, student);
    await req("/invitations/accept", { token: invite }, student, 400);
    const cmd = (kind, payload, owner = trainer, expected = 200) =>
      req("/commands", { commands: [{ kind, student: id, payload }] }, owner, expected);
    await cmd("workouts", {
      name: "Treino A",
      focus: "Força",
      duration: 40,
      exercises: [{ name: "Agachamento", sets: "3", reps: "12", load: "20 kg" }],
    });
    await cmd("workouts", { name: "Invadido" }, other, 404);
    await cmd("workouts", { name: "Invadido" }, student, 403);
    await cmd(
      "meals",
      {
        name: "Almoço",
        time: "12:00",
        foods: "Arroz e frango",
        kcal: 500,
        protein: 40,
        carbs: 50,
        fat: 10,
      },
      trainer,
      403,
    );
    const workout = (await req("/state", undefined, student)).data.workouts[0];
    assert.equal(workout.student, id);
    const session=(await req('/workout-sessions/start',{student:id,workoutId:workout.id},student,201)).data;
    await req('/workout-sessions/set',{sessionId:session.id,exerciseIndex:0,setIndex:1,load:20,reps:12},student);
    await req('/workout-sessions/finish',{sessionId:session.id},student);
    await req('/workout-sessions/finish',{sessionId:session.id},student);
    assert.equal((await req('/state',undefined,student)).data.logs.length,1);
    await req('/workout-sessions/start',{student:id,workoutId:'foreign'},student,404);
    await cmd('logs',{type:'workout',item:workout.id},trainer,403);
    await cmd("measurements", { weight: 69, note: "Evolução" }, student);
    await cmd("messages", { text: "Tudo certo", role: "professional" }, student);
    await req(
      "/commands",
      { commands: [{ action: "water", student: id, payload: { cups: 3 } }] },
      student,
    );
    state = (await req("/state", undefined, trainer)).data;
    assert.equal(state.students[0].weight, 69);
    assert.equal(state.messages[0].role, "student");
    assert.equal(state.logs.length, 1);
    await req(
      "/commands",
      {
        commands: [
          { kind: "measurements", student: id, payload: { weight: 60 } },
          { kind: "invalid", student: id, payload: {} },
        ],
      },
      student,
      400,
    );
    assert.equal(
      (await req("/state", undefined, trainer)).data.students[0].weight,
      69,
      "transaction rolls back all changes",
    );
    await req("/auth/logout", {}, student, 403, { Origin: "https://attacker.example" });
    await req(
      "/students",
      { name: "n", email: "n@example.com", goal: "g", initial: 70, height: 170 },
      student,
      403,
    );
    // Nutricionista tem um vínculo próprio com a mesma conta de aluno.
    await req(
      "/students",
      { name: "Aluno", email: "aluno@example.com", goal: "Nutrição", initial: 70, height: 170 },
      nutritionist,
      201,
    );
    const nid = (await req("/state", undefined, nutritionist)).data.students[0].id;
    const ntoken = (await req("/invitations", { student: nid }, nutritionist, 201)).data.url.split(
      "#invite=",
    )[1];
    await req("/invitations/accept", { token: ntoken }, student);
    await req(
      "/commands",
      {
        commands: [
          {
            kind: "meals",
            student: nid,
            payload: {
              name: "Almoço",
              time: "12:00",
              foods: "Arroz e frango",
              kcal: 500,
              protein: 40,
              carbs: 50,
              fat: 10,
            },
          },
        ],
      },
      nutritionist,
    );
    await req(
      "/commands",
      { commands: [{ kind: "workouts", student: nid, payload: {} }] },
      nutritionist,
      403,
    );
    const meal = (await req("/state", undefined, student)).data.meals[0];
    assert.equal(meal.student, nid);
    await req('/meal-consumptions',{student:nid,mealId:meal.id,quantities:[]},student,201);
    assert.equal(
      (await req("/state", undefined, trainer)).data.meals.length,
      0,
      "professional cannot read another professional plans",
    );
    assert.equal((await req("/state", undefined, other)).data.students.length, 0);
    // Restart the actual API against the same database and preserve sessions/data.
    await new Promise((r) => app.server.close(r));
    app.db.close();
    app = createApp({ database, origin });
    await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
    base = "http://127.0.0.1:" + app.server.address().port;
    assert.equal((await req("/state", undefined, trainer)).data.workouts[0].id, workout.id);
    const out = await req("/auth/logout", {}, student);
    assert.match(out.raw.headers.get("set-cookie"), /HttpOnly/);
    await req("/state", undefined, student, 401);
  } finally {
    await new Promise((r) => app.server.close(r));
    app.db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
test("produção exige HTTPS", () =>
  assert.throws(() => createApp({ production: true, origin: "http://insecure.example" }), /HTTPS/));
