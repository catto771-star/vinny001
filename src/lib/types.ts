import type { Locale } from "@/i18n";

export type StaffRole = "porter" | "cleaner" | "manager" | "owner" | "developer";
export type DutyFunction = "office" | "float";
export type StayStatus = "active" | "out_pending" | "ended";

export type Staff = {
  id: string;
  user_id: string | null;
  full_name: string;
  display_name: string | null;
  role: StaffRole;
  email: string | null;
  locale: Locale;
  home_lodge_id: string | null;
  active: boolean;
  must_change_password: boolean;
  version: number;
  created_at: string;
  deactivated_at: string | null;
};

export type Lodge = {
  id: string;
  code: "AMIENS" | "CONNOLLY" | string;
  name: string;
  short_name: string;
  has_dinner: boolean;
  has_laundry: boolean;
};

export type DutyPost = {
  id: string;
  staff_id: string;
  function: DutyFunction;
  lodge_id: string | null;
  started_at: string;
  ended_at: string | null;
};

export type BedOccupancy = {
  lodge_id: string;
  lodge_code: string;
  room_id: string;
  room_kind: "room" | "apartment";
  room_code: string;
  room_sort: number;
  bed_id: string;
  bed_number: number;
  bed_status: "in_use" | "out_of_service";
  stay_id: string | null;
  stay_status: StayStatus | null;
  admitted_at: string | null;
  resident_id: string | null;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  pass_id: string | null;
  final_warning?: boolean;
};

export const MANAGEMENT_ROLES: StaffRole[] = ["manager", "owner", "developer"];

export function isManagementRole(role: StaffRole | undefined | null): boolean {
  return !!role && MANAGEMENT_ROLES.includes(role);
}

export function staffName(s: Pick<Staff, "display_name" | "full_name"> | null | undefined): string {
  return s ? s.display_name || s.full_name : "";
}

export function residentName(r: { first_name: string | null; last_name: string | null }): string {
  return [r.first_name, r.last_name].filter(Boolean).join(" ");
}
