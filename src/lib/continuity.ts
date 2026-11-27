import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { residentName, staffName, type BedOccupancy, type Lodge } from "@/lib/types";

/** Folha de continuidade: ocupação e chamada de incêndio, guardada no navegador para consulta sem internet. */
export type SnapBed = { n: number; name: string | null; dob: string | null; passId: string | null; status: "free" | "present" | "absent" | "cancelled" | "oos"; fw: boolean };
export type SnapRoom = { code: string; beds: SnapBed[] };
export type SnapHouse = { id: string; name: string; onDuty: string | null; rooms: SnapRoom[] };
export type Snapshot = { at: string; float: string | null; houses: SnapHouse[] };
/** A cópia guardada pertence a UMA pessoa e só mostra as casas que ela pode ver: outra conta no mesmo aparelho nunca a lê. */

const roomLabelPlain = (kind: string, code: string) => (kind === "apartment" ? `Apartment ${code}` : `Room ${code}`);
const KEY = "continuity.snapshot";
const LAST = `${KEY}.last`;
const keyFor = (owner: string) => `${KEY}.${owner}`;
export const SNAPSHOT_EVERY_MS = 60 * 60 * 1000;

export function buildSnapshot(beds: BedOccupancy[], lodges: Pick<Lodge, "id" | "name">[], absentStays: Set<string>, onDuty: Record<string, string | null>, float: string | null, at: Date): Snapshot {
  const houses: SnapHouse[] = lodges.map((l) => {
    const rooms: SnapRoom[] = [];
    for (const b of beds.filter((x) => x.lodge_id === l.id)) {
      let room = rooms.find((r) => r.code === roomLabelPlain(b.room_kind, b.room_code));
      if (!room) rooms.push((room = { code: roomLabelPlain(b.room_kind, b.room_code), beds: [] }));
      const status: SnapBed["status"] = b.stay_id
        ? b.stay_status === "out_pending" ? "cancelled" : absentStays.has(b.stay_id) ? "absent" : "present"
        : b.bed_status === "out_of_service" ? "oos" : "free";
      room.beds.push({ n: b.bed_number, name: b.resident_id ? residentName(b) : null, dob: b.date_of_birth, passId: b.pass_id, status, fw: !!b.final_warning });
    }
    return { id: l.id, name: l.name, onDuty: onDuty[l.id] ?? null, rooms };
  });
  return { at: at.toISOString(), float, houses: houses.filter((h) => h.rooms.length > 0) };
}

export function saveSnapshot(s: Snapshot, owner: string): void {
  try {
    const ls = window.localStorage;
    for (let i = ls.length - 1; i >= 0; i--) {
      const k = ls.key(i);
      if (k && k.startsWith(KEY) && k !== keyFor(owner) && k !== LAST) ls.removeItem(k);
    }
    ls.setItem(keyFor(owner), JSON.stringify(s));
    ls.setItem(LAST, owner);
  } catch { /* armazenamento indisponível */ }
}
/** owner = a pessoa logada; sem sessão (offline) abre a última cópia deste aparelho. */
export function loadSnapshot(owner: string | null = null): Snapshot | null {
  try {
    owner = owner ?? window.localStorage.getItem(LAST);
    if (!owner) return null;
    const v = JSON.parse(window.localStorage.getItem(keyFor(owner)) ?? "null");
    return v && Array.isArray(v.houses) && typeof v.at === "string" ? (v as Snapshot) : null;
  } catch { return null; }
}

/** Busca os dados atuais, monta a folha e guarda no navegador. Devolve null se estiver sem internet. */
export async function fetchSnapshot(owner: string, lodges: Pick<Lodge, "id" | "name">[], posts: { function: string; lodge_id: string | null; staff: { full_name: string; display_name: string | null } | null }[]): Promise<Snapshot | null> {
  const [{ data: beds, error }, { data: abs }] = await Promise.all([
    supabase.from("bed_occupancy").select("*").order("room_sort").order("bed_number"),
    supabase.from("absences").select("stay_id").is("ended_at", null),
  ]);
  if (error || !beds) return null;
  const onDuty: Record<string, string | null> = {};
  for (const l of lodges) onDuty[l.id] = staffName(posts.find((p) => p.function === "office" && p.lodge_id === l.id)?.staff) || null;
  const float = staffName(posts.find((p) => p.function === "float")?.staff) || null;
  const snap = buildSnapshot(beds as BedOccupancy[], lodges, new Set(((abs ?? []) as { stay_id: string }[]).map((a) => a.stay_id)), onDuty, float, new Date());
  saveSnapshot(snap, owner);
  return snap;
}

/** Atualiza a cópia guardada a cada hora enquanto o sistema estiver aberto (e ao abrir). */
export function useContinuitySnapshot(owner: string | null, enabled: boolean, lodges: Pick<Lodge, "id" | "name">[], posts: Parameters<typeof fetchSnapshot>[2]) {
  const [snap, setSnap] = useState<Snapshot | null>(() => loadSnapshot(owner));
  const [online, setOnline] = useState<boolean>(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const refresh = useCallback(async () => {
    if (!owner) return null;
    const s = await fetchSnapshot(owner, lodges, posts);
    if (s) { setSnap(s); setOnline(true); } else setOnline(false);
    return s;
  }, [owner, lodges, posts]);
  useEffect(() => {
    if (!enabled || !owner || lodges.length === 0) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), SNAPSHOT_EVERY_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, owner, lodges.length]);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return { snap, online, refresh };
}
