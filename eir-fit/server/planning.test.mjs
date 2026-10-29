import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "./app.mjs";
import { weekday } from "./planning.mjs";
test("agenda sem dietas sobrepostas, quantidades consumidas e sessões reais preservam histórico", async () => {
  const dir = mkdtempSync(join(tmpdir(), "eir-planning-")),
    database = join(dir, "db.sqlite"),
    origin = "http://localhost:5173";
  let app = createApp({ database, origin });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  let base = "http://127.0.0.1:" + app.server.address().port;
  async function req(path, body, cookie, status = 200) {
    const response = await fetch(base + "/api" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    assert.equal(response.status, status, JSON.stringify(data));
    return { data, cookie: response.headers.get("set-cookie")?.split(";")[0] };
  }
  async function account(name, role) {
    const u = { name, email: name + "@example.com", role, password: "SenhaDeTeste-2026!" };
    await req("/auth/register", u, null, 201);
    return (await req("/auth/login", u)).cookie;
  }
  try {
    const coach = await account("coach", "coach"),
      other = await account("other", "coach"),
      learner = await account("learner", "student");
    await req(
      "/students",
      { name: "Aluno", email: "learner@example.com", goal: "Força", initial: 70, height: 175 },
      coach,
      201,
    );
    const student = (await req("/state", undefined, coach)).data.students[0].id;
    const token = (await req("/invitations", { student }, coach, 201)).data.url.split(
      "#invite=",
    )[1];
    await req("/invitations/accept", { token }, learner);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
        new Date(),
      ),
      day = weekday(today),
      another = day === 7 ? 1 : day + 1;
    const food = (
      await req(
        "/library/foods",
        {
          name: "Teste próprio",
          sourceId: "rótulo",
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
    const payload = {
      student,
      name: "Dieta A",
      weekdays: [day],
      active: true,
      items: [{ foodId: food.id, grams: 150, meal: "Almoço", time: "12:30" }],
    };
    const a = (await req("/protocols", payload, coach, 201)).data;
    const b = (
      await req("/protocols", { ...payload, name: "Dieta B", weekdays: [another] }, coach, 201)
    ).data;
    await req("/protocols", { ...payload, name: "Conflito" }, coach, 409);
    assert.equal((await req("/state", undefined, coach)).data.protocols.length, 2);
    const inactive = (
      await req("/protocols", { ...payload, name: "Dieta C", active: false }, coach, 201)
    ).data;
    await req(
      "/plans/schedule",
      { type: "diet", id: inactive.id, active: true, weekdays: [day] },
      coach,
      409,
    );
    await req(
      "/plans/schedule",
      { type: "diet", id: b.id, active: true, weekdays: [0] },
      coach,
      400,
    );
    // This other professional cannot see the first plan but still cannot double-book the same student.
    await req(
      "/students",
      {
        name: "Aluno",
        email: "learner@example.com",
        goal: "Outro acompanhamento",
        initial: 70,
        height: 175,
      },
      other,
      201,
    );
    const foreignStudent = (await req("/state", undefined, other)).data.students[0].id;
    const foreignFood = (
      await req(
        "/library/foods",
        {
          name: "Outro teste",
          sourceId: "rótulo",
          edition: "2026",
          kcal: 100,
          protein: 5,
          carbs: 15,
          fat: 2,
        },
        other,
        201,
      )
    ).data;
    await req(
      "/protocols",
      {
        ...payload,
        student: foreignStudent,
        items: [{ foodId: foreignFood.id, grams: 100, meal: "Café", time: "08:00" }],
      },
      other,
      409,
    );
    assert.equal((await req("/state", undefined, other)).data.protocols.length, 0);
    await req("/plans/schedule", { type: "diet", id: a.id, active: false, weekdays: [day] }, coach);
    await req(
      "/plans/schedule",
      { type: "diet", id: inactive.id, active: true, weekdays: [day] },
      coach,
    );
    let state = (await req("/state", undefined, learner)).data;
    const meal = state.meals.find((m) => m.protocolId === inactive.id),
      oldMeal = state.meals.find((m) => m.protocolId === a.id);
    await req(
      "/meal-consumptions",
      { student, mealId: oldMeal.id, quantities: [100] },
      learner,
      409,
    );
    const consumed = (
      await req(
        "/meal-consumptions",
        {
          student,
          mealId: meal.id,
          quantities: [75],
          items: [{ foodId: foreignFood.id }],
          totals: { kcal: 99999 },
        },
        learner,
        201,
      )
    ).data;
    assert.equal(consumed.totals.kcal, 150);
    assert.equal(consumed.planned.totals.kcal, 300);
    assert.equal(consumed.items[0].foodId, food.id);
    assert.equal(consumed.scheduledTime, "12:30");
    assert.ok(consumed.executedAt);
    await req(
      "/meal-consumptions",
      { student, mealId: meal.id, quantities: [75, 10] },
      learner,
      400,
    );
    await req("/meal-consumptions", { student, mealId: meal.id, quantities: [100] }, learner);
    state = (await req("/state", undefined, coach)).data;
    assert.equal(state.consumptions.length, 1);
    assert.equal(state.consumptions[0].totals.kcal, 200);
    await req(
      "/plans/schedule",
      { type: "diet", id: inactive.id, active: false, weekdays: [day] },
      coach,
    );
    assert.equal((await req("/state", undefined, learner)).data.consumptions[0].totals.kcal, 200);
    const work = (
      await req(
        "/commands",
        {
          commands: [
            {
              kind: "workouts",
              student,
              payload: {
                name: "Treino A",
                focus: "Força",
                duration: 45,
                active: true,
                weekdays: [day],
                exercises: [
                  {
                    name: "Agachamento",
                    sets: "2",
                    reps: "10",
                    load: "20 kg",
                    muscleGroup: "Quadríceps",
                  },
                ],
              },
            },
          ],
        },
        coach,
      )
    ).data.workouts[0];
    const session = (
      await req("/workout-sessions/start", { student, workoutId: work.id }, learner, 201)
    ).data;
    assert.equal(
      (await req("/workout-sessions/start", { student, workoutId: work.id }, learner)).data.id,
      session.id,
    );
    await req("/workout-sessions/finish", { sessionId: session.id }, learner, 400);
    await req(
      "/workout-sessions/set",
      { sessionId: session.id, exerciseIndex: 0, setIndex: 1, load: 20, reps: 10 },
      learner,
    );
    await req(
      "/workout-sessions/set",
      { sessionId: session.id, exerciseIndex: 0, setIndex: 1, load: 25, reps: 10 },
      learner,
    );
    await req(
      "/workout-sessions/set",
      { sessionId: session.id, exerciseIndex: 0, setIndex: 2, load: 30, reps: 8 },
      learner,
    );
    await req("/workout-sessions/finish", { sessionId: session.id }, learner);
    await req("/workout-sessions/finish", { sessionId: session.id }, learner);
    state = (await req("/state", undefined, coach)).data;
    assert.equal(state.workoutSessions[0].sets.length, 2);
    assert.equal(
      state.performances.reduce((sum, p) => sum + p.volume, 0),
      490,
    );
    assert.equal(state.logs.filter((l) => l.type === "workout").length, 1);
    await req(
      "/workout-sessions/set",
      { sessionId: session.id, exerciseIndex: 0, setIndex: 1, load: 99, reps: 8 },
      learner,
      409,
    );
    const second = (
      await req("/workout-sessions/start", { student, workoutId: work.id }, learner, 201)
    ).data;
    assert.notEqual(second.id, session.id);
    await req(
      "/plans/schedule",
      { type: "workout", id: work.id, active: false, weekdays: [day] },
      coach,
    );
    assert.equal(
      (await req("/workout-sessions/start", { student, workoutId: work.id }, learner)).data.id,
      second.id,
    );
    await req(
      "/workout-sessions/set",
      { sessionId: second.id, exerciseIndex: 0, setIndex: 1, load: 10, reps: 5 },
      learner,
    );
    await req("/workout-sessions/finish", { sessionId: second.id }, learner);
    await req("/workout-sessions/start", { student, workoutId: work.id }, learner, 409);
    await req(
      "/plans/schedule",
      { type: "workout", id: work.id, active: true, weekdays: [day] },
      learner,
      403,
    );
    await req("/assessments", { student, weight: 70 }, learner, 403);
    await req("/assessments", { student, weight: 70 }, coach, 201);
    await req("/assessments", { student, weight: 69, waist: 80 }, coach, 201);
    assert.equal((await req("/state", undefined, learner)).data.assessments.length, 2);
    await new Promise((r) => app.server.close(r));
    app.db.close();
    app = createApp({ database, origin });
    await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
    base = "http://127.0.0.1:" + app.server.address().port;
    state = (await req("/state", undefined, coach)).data;
    assert.equal(state.consumptions.length, 1);
    assert.equal(state.workoutSessions.length, 2);
    assert.equal(state.performances.length, 3);
    assert.equal(state.assessments.length, 2);
    assert.equal((await req("/state", undefined, other)).data.workoutSessions.length, 0);
  } finally {
    await new Promise((r) => app.server.close(r));
    app.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
