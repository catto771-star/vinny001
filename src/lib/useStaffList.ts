import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { StaffRole } from "@/lib/types";

export type StaffOption = { id: string; full_name: string; display_name: string | null; role: StaffRole };

/** Equipe ativa com login (para "quem fez a ronda" e nomes nos registros). */
export function useStaffList() {
  const [staff, setStaff] = useState<StaffOption[]>([]);
  useEffect(() => {
    void supabase
      .from("staff")
      .select("id, full_name, display_name, role")
      .eq("active", true)
      .neq("role", "cleaner")
      .order("full_name")
      .then(({ data }) => setStaff((data ?? []) as StaffOption[]));
  }, []);
  return staff;
}
