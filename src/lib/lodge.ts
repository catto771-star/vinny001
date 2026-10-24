import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Lodge = {
  id: string;
  code: string;
  name: string;
  short_name: string;
};

const LODGE_STORAGE_KEY = "sharkgit.active-lodge";

export function useActiveLodge() {
  const [lodges, setLodges] = useState<Lodge[]>([]);
  const [lodgeId, setLodgeId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: authData } = await supabase.auth.getUser();

      const { data, error: loadError } = await supabase
        .from("lodges")
        .select("id, code, name, short_name")
        .eq("active", true)
        .order("name", { ascending: true });

      if (cancelled) return;

      if (loadError) {
        setError(loadError.message);
        setLoading(false);
        return;
      }

      const list = (data ?? []) as Lodge[];
      const stored = window.localStorage.getItem(LODGE_STORAGE_KEY);
      const initial = list.find((lodge) => lodge.id === stored)?.id ?? list[0]?.id ?? null;

      setUserId(authData?.user?.id ?? null);
      setError(null);
      setLodges(list);
      setLodgeId(initial);
      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectLodge = useCallback((id: string) => {
    setLodgeId(id);
    window.localStorage.setItem(LODGE_STORAGE_KEY, id);
  }, []);

  return { lodges, lodgeId, selectLodge, userId, loading, error };
}
