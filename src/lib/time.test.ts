import { describe, expect, it } from "vitest";
import {
  addDays,
  dublinWallTimeToDate,
  formatClock,
  formatDate,
  formatTime,
  operationalDay,
  operationalDayBounds,
  shiftOf,
} from "./time";

const hours = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000;

describe("Dia operacional (07h–07h, Dublin)", () => {
  it("06h59 pertence ao dia anterior; 07h00 ao próprio dia (inverno e verão)", () => {
    expect(operationalDay(new Date("2026-12-15T06:59:00Z"))).toBe("2026-12-14"); // GMT
    expect(operationalDay(new Date("2026-12-15T07:00:00Z"))).toBe("2026-12-15");
    expect(operationalDay(new Date("2026-07-15T05:59:00Z"))).toBe("2026-07-14"); // IST = UTC+1
    expect(operationalDay(new Date("2026-07-15T06:00:00Z"))).toBe("2026-07-15");
  });

  it("B18: noites de mudança de horário têm 23h e 25h", () => {
    const spring = operationalDayBounds("2026-03-28");
    const autumn = operationalDayBounds("2026-10-24");
    expect(hours(spring.start, spring.end)).toBe(23);
    expect(hours(autumn.start, autumn.end)).toBe(25);
    expect(hours(...Object.values(operationalDayBounds("2026-06-10")) as [Date, Date])).toBe(24);
  });

  it("Horário de parede de Dublin vira o instante UTC certo", () => {
    expect(dublinWallTimeToDate("2026-01-10", "12:00").toISOString()).toBe("2026-01-10T12:00:00.000Z");
    expect(dublinWallTimeToDate("2026-07-10", "12:00").toISOString()).toBe("2026-07-10T11:00:00.000Z");
    // 01:30 não existe em 29/03/2026 (salto de 01h para 02h): avança para o primeiro horário válido
    expect(dublinWallTimeToDate("2026-03-29", "01:30").toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });

  it("Turno Day 07h–19h, Night 19h–07h", () => {
    expect(shiftOf(new Date("2026-07-10T05:59:00Z"))).toBe("night"); // 06:59 IST
    expect(shiftOf(new Date("2026-07-10T06:00:00Z"))).toBe("day"); // 07:00 IST
    expect(shiftOf(new Date("2026-07-10T17:59:00Z"))).toBe("day"); // 18:59 IST
    expect(shiftOf(new Date("2026-07-10T18:00:00Z"))).toBe("night"); // 19:00 IST
  });

  it("addDays atravessa meses e anos", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("Relógio e formatos (s.15.2, B52, B55)", () => {
  const instant = new Date("2026-07-10T21:05:09Z"); // 22:05:09 em Dublin (IST)

  it("B52: en-IE usa dd/mm/aaaa e 24 horas", () => {
    expect(formatDate(instant, "en-IE")).toBe("10/07/2026");
    expect(formatTime(instant, "en-IE")).toBe("22:05");
  });

  it("B55: relógio com dia da semana, data e segundos no horário de Dublin, no idioma do usuário", () => {
    expect(formatClock(instant, "en-IE")).toEqual({ weekday: "Friday", date: "10/07/2026", time: "22:05:09" });
    expect(formatClock(instant, "pt-PT").weekday).toBe("sexta-feira");
    expect(formatClock(instant, "pl-PL").weekday).toBe("piątek");
    expect(formatClock(instant, "pl-PL").time).toBe("22:05:09");
  });

  it("Acompanha o horário de verão sozinho", () => {
    expect(formatTime(new Date("2026-01-10T12:00:00Z"), "en-IE")).toBe("12:00");
    expect(formatTime(new Date("2026-07-10T12:00:00Z"), "en-IE")).toBe("13:00");
  });
});

import { fromDublinInputValue, toDublinInputValue } from "./time";

describe("campo de data e hora em Dublin", () => {
  it("ida e volta, inverno e verão", () => {
    const winter = new Date("2026-01-10T18:30:00Z");
    const summer = new Date("2026-07-10T18:30:00Z");
    expect(toDublinInputValue(winter)).toBe("2026-01-10T18:30");
    expect(toDublinInputValue(summer)).toBe("2026-07-10T19:30");
    expect(fromDublinInputValue("2026-07-10T19:30")?.toISOString()).toBe(summer.toISOString());
    expect(fromDublinInputValue("lixo")).toBeNull();
  });
});
