// Revisão 10 — Configurações: parâmetros do sistema editáveis pelo Admin, com validação.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, type Actor } from "./helpers";

let db: Db;
let manager: Actor, station: Actor;

beforeEach(async () => {
  db = await Db.open();
  manager = await db.createStaff("manager", "Gestão");
  station = await db.createStaff("station", "Amiens Reception");
});
afterEach(async () => { await db.close(); });

const set = (key: string, value: unknown) => db.error("select public.set_system_parameter($1, $2::jsonb)", [key, JSON.stringify(value)]);
const get = async (key: string) => (await db.one("select public.param_value($1) as v", [key])).v;

describe("set_system_parameter", () => {
  it("Admin muda um parâmetro; vale a partir de agora e o histórico anterior fica guardado", async () => {
    await db.as(manager);
    expect(await set("presence.check_times", ["13:00", "19:00", "23:00"])).toBeNull();
    expect(await get("presence.check_times")).toEqual(["13:00", "19:00", "23:00"]);
    await db.asSuperuser();
    expect((await db.one("select count(*)::int as n from public.parameters where key = 'presence.check_times'")).n).toBe(2);
    expect((await db.one("select created_by is not null as ok from public.parameters where key = 'presence.check_times' order by id desc limit 1")).ok).toBe(true);
  });
  it("horários: ordena, remove repetidos e recusa formato inválido ou lista vazia", async () => {
    await db.as(manager);
    expect(await set("rounds.hours", ["10:00", "08:00", "10:00"])).toBeNull();
    expect(await get("rounds.hours")).toEqual(["08:00", "10:00"]);
    for (const bad of [[], ["25:00"], ["8:00"], ["ab"], "08:00", [8]]) expect(await set("rounds.hours", bad)).toMatch(/invalid_parameter/);
  });
  it("números e faixas: limites e ordem (min < max; urgent ≤ normal ≤ low)", async () => {
    await db.as(manager);
    expect(await set("fridge.range_celsius", { min: 1, max: 6 })).toBeNull();
    expect(await set("fridge.range_celsius", { min: 6, max: 1 })).toMatch(/invalid_parameter/);
    expect(await set("fridge.range_celsius", { min: -50, max: 6 })).toMatch(/invalid_parameter/);
    expect(await set("maintenance.default_deadline_hours", { urgent: 12, normal: 72, low: 240 })).toBeNull();
    expect(await set("maintenance.default_deadline_hours", { urgent: 100, normal: 72, low: 240 })).toMatch(/invalid_parameter/);
    expect(await set("security.session_idle_minutes", 30)).toBeNull();
    expect(await set("security.session_idle_minutes", 1)).toMatch(/invalid_parameter/);
    expect(await set("security.session_idle_minutes", "30")).toMatch(/invalid_parameter/);
    expect(await set("presence.no_show_monthly_alert", 0)).toMatch(/invalid_parameter/);
    expect(await set("records.correction_window_hours", 48)).toBeNull();
    expect(await set("maintenance.reminder_hours", 12)).toBeNull();
  });
  it("chave fora da lista é recusada (ex.: desligar a verificação em duas etapas por aqui)", async () => {
    await db.as(manager);
    expect(await set("security.require_mfa_management", false)).toMatch(/unknown_parameter/);
    expect(await set("nao.existe", 1)).toMatch(/unknown_parameter/);
  });
  it("conta de casa não altera parâmetros", async () => {
    await db.as(station);
    expect(await set("security.session_idle_minutes", 30)).toMatch(/not_authorised/);
  });
});
