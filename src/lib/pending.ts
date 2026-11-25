import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type PendingCounts = { tasks: number; maintenance: number; absences: number; checks: number; rounds: number; no_shows: number };
export const EMPTY_COUNTS: PendingCounts = { tasks: 0, maintenance: 0, absences: 0, checks: 0, rounds: 0, no_shows: 0 };

/** Soma as pendências de vários Lodges (gestão e Float veem os dois). */
export function sumCounts(list: Array<Partial<PendingCounts> | null | undefined>): PendingCounts {
  const out = { ...EMPTY_COUNTS };
  for (const c of list) {
    if (!c) continue;
    for (const k of Object.keys(out) as (keyof PendingCounts)[]) out[k] += Number(c[k] ?? 0);
  }
  return out;
}

/** Bolinha vermelha por seção do menu (s.11): some só quando o item é resolvido. */
export const BADGE_FOR_PATH: Record<string, keyof PendingCounts> = {
  "/tasks": "tasks",
  "/maintenance": "maintenance",
  "/absences": "absences",
  "/sheet": "checks",
  "/handover": "rounds",
  "/no-shows": "no_shows",
};

/** Contagem de um item do menu; Notifications usa as não lidas. */
export function badgeFor(to: string, counts: PendingCounts, unread = 0): number {
  if (to === "/notifications") return unread;
  const key = BADGE_FOR_PATH[to];
  return key ? counts[key] : 0;
}

/** Soma dos itens de um módulo (mostrada no cabeçalho do módulo retraído). */
export function groupBadgeTotal(paths: string[], counts: PendingCounts, unread = 0): number {
  return paths.reduce((n, p) => n + badgeFor(p, counts, unread), 0);
}

export function usePendingCounts(lodgeIds: string[], refreshKey: unknown) {
  const [counts, setCounts] = useState<PendingCounts>(EMPTY_COUNTS);
  const key = lodgeIds.join(",");
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const load = async () => {
      const results = await Promise.all(key.split(",").map((id) => supabase.rpc("pending_counts", { p_lodge: id })));
      if (!cancelled) setCounts(sumCounts(results.map((r) => r.data as PendingCounts | null)));
    };
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [key, refreshKey]);
  return counts;
}
