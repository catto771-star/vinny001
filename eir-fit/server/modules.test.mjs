import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nutrition, youtube } from "./modules.mjs";
import { createApp } from "./app.mjs";
test("cálculo proporcional sem arredondamento acumulado e validação YouTube", () => {
  const f = { id: "1", name: "Teste", source: "custom", kcal: 200, protein: 10, carbs: 20, fat: 5 };
  const r = nutrition([{ foodId: "1", grams: 37.5 }], () => f)[0];
  assert.equal(r.kcal, 75);
  assert.equal(r.protein, 3.75);
  assert.equal(r.fat, 1.875);
  assert.throws(() => nutrition([{ foodId: "1", grams: -1 }], () => f));
  assert.equal(
    youtube("https://youtu.be/dQw4w9WgXcQ"),
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  );
  assert.equal(
    youtube("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  );
  assert.throws(() => youtube("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ"));
  assert.throws(() => youtube("javascript:alert(1)"));
});
test("coach, bibliotecas, dietas versionadas, execução, avaliações e prescrições isoladas", async () => {
  const dir = mkdtempSync(join(tmpdir(), "eir-modules-")),
    origin = "http://localhost:5173",
    app = createApp({ database: join(dir, "db.sqlite"), origin });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + app.server.address().port;
  async function req(path, body, cookie, expected = 200) {
    const r = await fetch(base + "/api" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await r.json();
    assert.equal(r.status, expected, JSON.stringify(data));
    return { data, cookie: r.headers.get("set-cookie")?.split(";")[0] };
  }
  async function account(name, role) {
    const f = { name, email: name + "@example.com", password: "UmaSenhaSegura-2026!", role };
    await req("/auth/register", f, null, 201);
    const r = await req("/auth/login", f);
    if (role === "coach") assert.equal(r.data.user.role, "coach");
    return r.cookie;
  }
  try {
    const coach = await account("Coach", "coach"),
      outsider = await account("Outside", "coach"),
      student = await account("Learner", "student");
    await req(
      "/students",
      {
        name: "Learner",
        email: "learner@example.com",
        goal: "Treino e dieta",
        initial: 70,
        height: 175,
      },
      coach,
      201,
    );
    const id = (await req("/state", undefined, coach)).data.students[0].id;
    const token = (await req("/invitations", { student: id }, coach, 201)).data.url.split(
      "#invite=",
    )[1];
    await req("/invitations/accept", { token }, student);
    await req("/library/exercises/starter", {}, coach, 201);
    assert.equal((await req("/library/exercises/starter", {}, coach, 201)).data.imported, 0);
    const ex = (
      await req(
        "/library/exercises",
        {
          name: "Agachamento teste",
          muscleGroup: "Quadríceps",
          equipment: "Barra",
          instructions: "Orientação",
          videoUrl: "https://youtu.be/dQw4w9WgXcQ",
        },
        coach,
        201,
      )
    ).data;
    await req(
      "/library/exercises",
      { name: "x", muscleGroup: "y", videoUrl: "https://evil.example/video" },
      coach,
      400,
    );
    const food = (
      await req(
        "/library/foods",
        {
          name: "Alimento teste",
          sourceId: "rótulo1",
          edition: "2026",
          kcal: 200,
          protein: 10,
          carbs: 20,
          fat: 5,
        },
        coach,
        201,
      )
    ).data;
    assert.equal(food.verified, false);
    await req(
      "/library/foods",
      { name: "Falso USDA", source: "usda", kcal: 1, protein: 1, carbs: 1, fat: 1 },
      coach,
      400,
    );
    await req(
      "/library/import",
      { source: "taco", edition: "4", licenseAccepted: false, foods: [] },
      coach,
      400,
    );
    await req(
      "/library/import",
      {
        source: "taco",
        edition: "4",
        licenseAccepted: true,
        foods: [
          {
            name: "Importado pelo usuário",
            sourceId: "123",
            kcal: 100,
            protein: 5,
            carbs: 15,
            fat: 2,
          },
        ],
      },
      coach,
      201,
    );
    assert.equal((await req("/state", undefined, outsider)).data.foods.length, 0);
    const protocol = {
      student: id,
      name: "Protocolo 1",
      items: [{ foodId: food.id, grams: 150, meal: "Almoço", time: "12:00" }],
    };
    const p1 = (await req("/protocols", protocol, coach, 201)).data;
    assert.equal(p1.totals.kcal, 300);
    assert.equal(p1.totals.protein, 15);
    await req(
      "/protocols",
      { ...protocol, items: [{ foodId: food.id, grams: 200, meal: "Almoço", time: "12:00" }] },
      outsider,
      404,
    );
    const before = (await req("/state", undefined, coach)).data;
    await req("/protocols", { ...protocol, items: [{ foodId: food.id, grams: -10 }] }, coach, 400);
    assert.equal(
      (await req("/state", undefined, coach)).data.protocols.length,
      before.protocols.length,
    );
    await req(
      "/protocols",
      {
        ...protocol,
        name: "Protocolo 2",
        revisionOf: p1.id,
        items: [{ foodId: food.id, grams: 200, meal: "Almoço", time: "12:00" }],
      },
      coach,
      201,
    );
    let state = (await req("/state", undefined, student)).data;
    assert.equal(state.protocols.length, 2);
    await req("/protocols", { ...protocol, revisionOf: p1.id, active: false }, coach, 409);
    assert.equal(state.protocols[0].totals.kcal, 300);
    assert.equal(state.protocols[1].totals.kcal, 400);
    assert.equal(state.meals.length, 1);
    assert.equal(state.meals[0].kcal, 400);
    assert.equal(state.foods.length, 0);
    const currentDiet=state.protocols.find(p=>p.active);
    await req('/plans/schedule',{type:'diet',id:currentDiet.id,active:false,weekdays:[1,2,3,4,5,6,7]},coach);
    await req('/plans/schedule',{type:'diet',id:p1.id,active:true,weekdays:[1,2,3,4,5,6,7]},coach);
    const reactivated=(await req('/state',undefined,student)).data.meals.find(m=>m.protocolId===p1.id);
    assert.equal(reactivated.kcal,300,'reactivating an older diet restores its prescribed meals');

    await req(
      "/commands",
      {
        commands: [
          {
            kind: "workouts",
            student: id,
            payload: {
              name: "A",
              focus: "Força",
              duration: 40,
              exercises: [
                { name: ex.name, libraryId: ex.id, sets: "3", reps: "12", load: "20 kg" },
              ],
            },
          },
        ],
      },
      coach,
    );
    const w = (await req("/state", undefined, student)).data.workouts[0];
    assert.equal(w.exercises[0].muscleGroup, "Quadríceps");
    const session = (
      await req("/workout-sessions/start", { student: id, workoutId: w.id }, student, 201)
    ).data;
    for (let i = 1; i <= 3; i++)
      await req(
        "/workout-sessions/set",
        { sessionId: session.id, exerciseIndex: 0, setIndex: i, load: 30, reps: 12 },
        student,
      );
    await req("/workout-sessions/finish", { sessionId: session.id }, student);
    const perf = (await req("/state", undefined, coach)).data.performances;
    assert.equal(
      perf.reduce((sum, p) => sum + p.volume, 0),
      1080,
    );
    assert.equal(perf[0].muscleGroup, "Quadríceps");
    await req(
      "/workout-sessions/set",
      { sessionId: session.id, exerciseIndex: 0, setIndex: 1, load: 30, reps: 12 },
      outsider,
      403,
    );
    const a = (
      await req("/assessments", { student: id, weight: 70, waist: 80, bodyFat: 15 }, coach, 201)
    ).data;
    assert.ok(Math.abs(a.bmi - 22.857142857) < 0.0001);
    assert.equal(a.hip, undefined);
    await req("/assessments", { student: id, weight: 70 }, outsider, 404);
    const prescription = (
      await req(
        "/prescriptions",
        {
          student: id,
          type: "supplement",
          name: "Registro de teste",
          instructions: "Conforme prescrição manual",
          frequency: "Orientação profissional",
          route: "Oral",
          startDate: "2026-10-01",
          endDate: "2026-12-01",
          credential: "Registro de teste",
        },
        coach,
        201,
      )
    ).data;
    await req(
      "/prescriptions/stop",
      { id: prescription.id, reason: "Fim do protocolo" },
      student,
      403,
    );
    await req("/prescriptions/stop", { id: prescription.id, reason: "Fim do protocolo" }, coach);
    state = (await req("/state", undefined, student)).data;
    assert.equal(state.prescriptions[0].status, "stopped");
    assert.equal(state.prescriptions[0].stopReason, "Fim do protocolo");
    assert.equal((await req("/state", undefined, outsider)).data.prescriptions.length, 0);
    // All new tables survive application restart (the existing suite covers actual restart).
    assert.equal(app.db.prepare("PRAGMA user_version").get().user_version, 3);
  } finally {
    await new Promise((r) => app.server.close(r));
    app.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
