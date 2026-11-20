/**
 * Tempo no DS Lodge (spec s.9, s.15.2):
 * - o banco guarda UTC; a tela mostra sempre o horário de Dublin;
 * - o "dia operacional" vai das 07h de um dia às 07h do seguinte (Dublin);
 * - o formato de data e número segue o idioma do usuário.
 */
export const DUBLIN = "Europe/Dublin";
export const OPERATIONAL_DAY_START_HOUR = 7;

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: DUBLIN,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function dublinParts(date: Date): Parts {
  const values: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(date)) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

/** Diferença (ms) entre o relógio de parede de Dublin e UTC num instante. */
function dublinOffsetMs(date: Date): number {
  const p = dublinParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Converte um horário de parede de Dublin (ex.: 2026-03-29 07:00) no instante UTC.
 * Horários que não existem (salto da primavera) avançam para o primeiro existente.
 */
export function dublinWallTimeToDate(isoDay: string, time: string): Date {
  const [year, month, day] = isoDay.split("-").map(Number);
  const [hour, minute = 0] = time.split(":").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let result = new Date(guess - dublinOffsetMs(new Date(guess)));
  const check = dublinParts(result);
  if (check.hour !== hour || check.minute !== minute) {
    result = new Date(guess - dublinOffsetMs(result));
  }
  return result;
}

export function isoDay(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addDays(day: string, amount: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + amount));
  return isoDay(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Dia operacional (YYYY-MM-DD) a que pertence um instante. Igual a public.operational_day() no banco. */
export function operationalDay(date: Date): string {
  const p = dublinParts(date);
  const day = isoDay(p.year, p.month, p.day);
  return p.hour < OPERATIONAL_DAY_START_HOUR ? addDays(day, -1) : day;
}

export function operationalDayBounds(day: string): { start: Date; end: Date } {
  return {
    start: dublinWallTimeToDate(day, "07:00"),
    end: dublinWallTimeToDate(addDays(day, 1), "07:00"),
  };
}

export type Shift = "day" | "night";

/** Turno Day 07h–19h, Night 19h–07h (glossário). */
export function shiftOf(date: Date, dayStartHour = 7, nightStartHour = 19): Shift {
  const { hour } = dublinParts(date);
  return hour >= dayStartHour && hour < nightStartHour ? "day" : "night";
}

/** Data em formato numérico do idioma (en-IE: dd/mm/aaaa), no horário de Dublin. */
export function formatDate(date: Date | string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: DUBLIN,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(typeof date === "string" ? new Date(date) : date);
}

/** Hora 24h no horário de Dublin. */
export function formatTime(date: Date | string, locale: string, withSeconds = false): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: DUBLIN,
    hour: "2-digit",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
    hourCycle: "h23",
  }).format(typeof date === "string" ? new Date(date) : date);
}

export function formatDateTime(date: Date | string, locale: string): string {
  return `${formatDate(date, locale)} ${formatTime(date, locale)}`;
}

/** Relógio do topo: dia da semana, data e hora com segundos (s.15.2). */
export function formatClock(date: Date, locale: string): { weekday: string; date: string; time: string } {
  const weekday = new Intl.DateTimeFormat(locale, { timeZone: DUBLIN, weekday: "long" }).format(date);
  return { weekday, date: formatDate(date, locale), time: formatTime(date, locale, true) };
}

/** Data civil (sem hora), ex.: data de nascimento. Não passa por fuso. */
export function formatCivilDate(isoDate: string | null | undefined, locale: string): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}
