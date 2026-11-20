import { describe, expect, it } from "vitest";
import { isAfterPresenceAlert, keyToResult, monthCountLabel, nextResidentIndex, noShowReviewDay, sheetProgress, slotInstant } from "./presence";

describe("Folha do dia", () => {
  it("progresso conta só linhas com residente; completo quando todos marcados", () => {
    expect(sheetProgress([{ stay_id: "a", result: "seen" }, { stay_id: null, result: null }, { stay_id: "b", result: null }])).toEqual({ marked: 1, total: 2, complete: false });
    expect(sheetProgress([{ stay_id: "a", result: "seen" }, { stay_id: "b", result: "absent" }]).complete).toBe(true);
    expect(sheetProgress([{ stay_id: null, result: null }]).complete).toBe(false);
  });

  it("navegação pelo teclado pula camas livres", () => {
    const rows = [{ stay_id: "a" }, { stay_id: null }, { stay_id: "b" }];
    expect(nextResidentIndex(rows, 0, 1)).toBe(2);
    expect(nextResidentIndex(rows, 2, -1)).toBe(0);
    expect(nextResidentIndex(rows, 2, 1)).toBe(2);
  });

  it("teclas: V/1 visto, N/2 não visto, A/3 ausência, Delete limpa", () => {
    expect(keyToResult("v")).toBe("seen");
    expect(keyToResult("N")).toBe("not_seen");
    expect(keyToResult("3")).toBe("absent");
    expect(keyToResult("Delete")).toBe("clear");
    expect(keyToResult("x")).toBeNull();
  });

  it("horário do check no fuso de Dublin", () => {
    expect(slotInstant("2026-07-10", "22:00").toISOString()).toBe("2026-07-10T21:00:00.000Z");
    expect(slotInstant("2026-12-10", "02:00").toISOString()).toBe("2026-12-11T02:00:00.000Z");
  });
});

describe("No Show", () => {
  it("lista das 06h30: antes das 06h30 mostra o dia anterior; depois, o que termina", () => {
    // 20/11/2026 (GMT): dia operacional 19/11 termina às 07h de 20/11.
    expect(noShowReviewDay(new Date("2026-11-20T06:29:00Z"))).toBe("2026-11-18");
    expect(noShowReviewDay(new Date("2026-11-20T06:30:00Z"))).toBe("2026-11-19");
    expect(noShowReviewDay(new Date("2026-11-20T12:00:00Z"))).toBe("2026-11-19");
  });

  it("aviso das 18h30 do dia operacional", () => {
    expect(isAfterPresenceAlert(new Date("2026-11-20T18:29:00Z"))).toBe(false);
    expect(isAfterPresenceAlert(new Date("2026-11-20T18:30:00Z"))).toBe(true);
    expect(isAfterPresenceAlert(new Date("2026-11-21T03:00:00Z"))).toBe(true); // madrugada, ainda o mesmo dia operacional
    expect(isAfterPresenceAlert(new Date("2026-07-20T17:30:00Z"))).toBe(true); // 18:30 IST
  });

  it("contador mensal sem teto", () => {
    expect(monthCountLabel(2)).toBe("2/3");
    expect(monthCountLabel(4)).toBe("4/3");
  });
});
