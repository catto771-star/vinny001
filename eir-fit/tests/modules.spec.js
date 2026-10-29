import { test, expect } from "@playwright/test";
test("coach usa bibliotecas, versiona dieta, avalia e prescreve; aluno registra carga; idiomas", async ({
  page,
  browser,
}) => {
  const suffix = Date.now(),
    password = "SenhaParaTeste-2026!",
    origin = "http://127.0.0.1:5173";
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const post = async (context, path, data, status = 200) => {
    const r = await context.post(origin + "/api" + path, { data, headers: { Origin: origin } });
    expect(r.status(), await r.text()).toBe(status);
    return r.json();
  };
  const pro = { name: "Coach Teste", email: `coach${suffix}@example.com`, password, role: "coach" },
    learner = {
      name: "Aluno Módulos",
      email: `mod${suffix}@example.com`,
      password,
      role: "student",
    };
  await post(page.request, "/auth/register", pro, 201);
  await post(page.request, "/auth/login", pro);
  const state = await post(
      page.request,
      "/students",
      {
        name: learner.name,
        email: learner.email,
        goal: "Treino e dieta",
        initial: 70,
        height: 175,
      },
      201,
    ),
    id = state.students[0].id;
  const invitation = await post(page.request, "/invitations", { student: id }, 201);
  const studentContext = await browser.newContext();
  await post(studentContext.request, "/auth/register", learner, 201);
  await post(studentContext.request, "/auth/login", learner);
  await post(studentContext.request, "/invitations/accept", {
    token: invitation.url.split("#invite=")[1],
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Biblioteca de exercícios", exact: true }).click();
  await page.getByLabel("Nome do exercício", { exact: true }).fill("Agachamento biblioteca");
  await page.getByLabel("Grupo muscular", { exact: true }).fill("Quadríceps");
  await page.getByLabel("Equipamento", { exact: true }).fill("Barra");
  await page.getByLabel("Link do YouTube (opcional)").fill("https://youtu.be/dQw4w9WgXcQ");
  await page.getByLabel("Orientações", { exact: true }).fill("Execução supervisionada");
  await page
    .locator("form")
    .filter({ has: page.getByLabel("Nome do exercício", { exact: true }) })
    .getByRole("button", { name: "Salvar", exact: true })
    .click();
  await page.getByRole("checkbox", { name: "Agachamento biblioteca" }).check();
  await page.getByLabel("Nome do treino", { exact: true }).fill("Treino de biblioteca");
  await page.getByLabel("Foco", { exact: true }).fill("Força");
  await page
    .locator("form")
    .filter({ has: page.getByLabel("Nome do treino", { exact: true }) })
    .getByRole("button", { name: "Salvar", exact: true })
    .click();
  await page.getByRole("button", { name: "Alimentos", exact: true }).click();
  await page.getByLabel("Nome do alimento", { exact: true }).fill("Alimento teste");
  await page.getByLabel("Referência / rótulo").fill("Rótulo de teste");
  await page.getByLabel("Edição / data da referência").fill("2026");
  for (const [label, value] of [
    ["Energia (kcal)", "200"],
    ["Proteína (g)", "10"],
    ["Carboidratos (g)", "20"],
    ["Gorduras (g)", "5"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page
    .locator("form")
    .filter({ has: page.getByLabel("Nome do alimento", { exact: true }) })
    .getByRole("button", { name: "Salvar", exact: true })
    .click();
  await expect(page.getByText("Alimento teste", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Construtor de dieta", exact: true }).click();
  await page.getByLabel("Nome do protocolo").fill("Protocolo inicial");
  await page.getByRole("button", { name: "Adicionar alimento" }).click();
  await page
    .getByLabel("Alimento", { exact: true })
    .selectOption({ label: "Alimento teste · CUSTOM" });
  await page.getByLabel("Quantidade (g)").fill("150");
  await page.getByRole("button", { name: "Publicar novo protocolo" }).click();
  await expect(page.getByText("v1 · Protocolo inicial")).toBeVisible();
  await page.getByRole("button", { name: "Revisar esta dieta", exact: true }).click();
  await page.getByLabel("Nome do protocolo").fill("Protocolo ajustado");
  await page.getByLabel("Quantidade (g)").fill("200");
  await page.getByRole("button", { name: "Publicar novo protocolo" }).click();
  await expect(page.getByText("v2 · Protocolo ajustado")).toBeVisible();
  await page.getByRole("button", { name: "Avaliação física", exact: true }).click();
  await page.getByLabel("Peso (kg)", { exact: true }).fill("70");
  await page.getByLabel("Gordura corporal (%)").fill("15");
  await page.getByLabel("Cintura (cm)").fill("80");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText(/70 kg.*Gordura corporal\s*:\s*15%/)).toBeVisible();
  await page.getByRole("button", { name: "Prescrições", exact: true }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Suplemento teste");
  await page
    .getByLabel("Orientação / dose prescrita")
    .fill("Registro de orientação profissional para teste");
  await page.getByLabel("Frequência", { exact: true }).fill("Conforme avaliação");
  await page.getByLabel("Via de uso").fill("Oral");
  await page.getByLabel("Fim", { exact: true }).fill("2027-12-31");
  await page
    .getByLabel("Habilitação / registro do prescritor")
    .fill("Registro do prescritor de teste");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Suplemento teste" })).toBeVisible();
  const studentPage = await studentContext.newPage();
  studentPage.on("pageerror", (e) => errors.push(e.message));
  await studentPage.goto("/");
  await studentPage.getByRole("button", { name: "Treinos", exact: true }).click();
  await expect(studentPage.getByRole("link", { name: "Assistir no YouTube" })).toHaveAttribute(
    "href",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  );
  await studentPage.getByRole("button", { name: "Iniciar treino", exact: true }).click();
  for (let i = 1; i <= 3; i++) {
    await studentPage.getByLabel("Carga da série " + i, { exact: true }).fill("30");
    await studentPage.getByLabel("Repetições da série " + i, { exact: true }).fill("12");
    await studentPage
      .locator("form.set-row")
      .nth(i - 1)
      .getByRole("button", { name: "Salvar série", exact: true })
      .click();
  }
  await studentPage.getByRole("button", { name: "Concluir treino", exact: true }).click();
  await studentPage.getByRole("button", { name: "Análises", exact: true }).click();
  await expect(studentPage.getByText("1.080 kg·rep").first()).toBeVisible();
  await studentPage.getByRole("button", { name: "Nutrição", exact: true }).click();
  await expect(studentPage.getByText("Alimento teste (200 g)")).toBeVisible();
  await studentPage.getByRole("button", { name: "Registrar", exact: true }).click();
  await studentPage.getByLabel("Alimento teste (g)", { exact: true }).fill("100");
  await studentPage.getByRole("button", { name: "Salvar consumo", exact: true }).click();
  await expect(studentPage.getByText(/Consumido.*200 kcal/)).toBeVisible();

  await expect(studentPage.getByRole("button", { name: "Publicar novo protocolo" })).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Análises", exact: true }).click();
  await expect(page.getByText("1.080 kg·rep").first()).toBeVisible();
  await page.screenshot({ path: "screenshots/eir-fit-analytics.png", fullPage: true });
  await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("en");
  await expect(
    page.getByRole("button", { name: "Physical assessment", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Training progression", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Exercise library", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("es");
  await expect(page.getByRole("button", { name: "Evaluación física", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Evaluación física", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nueva evaluación física" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".sidebar")).not.toBeInViewport();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.screenshot({ path: "screenshots/eir-fit-assessment-mobile.png", fullPage: true });
  await studentContext.close();
  expect(errors).toEqual([]);
});
