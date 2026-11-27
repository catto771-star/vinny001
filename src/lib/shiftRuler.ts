import { slotInstant } from "./presence";
import { operationalDayBounds } from "./time";

export type TickState = "done" | "late" | "due" | "upcoming";
export type RulerTick = { slot: string; kind: "check" | "round"; state: TickState; position: number };

const DAY_MS = 24 * 60 * 60_000;
const ROUND_GRACE_MS = 30 * 60_000; // mesma folga de pending_rounds

/** Posição (0–1) de um instante na régua do dia operacional 07:00 → 07:00. */
export function rulerPosition(day: string, at: Date): number {
  const { start } = operationalDayBounds(day);
  return Math.min(1, Math.max(0, (at.getTime() - start.getTime()) / DAY_MS));
}

/** Marcas da régua: checks (por lançar = atrasado assim que vencem) e rondas (atrasada após 30 min). */
export function rulerTicks(input: {
  day: string;
  now: Date;
  checkSlots: string[];
  launchedChecks: string[];
  roundSlots: string[];
  recordedRounds: string[];
}): RulerTick[] {
  const { day, now } = input;
  const t = now.getTime();
  const ticks: RulerTick[] = input.checkSlots.map((slot) => {
    const at = slotInstant(day, slot).getTime();
    const state: TickState = input.launchedChecks.includes(slot) ? "done" : at <= t ? "late" : "upcoming";
    return { slot, kind: "check", state, position: rulerPosition(day, new Date(at)) };
  });
  for (const slot of input.roundSlots) {
    if (input.checkSlots.includes(slot)) continue; // o check do horário já registra a ronda
    const at = slotInstant(day, slot).getTime();
    const state: TickState = input.recordedRounds.includes(slot) ? "done" : at + ROUND_GRACE_MS <= t ? "late" : at <= t ? "due" : "upcoming";
    ticks.push({ slot, kind: "round", state, position: rulerPosition(day, new Date(at)) });
  }
  return ticks.sort((a, b) => a.position - b.position);
}
