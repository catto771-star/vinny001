import { describe, expect, it } from "vitest";
import { rulerPosition, rulerTicks } from "./shiftRuler";
import { dublinWallTimeToDate } from "./time";

const day = "2026-11-20";
const at = (d: string, t: string) => dublinWallTimeToDate(d, t);

describe("régua do dia operacional (07:00 → 07:00)", () => {
  it("posição vai de 0 às 07:00 até 1 às 07:00 do dia seguinte", () => {
    expect(rulerPosition(day, at(day, "07:00"))).toBe(0);
    expect(rulerPosition(day, at(day, "19:00"))).toBeCloseTo(0.5);
    expect(rulerPosition(day, at("2026-11-21", "07:00"))).toBe(1);
    expect(rulerPosition(day, at("2026-11-21", "09:00"))).toBe(1);
  });

  it("estado de cada marca: feita, atrasada (ronda após 30 min de folga), vencida e por vir", () => {
    const ticks = rulerTicks({
      day,
      now: at(day, "14:20"),
      checkSlots: ["12:00", "18:00"],
      launchedChecks: [],
      roundSlots: ["08:00", "10:00", "12:00", "14:00", "16:00", "02:00"],
      recordedRounds: ["08:00", "12:00"],
    });
    const state = (kind: string, slot: string) => ticks.find((t) => t.kind === kind && t.slot === slot)?.state;
    expect(state("round", "08:00")).toBe("done");
    expect(state("round", "10:00")).toBe("late");
    expect(state("round", "14:00")).toBe("due");
    expect(state("round", "16:00")).toBe("upcoming");
    expect(state("round", "02:00")).toBe("upcoming");
    expect(state("check", "12:00")).toBe("late");
    expect(state("check", "18:00")).toBe("upcoming");
    // O check das 12:00 já gera a ronda das 12:00: a ronda não aparece duas vezes.
    expect(ticks.filter((t) => t.slot === "12:00")).toHaveLength(1);
    expect(ticks.find((t) => t.slot === "02:00")!.position).toBeCloseTo(19 / 24);
  });

  it("check lançado fica feito", () => {
    const ticks = rulerTicks({ day, now: at(day, "14:20"), checkSlots: ["12:00"], launchedChecks: ["12:00"], roundSlots: [], recordedRounds: [] });
    expect(ticks[0]).toMatchObject({ kind: "check", state: "done" });
  });
});
