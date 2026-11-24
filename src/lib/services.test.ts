import { describe, expect, it } from "vitest";
import { translate } from "@/i18n";
import { expiresSoon, isOutOfRange, notificationText, parseTemperature } from "./services";

describe("temperatura", () => {
  it("aceita vírgula ou ponto; em branco não é 0 °C", () => {
    expect(parseTemperature("4,5")).toBe(4.5);
    expect(parseTemperature("-1")).toBe(-1);
    expect(parseTemperature(" 3 ")).toBe(3);
    expect(parseTemperature("")).toBeNull();
    expect(parseTemperature("abc")).toBeNull();
    expect(parseTemperature("4,55")).toBeNull();
  });
  it("faixa 0–5 °C: limites incluídos", () => {
    expect(isOutOfRange(0, 0, 5)).toBe(false);
    expect(isOutOfRange(5, 0, 5)).toBe(false);
    expect(isOutOfRange(5.1, 0, 5)).toBe(true);
    expect(isOutOfRange(-0.5, 0, 5)).toBe(true);
  });
});

describe("validade", () => {
  it("vence logo em até 2 dias", () => {
    expect(expiresSoon("2026-11-22", "2026-11-20")).toBe(true);
    expect(expiresSoon("2026-11-23", "2026-11-20")).toBe(false);
  });
});

describe("notificações", () => {
  const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate("en-IE", k, v);
  it("geladeira fora da faixa", () => {
    expect(notificationText({ kind: "fridge_out_of_range", lodge_id: "a", payload: { temperature: 7.5, min: 0, max: 5 } }, t, () => "Amiens")).toBe(
      "Amiens · Fridge at 7.5 °C (range 0–5 °C)",
    );
  });
  it("No Show no mês e tipo desconhecido", () => {
    expect(notificationText({ kind: "no_show_monthly_limit", lodge_id: "a", payload: { first_name: "Ana", last_name: "X", month_count: 3 } }, t, () => "Amiens")).toBe(
      "Ana X reached 3 No Shows this month (Amiens)",
    );
    expect(notificationText({ kind: "x", lodge_id: null, payload: {} }, t, () => "")).toBe("Notice");
  });
  it("cobertura da Rota abaixo do mínimo e férias em conflito (Fase 3)", () => {
    expect(notificationText({ kind: "coverage_below_minimum", lodge_id: null, payload: { gaps: 4 } }, t, () => "")).toBe(
      "Rota published with 4 shift(s) below the minimum cover",
    );
    expect(notificationText({ kind: "vacation_conflict", lodge_id: null, payload: { name: "Ana X", conflicts: 2 } }, t, () => "")).toBe(
      "Holidays of Ana X clash with 2 rota shift(s)",
    );
  });
});
