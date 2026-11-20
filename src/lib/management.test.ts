import { describe, expect, it } from "vitest";
import { defaultTimes, formatEUR, lineTotal, minutesLabel, weekDays, weekStart } from "./management";

describe("valores em euro", () => {
  it("B49: 3 × 0,333 = € 1,00 (arredonda o total da linha)", () => {
    expect(lineTotal(3, 0.333)).toBe(1);
    expect(lineTotal(1, 0.005)).toBe(0.01);
    expect(lineTotal(2, 1.205)).toBe(2.41);
    expect(lineTotal(10, 1.2)).toBe(12);
  });
  it("formata em euro no idioma do usuário", () => {
    expect(formatEUR(1, "en-IE")).toBe("€1.00");
    expect(formatEUR(1234.5, "pt-PT").replace(/\s/g, " ")).toMatch(/1\s?234,50\s€/);
  });
});

describe("horas e semana", () => {
  it("minutos legíveis, inclusive diferença negativa", () => {
    expect(minutesLabel(725)).toBe("12 h 05");
    expect(minutesLabel(-120)).toBe("−2 h 00");
  });
  it("semana começa na segunda", () => {
    expect(weekStart("2026-11-20")).toBe("2026-11-16"); // sexta → segunda
    expect(weekStart("2026-11-16")).toBe("2026-11-16");
    expect(weekStart("2026-11-22")).toBe("2026-11-16"); // domingo
    expect(weekDays("2026-11-16")).toHaveLength(7);
  });
  it("horários padrão por função", () => {
    expect(defaultTimes("float", false)).toEqual({ start: "12:00", end: "00:00", nextDay: true });
    expect(defaultTimes("office", true)).toEqual({ start: "19:00", end: "07:00", nextDay: true });
  });
});

import { detailMetric, reportBlocks } from "./management";

describe("relatório mensal", () => {
  it("segue a ordem definida e omite blocos ausentes do Lodge (ex.: Dinner em Connolly)", () => {
    const r = { order: ["occupancy", "dinner", "laundry", "hours"], occupancy: { beds_total: 37 }, dinner: null, laundry: { uses: 2 }, hours: { planned_minutes: 60 } };
    expect(reportBlocks(r).map((b) => b.key)).toEqual(["occupancy", "laundry", "hours"]);
  });
  it("cada número com lista de origem abre o detalhe certo", () => {
    expect(detailMetric("maintenance", "opened")).toBe("maintenance.opened");
    expect(detailMetric("movements", "admissions")).toBe("occupancy.admissions");
    expect(detailMetric("movements", "outs")).toBe("occupancy.outs");
    expect(detailMetric("occupancy", "beds_total")).toBeNull();
    expect(detailMetric("hours", "planned_minutes")).toBeNull();
    expect(detailMetric("no_shows", "residents_1")).toBeNull();
  });
});
