import { addDays, dublinParts, dublinWallTimeToDate, isoDay } from "./time";

/** Fim do turno (Day 07h–19h, Night 19h–07h) que contém o instante — igual a public.shift_end(). */
export function shiftEnd(at: Date): Date {
  const p = dublinParts(at);
  const day = isoDay(p.year, p.month, p.day);
  if (p.hour >= 7 && p.hour < 19) return dublinWallTimeToDate(day, "19:00");
  if (p.hour >= 19) return dublinWallTimeToDate(addDays(day, 1), "07:00");
  return dublinWallTimeToDate(day, "07:00");
}

/** Fato de um turno que já terminou: Office/Float precisam informar o motivo (B38). */
export function isLateFact(occurredAt: Date, now: Date): boolean {
  return now.getTime() > shiftEnd(occurredAt).getTime();
}

/** "2 h 15 min", "3 d 4 h" — atraso legível. */
export function durationLabel(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${min % 60 ? `${min % 60} min` : ""}`.trim();
  const d = Math.floor(h / 24);
  return `${d} d ${h % 24 ? `${h % 24} h` : ""}`.trim();
}

/** Texto digitado depois do "@" na posição do cursor (ou null). */
export function mentionQuery(text: string, caret: number): string | null {
  const before = text.slice(0, caret);
  const match = /(?:^|\s)@([\p{L}\p{N}'-]{0,30})$/u.exec(before);
  return match ? match[1] : null;
}

/** Troca o "@consulta" sob o cursor pelo nome escolhido. Devolve o texto e a nova posição do cursor. */
export function insertMention(text: string, caret: number, label: string): { text: string; caret: number } {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf("@");
  if (start < 0) return { text, caret };
  const inserted = `@${label} `;
  return { text: text.slice(0, start) + inserted + text.slice(caret), caret: start + inserted.length };
}

/** Título de modelo nos três idiomas: o do usuário, senão inglês da Irlanda, senão qualquer um. */
export function pickTitle(title: Record<string, string> | null | undefined, locale: string): string {
  if (!title) return "";
  return title[locale] || title["en-IE"] || Object.values(title)[0] || "";
}
