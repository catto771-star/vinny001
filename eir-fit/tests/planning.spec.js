import { test, expect } from "@playwright/test";
test("agenda semanal, planos inativos, retomada e consumo real", async ({ page, browser }) => {
  const origin = "http://127.0.0.1:5173",
    suffix = Date.now(),
    password = "SenhaDeTeste-2026!";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
      new Date(),
    ),
    day = new Date(today + "T12:00Z").getUTCDay() || 7,
    other = day === 7 ? 1 : day + 1,
    names = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
  const post = async (ctx, path, body, status = 200) => {
    const r = await ctx.post(origin + "/api" + path, { headers: { Origin: origin }, data: body });
    expect(r.status(), await r.text()).toBe(status);
    return r.json();
  };
  const pro = {
      name: "Coach Agenda",
      email: `agenda${suffix}@example.com`,
      password,
      role: "coach",
    },
    learner = {
      name: "Aluno Agenda",
      email: `alunoagenda${suffix}@example.com`,
      password,
      role: "student",
    };
  await post(page.request, "/auth/register", pro, 201);
  await post(page.request, "/auth/login", pro);
  let state = await post(
    page.request,
    "/students",
    { name: learner.name, email: learner.email, goal: "Agenda", initial: 70, height: 175 },
    201,
  );
  const student = state.students[0].id;
  const invite = await post(page.request, "/invitations", { student }, 201);
  const learnerContext = await browser.newContext();
  await post(learnerContext.request, "/auth/register", learner, 201);
  await post(learnerContext.request, "/auth/login", learner);
  await post(learnerContext.request, "/invitations/accept", {
    token: invite.url.split("#invite=")[1],
  });
  for (const [name, days, active] of [
    ["Treino de hoje", [day], true],
    ["Treino outro dia", [other], true],
    ["Treino inativo", [day], false],
  ])
    await post(page.request, "/commands", {
      commands: [
        {
          kind: "workouts",
          student,
          payload: {
            name,
            focus: "Força",
            duration: 40,
            weekdays: days,
            active,
            exercises: [{ name: "Agachamento", sets: "1", reps: "10", load: "20 kg" }],
          },
        },
      ],
    });
  const food = await post(
    page.request,
    "/library/foods",
    {
      name: "Alimento da agenda",
      sourceId: "rótulo",
      edition: "2026",
      kcal: 200,
      protein: 10,
      carbs: 20,
      fat: 5,
    },
    201,
  );
  for (const [name, days, grams] of [
    ["Dieta de hoje", [day], 100],
    ["Dieta outro dia", [other], 200],
  ])
    await post(
      page.request,
      "/protocols",
      {
        student,
        name,
        weekdays: days,
        items: [{ foodId: food.id, grams, meal: "Almoço", time: "12:30" }],
      },
      201,
    );
  const lp = await learnerContext.newPage();
  await lp.goto("/");
  await lp.getByRole("button", { name: "Treinos", exact: true }).click();
  await expect(lp.getByRole("heading", { name: "Treino de hoje", exact: true })).toBeVisible();
  await expect(lp.getByRole("heading", { name: "Treino outro dia", exact: true })).toHaveCount(0);
  await expect(lp.getByText("Treino inativo", { exact: true })).toHaveCount(0);
  await lp.getByRole("button", { name: names[other], exact: true }).click();
  await expect(lp.getByRole("heading", { name: "Treino outro dia", exact: true })).toBeVisible();
  await lp.getByRole("button", { name: names[day], exact: true }).click();
  await lp.getByRole("button", { name: "Iniciar treino", exact: true }).click();
  await lp.getByLabel("Carga da série 1", { exact: true }).fill("25");
  await lp.getByLabel("Repetições da série 1", { exact: true }).fill("10");
  await lp.getByRole("button", { name: "Salvar série", exact: true }).click();
  await expect(lp.getByRole("button", { name: "Salva", exact: true })).toBeVisible();
  await lp.getByRole("button", { name: "Fechar sessão", exact: true }).click();
  await lp.getByRole("button", { name: "Iniciar treino", exact: true }).click();
  await expect(lp.getByLabel("Carga da série 1", { exact: true })).toHaveValue("25");
  await lp.getByRole("button", { name: "Concluir treino", exact: true }).click();
  await lp.getByRole("button", { name: "Nutrição", exact: true }).click();
  await expect(lp.getByRole("heading", { name: "Dieta de hoje", exact: true })).toBeVisible();
  await lp.getByRole("button", { name: names[other], exact: true }).click();
  await expect(lp.getByRole("heading", { name: "Dieta outro dia", exact: true })).toBeVisible();
  await expect(lp.getByRole("button", { name: "Registrar", exact: true })).toBeDisabled();
  await lp.getByRole("button", { name: names[day], exact: true }).click();
  await lp.getByRole("button", { name: "Registrar", exact: true }).click();
  await lp.getByLabel("Alimento da agenda (g)", { exact: true }).fill("50");
  await lp.getByRole("button", { name: "Salvar consumo", exact: true }).click();
  await expect(lp.getByText(/Consumido.*100 kcal/)).toBeVisible();
  await lp.getByRole("button", { name: "Registrada", exact: true }).click();
  await lp.getByLabel("Alimento da agenda (g)", { exact: true }).fill("75");
  await lp.getByRole("button", { name: "Salvar consumo", exact: true }).click();
  await expect(lp.getByText(/Consumido.*150 kcal/)).toBeVisible();
  await lp.getByRole("button", { name: "Análises", exact: true }).click();
  await expect(
    lp.getByRole("heading", { name: "Evolução do consumo registrado", exact: true }),
  ).toBeVisible();
  await expect(
    lp
      .getByRole("table")
      .filter({ has: lp.getByText("Horário previsto", { exact: true }) })
      .getByRole("row"),
  ).toHaveCount(2);
  await page.goto("/");
  await page.getByRole("button", { name: "Nutrição", exact: true }).click();
  const diet = page
    .locator(".diet-plans .card")
    .filter({ has: page.getByRole("heading", { name: "Dieta outro dia", exact: true }) });
  await diet.locator("summary").filter({ hasText: "Agenda e estado" }).click();
  await diet.getByRole("button", { name: names[other], exact: true }).click();
  await diet.getByRole("button", { name: names[day], exact: true }).click();
  await diet.getByRole("button", { name: "Salvar agenda", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Já existe uma dieta ativa");
  await lp.setViewportSize({ width: 390, height: 844 });
  await lp.screenshot({ path: "screenshots/eir-fit-diary-mobile.png", fullPage: true });
  await learnerContext.close();
});
