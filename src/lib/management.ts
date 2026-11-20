import { addDays } from "./time";

/** Total da linha arredondado ao centavo, meio centavo sobe (B49) — igual ao banco. */
export function lineTotal(quantity: number, unitPrice: number): number {
  const raw = quantity * unitPrice;
  // Corrige ruído de ponto flutuante (0.999999…) antes de arredondar.
  return Math.round((raw + Number.EPSILON) * 100 + 1e-9) / 100;
}

export function formatEUR(value: number | string | null | undefined, locale: string): string {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(n);
}

/** "12 h 05" a partir de minutos (aceita negativos para diferenças). */
export function minutesLabel(minutes: number): string {
  const sign = minutes < 0 ? "−" : "";
  const m = Math.abs(Math.round(minutes));
  return `${sign}${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

/** Segunda-feira da semana do dia (YYYY-MM-DD). */
export function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const iso = (d.getUTCDay() + 6) % 7; // 0 = segunda
  return addDays(day, -iso);
}

export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export type RotaFunction = "office" | "float" | "cleaner" | "manager";

/** Horários padrão (s.2 e s.14): Day 07–19, Night 19–07, Float 12–24, Cleaner 09–13. */
export function defaultTimes(fn: RotaFunction, night: boolean): { start: string; end: string; nextDay: boolean } {
  if (fn === "float") return { start: "12:00", end: "00:00", nextDay: true };
  if (fn === "cleaner") return { start: "09:00", end: "13:00", nextDay: false };
  return night ? { start: "19:00", end: "07:00", nextDay: true } : { start: "07:00", end: "19:00", nextDay: false };
}

/** Métricas com lista de origem (report_details) — o número do resumo abre esses registros. */
export const DETAIL_METRICS = new Set([
  "occupancy.admissions", "occupancy.outs", "occupancy.transfers_in", "occupancy.transfers_out",
  "maintenance.opened", "maintenance.resolved", "maintenance.overdue", "maintenance.on_hold", "maintenance.in_progress",
  "no_shows.total", "no_shows.undone", "warnings.verbal", "warnings.written", "warnings.final_written",
  "temperature.alerts", "dinner.served", "laundry.uses", "late_entries.total",
]);

export function detailMetric(block: string, metric: string): string | null {
  const key = block === "movements" && (metric === "admissions" || metric === "outs") ? `occupancy.${metric}` : `${block}.${metric}`;
  return DETAIL_METRICS.has(key) ? key : null;
}

export type ReportBlock = { key: string; data: Record<string, unknown> };

/** Blocos na ordem do relatório; blocos nulos (serviço que o Lodge não tem) ficam de fora. */
export function reportBlocks(report: Record<string, unknown> & { order?: string[] }): ReportBlock[] {
  return (report.order ?? [])
    .filter((k) => report[k] && typeof report[k] === "object")
    .map((k) => ({ key: k, data: report[k] as Record<string, unknown> }));
}
