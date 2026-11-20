import { describe, expect, it } from "vitest";
import { durationLabel, insertMention, isLateFact, mentionQuery, pickTitle, shiftEnd } from "./occurrences";

describe("turnos e lançamento tardio", () => {
  it("fim do turno: Day termina às 19h; Night às 07h do dia seguinte (Dublin)", () => {
    expect(shiftEnd(new Date("2026-12-10T10:00:00Z")).toISOString()).toBe("2026-12-10T19:00:00.000Z");
    expect(shiftEnd(new Date("2026-12-10T21:00:00Z")).toISOString()).toBe("2026-12-11T07:00:00.000Z");
    expect(shiftEnd(new Date("2026-12-11T03:00:00Z")).toISOString()).toBe("2026-12-11T07:00:00.000Z");
    expect(shiftEnd(new Date("2026-07-10T10:00:00Z")).toISOString()).toBe("2026-07-10T18:00:00.000Z"); // IST
  });

  it("B38: fato de turno encerrado é tardio; do turno atual, não", () => {
    const now = new Date("2026-12-10T20:00:00Z"); // Night
    expect(isLateFact(new Date("2026-12-10T18:30:00Z"), now)).toBe(true);
    expect(isLateFact(new Date("2026-12-10T19:30:00Z"), now)).toBe(false);
  });
});

describe("atraso", () => {
  it("minutos, horas e dias", () => {
    expect(durationLabel(5 * 60_000)).toBe("5 min");
    expect(durationLabel(135 * 60_000)).toBe("2 h 15 min");
    expect(durationLabel(120 * 60_000)).toBe("2 h");
    expect(durationLabel((3 * 24 + 4) * 3_600_000)).toBe("3 d 4 h");
  });
});

describe("@menções", () => {
  it("detecta a consulta depois do @ no cursor, inclusive com acentos", () => {
    expect(mentionQuery("Falei com @Seá", 14)).toBe("Seá");
    expect(mentionQuery("@", 1)).toBe("");
    expect(mentionQuery("email a@b", 9)).toBeNull();
    expect(mentionQuery("sem menção", 10)).toBeNull();
  });

  it("troca a consulta pelo nome escolhido", () => {
    expect(insertMention("Falei com @Se hoje", 13, "Seán Byrne")).toEqual({ text: "Falei com @Seán Byrne  hoje", caret: 22 });
  });
});

describe("títulos de modelos", () => {
  it("usa o idioma do usuário e cai para o inglês", () => {
    const t = { "pt-PT": "Temperatura da geladeira", "en-IE": "Fridge temperature" };
    expect(pickTitle(t, "pt-PT")).toBe("Temperatura da geladeira");
    expect(pickTitle(t, "pl-PL")).toBe("Fridge temperature");
  });
});
