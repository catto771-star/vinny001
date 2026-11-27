// @vitest-environment jsdom
// Revisão 16: folha de continuidade — ocupação e chamada de incêndio, guardada no aparelho para uso sem internet.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabaseConfigured: true, supabase: {} }));
vi.mock("@/auth/AuthProvider", () => ({ useAuth: () => ({ lodges: [], staff: null }) }));

import { I18nProvider } from "@/i18n";
import { buildSnapshot, loadSnapshot, saveSnapshot } from "@/lib/continuity";
import { ContinuityOffline, ContinuitySheet } from "./Continuity";
import type { BedOccupancy } from "@/lib/types";

const bed = (o: Partial<BedOccupancy>): BedOccupancy => ({
  lodge_id: "a", lodge_code: "AMIENS", room_id: "r1", room_kind: "room", room_code: "1", room_sort: 1, bed_id: Math.random().toString(), bed_number: 1,
  bed_status: "in_use", stay_id: null, stay_status: null, admitted_at: null, resident_id: null, first_name: null, last_name: null, date_of_birth: null, pass_id: null, ...o,
});
const beds = [
  bed({ bed_number: 1, stay_id: "s1", stay_status: "active", resident_id: "x1", first_name: "Declan", last_name: "Byrne", date_of_birth: "1980-01-02", pass_id: "P1", final_warning: true }),
  bed({ bed_number: 2, stay_id: "s2", stay_status: "active", resident_id: "x2", first_name: "Niall", last_name: "Rocha", pass_id: "P2" }),
  bed({ bed_number: 3, stay_id: "s3", stay_status: "out_pending", resident_id: "x3", first_name: "Seán", last_name: "Walsh", pass_id: "P3" }),
  bed({ bed_number: 4 }),
  bed({ bed_number: 5, bed_status: "out_of_service" }),
];
const snap = () => buildSnapshot(beds, [{ id: "a", name: "Amiens St." }], new Set(["s2"]), { a: "Ciarán Byrne" }, "Rafael Souza", new Date("2026-11-26T23:00:00Z"));

beforeEach(() => { try { window.localStorage.clear(); } catch { /* */ } });
afterEach(cleanup);

describe("folha de continuidade", () => {
  it("monta a folha: presente, ausente, cama cancelada, livre e fora de uso; guarda e lê do aparelho", () => {
    const s = snap();
    expect(s.houses[0].rooms[0].beds.map((b) => b.status)).toEqual(["present", "absent", "cancelled", "free", "oos"]);
    expect(s.houses[0].onDuty).toBe("Ciarán Byrne");
    saveSnapshot(s, "u1");
    expect(loadSnapshot("u1")?.at).toBe(s.at);
    expect(loadSnapshot("u1")?.houses[0].rooms[0].beds[0].name).toBe("Declan Byrne");
  });
  it("mostra a chamada de incêndio: quadradinho para cada residente presente, nota nos demais, e o aviso de cópia guardada", () => {
    render(<I18nProvider><ContinuitySheet snap={snap()} online={false} /></I18nProvider>);
    expect(screen.getByText("No internet. Showing the last copy saved on this device.")).toBeTruthy();
    expect(screen.getByText(/Saved copy from/)).toBeTruthy();
    expect(document.querySelectorAll(".rollbox")).toHaveLength(2); // presente + ausente (cancelada não entra)
    expect(screen.getByText("Away (absence)")).toBeTruthy();
    expect(screen.getByText("Bed cancelled")).toBeTruthy();
    expect(screen.getByText("Free bed")).toBeTruthy();
    expect(screen.getByText("Declan Byrne")).toBeTruthy();
    expect(screen.getByText(/Float: Rafael Souza/)).toBeTruthy();
  });
  it("a cópia é de uma pessoa só: outra conta no mesmo aparelho não lê, e a anterior é apagada", () => {
    saveSnapshot(snap(), "u1");
    expect(loadSnapshot("u2")).toBeNull();
    saveSnapshot(snap(), "u2");
    expect(loadSnapshot("u1")).toBeNull();
    expect(loadSnapshot("u2")).not.toBeNull();
  });
  it("sem sessão e sem internet abre só a cópia guardada; sem cópia, explica", () => {
    saveSnapshot(snap(), "u1");
    render(<I18nProvider><ContinuityOffline /></I18nProvider>);
    expect(screen.getByText("Declan Byrne")).toBeTruthy();
    cleanup();
    window.localStorage.clear();
    render(<I18nProvider><ContinuityOffline /></I18nProvider>);
    expect(screen.getByText(/No copy saved on this device yet/)).toBeTruthy();
  });
});
