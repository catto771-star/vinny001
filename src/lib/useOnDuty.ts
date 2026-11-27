import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/** Turno do Roster em andamento (Beta: quem está trabalhando vem do Roster, não de "assumir posto"). */
export type OnDutyPost = {
  id: string;
  staff_id: string;
  function: "office" | "float" | "cleaner" | "manager";
  lodge_id: string | null;
  started_at: string;
  ends_at: string;
  staff: { full_name: string; display_name: string | null } | null;
};

/** Quem está escalado agora (turnos publicados do Roster que cobrem este instante). */
export function useOnDuty() {
  const [posts, setPosts] = useState<OnDutyPost[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const now = new Date().toISOString();
    const { data } = await supabase
      .from("rota_shifts")
      .select("id, staff_id, function, lodge_id, started_at:starts_at, ends_at, staff:staff!rota_shifts_staff_id_fkey(full_name, display_name)")
      .eq("status", "published")
      .lte("starts_at", now)
      .gt("ends_at", now);
    setPosts((data ?? []) as unknown as OnDutyPost[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
    const id = window.setInterval(() => void reload(), 60_000);
    return () => window.clearInterval(id);
  }, [reload]);

  return { posts, loading, reload };
}

/** Pessoa escalada numa casa: o Office da casa; sem Office, o Float (mesma regra do banco). */
export function onDutyFor(posts: OnDutyPost[], lodgeId: string | null | undefined): OnDutyPost | undefined {
  return posts.find((p) => p.function === "office" && p.lodge_id === lodgeId) ?? posts.find((p) => p.function === "float");
}
