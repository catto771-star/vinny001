import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { slotInstant } from "@/lib/presence";
import { operationalDay } from "@/lib/time";

/** Próximo check já vencido e ainda por lançar no Lodge (a ação principal do turno). */
export function useNextCheck(lodgeId: string | null | undefined, serverOffsetMs: number) {
  const [slot, setSlot] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!lodgeId) {
      setLoading(false);
      return;
    }
    const now = new Date(Date.now() + serverOffsetMs);
    const day = operationalDay(now);
    void Promise.all([
      supabase.rpc("check_slots", { p_lodge: lodgeId, p_day: day }),
      supabase.from("room_check_runs").select("slot, status").eq("lodge_id", lodgeId).eq("operational_day", day),
    ]).then(([{ data: slots }, { data: runs }]) => {
      const launched = new Set(((runs ?? []) as { slot: string; status: string }[]).filter((r) => r.status === "launched").map((r) => r.slot));
      const due = ((slots ?? []) as string[]).filter((s) => slotInstant(day, s).getTime() <= now.getTime() && !launched.has(s));
      setSlot(due[0] ?? null);
      setPendingCount(due.length);
      setLoading(false);
    });
  }, [lodgeId, serverOffsetMs]);

  return { slot, pendingCount, loading };
}
