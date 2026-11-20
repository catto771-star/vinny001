import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { DutyPost } from "@/lib/types";

export type OnDutyPost = DutyPost & { staff: { full_name: string; display_name: string | null } | null };

/** Quem está de serviço agora (postos abertos). */
export function useOnDuty() {
  const [posts, setPosts] = useState<OnDutyPost[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from("duty_posts")
      .select("id, staff_id, function, lodge_id, started_at, ended_at, staff:staff!duty_posts_staff_id_fkey(full_name, display_name)")
      .is("ended_at", null);
    setPosts((data ?? []) as unknown as OnDutyPost[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
    const id = window.setInterval(() => void reload(), 30_000);
    return () => window.clearInterval(id);
  }, [reload]);

  return { posts, loading, reload };
}
