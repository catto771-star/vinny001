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

import { orderedMetrics } from "./management";

describe("ordem dos números de cada bloco", () => {
  it("segue a leitura natural, não a ordem do jsonb (que ordena chaves por tamanho)", () => {
    const jsonbOrder = { outs: 4, occupied: 0, admissions: 4, beds_total: 44, transfers_in: 0, transfers_out: 0, average_occupancy: 0.4, protected_by_absence: 0 };
    expect(orderedMetrics("occupancy", jsonbOrder).map(([k]) => k)).toEqual([
      "beds_total", "occupied", "protected_by_absence", "average_occupancy", "admissions", "outs", "transfers_in", "transfers_out",
    ]);
    expect(orderedMetrics("hours", { effective_minutes: 1, planned_minutes: 2 }).map(([k]) => k)).toEqual(["planned_minutes", "effective_minutes"]);
    expect(orderedMetrics("x", { b: 1, a: 2, nested: { y: 1 } }).map(([k]) => k)).toEqual(["b", "a"]);
  });
});

import { breakdownLabelKey, formatMetric } from "./management";

describe("formatação do relatório", () => {
  it("números no formato do idioma (vírgula decimal em pt-PT) e horas em h/min", () => {
    expect(formatMetric("average_occupancy", 33.3, "pt-PT")).toBe("33,3");
    expect(formatMetric("average_occupancy", 33.3, "en-IE")).toBe("33.3");
    expect(formatMetric("planned_minutes", 125, "pt-PT")).toBe("2 h 05");
    expect(formatMetric("opened", 4, "pl-PL")).toBe("4");
  });
  it("motivos de lançamento fora do turno e prioridades usam os textos traduzidos; locais ficam como estão", () => {
    expect(breakdownLabelKey("by_reason", "forgot")).toBe("handover.reasons.forgot");
    expect(breakdownLabelKey("by_priority", "urgent")).toBe("maintenance.p_urgent");
    expect(breakdownLabelKey("by_location", "Kitchen")).toBeNull();
    expect(breakdownLabelKey("by_reason", "unknown_reason")).toBeNull();
  });
});

import { rotaRoles as rotaRolesFn } from "./management";

describe("quem pode assumir cada função na Rota (mesma regra do banco)", () => {
  it("Office só Porter; Float Porter ou Manager; Cleaner só Cleaner; função Manager só gestão", () => {
    expect(rotaRolesFn("office")).toEqual(["porter"]);
    expect(rotaRolesFn("float")).toEqual(["porter", "manager"]);
    expect(rotaRolesFn("cleaner")).toEqual(["cleaner"]);
    expect(rotaRolesFn("manager")).toEqual(["manager", "owner", "developer"]);
  });
});

describe("Beta: período do relatório", () => {
  it("dia, semana (segunda a domingo), quinzena (as duas últimas semanas), mês e intervalo livre (fim incluído)", async () => {
    const { periodRange } = await import("./management");
    expect(periodRange("day", "2026-11-24")).toEqual({ from: "2026-11-24", to: "2026-11-25" });
    expect(periodRange("week", "2026-11-26")).toEqual({ from: "2026-11-23", to: "2026-11-30" });
    expect(periodRange("fortnight", "2026-11-26")).toEqual({ from: "2026-11-16", to: "2026-11-30" });
    expect(periodRange("month", "2026-12-10")).toEqual({ from: "2026-12-01", to: "2027-01-01" });
    expect(periodRange("custom", "2026-11-24", { from: "2026-11-01", to: "2026-11-10" })).toEqual({ from: "2026-11-01", to: "2026-11-11" });
    expect(periodRange("custom", "2026-11-24", { from: "2026-11-10", to: "2026-11-01" })).toEqual({ from: "2026-11-10", to: "2026-11-11" });
  });
});

describe("Revisão 25/11: relatório por categorias", () => {
  it("cada bloco do relatório cai em uma categoria só; a ordem da categoria é respeitada", async () => {
    const { REPORT_CATEGORIES, blocksOf } = await import("./management");
    const all = REPORT_CATEGORIES.flatMap((c) => c.blocks);
    expect(new Set(all).size).toBe(all.length);
    for (const b of ["occupancy", "maintenance", "no_shows", "warnings", "dinner", "laundry", "hours", "rounds_checks", "temperature", "movements", "late_entries", "coverage"]) expect(all).toContain(b);
    const blocks = [{ key: "warnings", data: {} }, { key: "no_shows", data: {} }, { key: "hours", data: {} }];
    expect(blocksOf("presence", blocks).map((b) => b.key)).toEqual(["no_shows", "warnings"]);
  });
});
