import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { BedOccupancy } from "@/lib/types";

export function useOccupancy(lodgeId?: string) {
  const [beds, setBeds] = useState<BedOccupancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    let query = supabase.from("bed_occupancy").select("*").order("room_sort").order("bed_number");
    if (lodgeId) query = query.eq("lodge_id", lodgeId);
    const { data, error: loadError } = await query;
    setBeds((data ?? []) as BedOccupancy[]);
    setError(loadError);
    setLoading(false);
  }, [lodgeId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { beds, loading, error, reload };
}

export type OccupancySummary = { total: number; occupied: number; free: number; outOfService: number; outPending: number };

export function summarise(beds: BedOccupancy[]): OccupancySummary {
  const s = { total: beds.length, occupied: 0, free: 0, outOfService: 0, outPending: 0 };
  for (const b of beds) {
    if (b.stay_id) {
      s.occupied++;
      if (b.stay_status === "out_pending") s.outPending++;
    } else if (b.bed_status === "out_of_service") s.outOfService++;
    else s.free++;
  }
  return s;
}

/** Agrupa camas por quarto mantendo a ordem dos quartos. */
export function groupByRoom(beds: BedOccupancy[]) {
  const rooms = new Map<string, { room_id: string; room_kind: BedOccupancy["room_kind"]; room_code: string; lodge_id: string; beds: BedOccupancy[] }>();
  for (const b of beds) {
    const room = rooms.get(b.room_id) ?? { room_id: b.room_id, room_kind: b.room_kind, room_code: b.room_code, lodge_id: b.lodge_id, beds: [] };
    room.beds.push(b);
    rooms.set(b.room_id, room);
  }
  return [...rooms.values()];
}
