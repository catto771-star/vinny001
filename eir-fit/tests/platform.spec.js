import { test, expect } from "@playwright/test";
test("contas reais: profissional prescreve e aluno aceita convite e conclui plano", async ({
  page,
  browser,
}) => {
  const suffix = Date.now(),
    email = `prof${suffix}@example.com`,
    studentEmail = `aluno${suffix}@example.com`,
    password = "UmaSenhaSegura-2026!";
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Primeiro acesso? Criar conta" }).click();
  await page.getByLabel("Nome completo").fill("Profissional Eir");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: false }).fill(password);
  await page.getByLabel("Seu perfil").selectOption("coach");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Novo aluno", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Novo aluno", exact: true }).click();
  await page.getByLabel("Nome completo").fill("Maria Teste");
  await page.getByLabel("E-mail", { exact: true }).fill(studentEmail);
  await page.getByLabel("Peso inicial (kg)").fill("65");
  await page.getByLabel("Altura (cm)").fill("165");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.getByRole("button", { name: "Meus alunos", exact: true }).click();
  await page.getByRole("button", { name: "Ver Maria Teste", exact: true }).click();
  await page.getByRole("button", { name: "Gerar convite" }).click();
  const invite = await page.getByLabel("Link de convite").inputValue();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: "Treinos", exact: true }).click();
  await page.getByRole("button", { name: "Criar treino", exact: true }).click();
  await page.getByLabel("Nome do treino").fill("Treino teste");
  await page.getByLabel("Foco", { exact: true }).fill("Força");
  await page.getByLabel("Exercícios", { exact: true }).fill("Agachamento; 3; 12; 20 kg");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.getByRole("button", { name: "Nutrição", exact: true }).click();
  const current = await (await page.request.get("/api/state")).json();
  const legacy = await page.request.post("/api/commands", {
    headers: { Origin: "http://127.0.0.1:5173" },
    data: {
      commands: [
        {
          kind: "meals",
          student: current.students[0].id,
          payload: {
            name: "Almoço teste",
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
  });
  expect(legacy.status()).toBe(200);
  await page.reload();
  await page.getByRole("button", { name: "Nutrição", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Almoço teste", exact: true }).last(),
  ).toBeVisible();
  const context = await browser.newContext();
  const learner = await context.newPage();
  learner.on("pageerror", (e) => errors.push(e.message));
  await learner.goto(invite);
  await learner.getByRole("button", { name: "Primeiro acesso? Criar conta" }).click();
  await learner.getByLabel("Nome completo").fill("Maria Teste");
  await learner.getByLabel("E-mail", { exact: true }).fill(studentEmail);
  await learner.getByLabel("Senha", { exact: false }).fill(password);
  await expect(learner.getByLabel("Seu perfil")).toHaveValue("student");
  await learner.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(learner.getByRole("button", { name: "Treinos", exact: true })).toBeVisible();
  await expect(learner.getByRole("button", { name: "Novo aluno", exact: true })).toHaveCount(0);
  await learner.getByRole("button", { name: "Treinos", exact: true }).click();
  await learner.getByRole("button", { name: "Iniciar treino", exact: true }).click();
  await expect(learner.getByRole("button", { name: "Concluir treino" })).toBeDisabled();
  for (let i = 1; i <= 3; i++) {
    await learner.getByLabel("Carga da série " + i, { exact: true }).fill("20");
    await learner.getByLabel("Repetições da série " + i, { exact: true }).fill("12");
    await learner
      .locator("form.set-row")
      .nth(i - 1)
      .getByRole("button", { name: "Salvar série", exact: true })
      .click();
  }
  await learner.getByRole("button", { name: "Concluir treino" }).click();
  await learner.getByRole("button", { name: "Nutrição", exact: true }).click();
  await learner.getByRole("button", { name: "Registrar", exact: true }).click();
  await learner.getByRole("button", { name: "Salvar consumo", exact: true }).click();
  await expect(learner.getByRole("button", { name: "Registrada", exact: true })).toBeVisible();
  await learner.getByRole("button", { name: "Registrar 3 copos de água" }).click();
  await expect(learner.getByText("3 de 8 copos")).toBeVisible();
  await learner.getByRole("button", { name: "Evolução", exact: true }).click();
  await learner.getByRole("button", { name: "Registrar evolução" }).click();
  await learner.getByLabel("Peso atual (kg)").fill("64");
  await learner.getByLabel("Observações").fill("Primeiro registro");
  await learner.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(learner.getByText("Primeiro registro")).toBeVisible();
  await expect(learner.getByText("1 treinos concluídos · 1 refeições registradas")).toBeVisible();
  await learner.getByRole("button", { name: "Mensagens", exact: true }).click();
  await learner.getByRole("textbox", { name: "Mensagem" }).fill("Treino concluído!");
  await learner.getByRole("button", { name: "Enviar" }).click();
  await expect(learner.getByText("Treino concluído!", { exact: true })).toBeVisible();
  await learner.reload();
  await learner.getByRole("button", { name: "Evolução", exact: true }).click();
  await expect(learner.getByText("Primeiro registro")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Evolução", exact: true }).click();
  await expect(page.getByText("Primeiro registro")).toBeVisible();
  await page.getByRole("button", { name: "Visão geral", exact: true }).click();
  await page.screenshot({ path: "screenshots/eir-fit-connected-desktop.png", fullPage: true });
  await learner.setViewportSize({ width: 390, height: 844 });
  await learner.getByRole("button", { name: "Abrir menu" }).click();
  await learner.getByRole("button", { name: "Nutrição", exact: true }).click();
  expect(
    await learner.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await learner.screenshot({ path: "screenshots/eir-fit-connected-mobile.png", fullPage: true });
  await learner.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(learner.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
  await context.close();
  expect(errors).toEqual([]);
});
