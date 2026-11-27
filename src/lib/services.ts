import type { MessageKey, Vars } from "@/i18n";

/** Lê a temperatura digitada ("4,5", "4.5", "-1"). Em branco é null — não é 0 °C. */
export function parseTemperature(input: string): number | null {
  const s = input.trim().replace(",", ".");
  if (s === "" || !/^-?\d{1,2}(\.\d)?$/.test(s)) return null;
  return Number(s);
}

export function isOutOfRange(value: number, min: number, max: number): boolean {
  return value < min || value > max;
}

/** Validade em até `days` dias (inclusive) a partir de hoje. */
export function expiresSoon(expiry: string, today: string, days = 2): boolean {
  const diff = (Date.parse(expiry) - Date.parse(today)) / 86_400_000;
  return diff <= days;
}

export type NotificationRow = {
  id: number;
  kind: string;
  lodge_id: string | null;
  resident_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  read: boolean;
};

/** Texto de cada notificação no idioma do usuário. */
export function notificationText(
  n: Pick<NotificationRow, "kind" | "payload" | "lodge_id">,
  t: (key: MessageKey, vars?: Vars) => string,
  lodgeName: (id: string | null) => string,
): string {
  const p = n.payload as Record<string, string | number>;
  switch (n.kind) {
    case "fridge_out_of_range":
      return t("notifications.fridge_out_of_range", { lodge: lodgeName(n.lodge_id), fridge: String(p.fridge_name ?? "Fridge"), temperature: p.temperature, min: p.min, max: p.max });
    case "maintenance_opened":
      return t("notifications.maintenance_opened", { lodge: lodgeName(n.lodge_id), location: p.location });
    case "no_show_monthly_limit":
      return t("notifications.no_show_monthly_limit", { name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(), count: p.month_count, lodge: lodgeName(n.lodge_id) });
    case "coverage_below_minimum":
      return t("notifications.coverage_below_minimum", { gaps: p.gaps });
    case "vacation_conflict":
      return t("notifications.vacation_conflict", { name: p.name, conflicts: p.conflicts });
    case "shift_hours_review":
      return t("notifications.shift_hours_review", { name: p.name, lodge: lodgeName(n.lodge_id) });
    case "delivery_received":
      return t("notifications.delivery_received", { lodge: lodgeName(n.lodge_id), supplier: String(p.supplier ?? ""), who: String(p.received_by ?? "—") });
    case "delivery_expiring":
      return t("notifications.delivery_expiring", { lodge: lodgeName(n.lodge_id), product: String(p.product ?? ""), supplier: String(p.supplier ?? ""), date: String(p.expiry ?? "").split("-").reverse().join("/") });
    case "handover_tag":
      return t("notifications.handover_tag", { lodge: lodgeName(n.lodge_id), excerpt: String(p.excerpt ?? "") });
    case "warning_recorded":
      return t("notifications.warning_recorded", { lodge: lodgeName(n.lodge_id), type: t(p.type === "final_warning" ? "warnings.t_final_warning" : "warnings.t_warning"), name: String(p.name ?? "") });
    default:
      return t("notifications.unknown");
  }
}
