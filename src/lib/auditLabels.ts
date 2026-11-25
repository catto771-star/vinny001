/** Nomes de negócio para o Audit: tabelas, módulos (grupos), campos e valores legíveis. */
const TABLES: Record<string, string> = {
  staff: "Person", residents: "Resident", stays: "Stay", duty_posts: "Duty post", beds: "Bed", rooms: "Room", lodges: "House",
  parameters: "Setting", absences: "Absence", dinner_marks: "Dinner mark", dinner_services: "Dinner service", food_deliveries: "Food delivery",
  fridge_readings: "Fridge reading", fridges: "Fridge", handover_entries: "Handover entry", handover_entry_staff: "Handover colleague",
  handover_shifts: "Handover shift", handover_tags: "Handover tag", holiday_locks: "Holiday block", laundry_uses: "Laundry use",
  maintenance_tickets: "Maintenance request", no_shows: "No Show", product_movements: "Stock movement", products: "Product",
  purchase_lines: "Purchase line", purchases: "Purchase", room_check_marks: "Room Check mark", room_check_runs: "Room Check",
  rota_shifts: "Roster shift", shop_items: "Shop item", shop_order_lines: "Order line", shop_orders: "Order", sightings: "Seen",
  task_extras: "Extra task", task_signatures: "Task signature", task_templates: "Task", vacations: "Holiday", warnings: "Warning",
  work_intervals: "Hours entry",
};

export const MODULES: { code: string; label: string; tables: string[] }[] = [
  { code: "people", label: "People", tables: ["staff", "duty_posts"] },
  { code: "residents", label: "Residents", tables: ["residents", "stays", "absences", "no_shows", "sightings", "warnings"] },
  { code: "presence", label: "Room Check", tables: ["room_check_runs", "room_check_marks"] },
  { code: "handover", label: "Handover", tables: ["handover_entries", "handover_entry_staff", "handover_shifts", "handover_tags"] },
  { code: "maintenance", label: "Maintenance", tables: ["maintenance_tickets"] },
  { code: "services", label: "Services", tables: ["dinner_services", "dinner_marks", "laundry_uses", "fridges", "fridge_readings", "food_deliveries"] },
  { code: "roster", label: "Roster and hours", tables: ["rota_shifts", "work_intervals", "vacations", "holiday_locks"] },
  { code: "purchasing", label: "Purchasing", tables: ["purchases", "purchase_lines", "products", "product_movements", "shop_items", "shop_orders", "shop_order_lines"] },
  { code: "structure", label: "Houses and beds", tables: ["lodges", "rooms", "beds"] },
  { code: "settings", label: "Settings", tables: ["parameters", "task_templates", "task_extras", "task_signatures"] },
];

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const tableLabel = (name: string): string => TABLES[name] ?? sentence(name.replace(/_/g, " "));
export const moduleTables = (codes: string[]): string[] => MODULES.filter((m) => codes.includes(m.code)).flatMap((m) => m.tables);
export const fieldLabel = (field: string): string => sentence(field.replace(/_(id|at)$/, "").replace(/_/g, " "));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
export type ValueCtx = { names: Map<string, string>; format: (iso: string) => string };

/** Valor legível: pessoa/casa pelo nome, data no formato local, Yes/No, vazio como —, texto longo cortado. */
export function formatAuditValue(value: unknown, ctx: ValueCtx): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "object") return JSON.stringify(value);
  const s = String(value);
  if (UUID.test(s)) return ctx.names.get(s) ?? `${s.slice(0, 8)}…`;
  if (ISO.test(s)) return ctx.format(s);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}
