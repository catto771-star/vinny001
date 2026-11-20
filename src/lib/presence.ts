import { dublinWallTimeToDate, operationalDay, addDays, operationalDayBounds } from "./time";

export type CheckResult = "seen" | "not_seen" | "absent";

export type SheetRow = {
  room_id: string;
  room_kind: "room" | "apartment";
  room_code: string;
  room_sort: number;
  bed_id: string;
  bed_number: number;
  bed_status: "in_use" | "out_of_service";
  stay_id: string | null;
  resident_id: string | null;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  absence_id: string | null;
  result: CheckResult | null;
  marked_by: string | null;
  final_warning?: boolean;
};

/** Residentes marcados / total — o check só é lançado com todos marcados (B28). */
export function sheetProgress(rows: Pick<SheetRow, "stay_id" | "result">[]) {
  const residents = rows.filter((r) => r.stay_id);
  const marked = residents.filter((r) => r.result).length;
  return { marked, total: residents.length, complete: residents.length > 0 && marked === residents.length };
}

/** Próxima linha com residente a partir de `from` (direção 1 ou -1); devolve `from` se não houver. */
export function nextResidentIndex(rows: Pick<SheetRow, "stay_id">[], from: number, direction: 1 | -1): number {
  for (let i = from + direction; i >= 0 && i < rows.length; i += direction) {
    if (rows[i].stay_id) return i;
  }
  return from;
}

/** Atalhos de teclado da Folha do dia. */
export function keyToResult(key: string): CheckResult | "clear" | null {
  switch (key.toLowerCase()) {
    case "v":
    case "s":
    case "1":
      return "seen";
    case "n":
    case "2":
      return "not_seen";
    case "a":
    case "3":
      return "absent";
    case "backspace":
    case "delete":
      return "clear";
    default:
      return null;
  }
}

/** Instante do horário do check no dia operacional (antes das 07h cai no dia seguinte). */
export function slotInstant(day: string, slot: string): Date {
  return dublinWallTimeToDate(slot < "07:00" ? addDays(day, 1) : day, slot);
}

/**
 * Dia que a lista de No Show deve mostrar: o dia operacional atual a partir das 06h30
 * (30 min antes do fim), senão o anterior já terminado.
 */
export function noShowReviewDay(now: Date): string {
  const today = operationalDay(now);
  const { end } = operationalDayBounds(today);
  return now.getTime() >= end.getTime() - 30 * 60_000 ? today : addDays(today, -1);
}

/** Aviso das 18h30: 30 min antes do fim do turno Day (s.5). */
export function isAfterPresenceAlert(now: Date): boolean {
  const today = operationalDay(now);
  return now.getTime() >= dublinWallTimeToDate(today, "18:30").getTime();
}

/** Contador mensal "2/3", "4/3" (sem teto). */
export function monthCountLabel(count: number, limit = 3): string {
  return `${count}/${limit}`;
}
