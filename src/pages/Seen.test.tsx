// @vitest-environment jsdom
// Bug: ao trocar o dia, a resposta atrasada da consulta anterior sobrescrevia a do
// dia escolhido — a tela mostrava o Seen de outro dia sem avisar.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const row = (name: string, seenDay: boolean) => ({
  resident_id: "r1", stay_id: "s1", first_name: name, last_name: "X", room_kind: "room", room_code: "4", bed_number: 5,
  seen_day: seenDay, seen_night: false, day_sources: seenDay ? ["check"] : [], night_sources: [],
});

// A consulta do dia padrão demora; a do dia escolhido responde rápido.
const rpc = vi.fn((_name: string, args: { p_day: string }) =>
  new Promise((resolve) => {
    if (args.p_day === "2026-02-13") setTimeout(() => resolve({ data: [row("Chosen", true)], error: null }), 10);
    else setTimeout(() => resolve({ data: [row("Stale", false)], error: null }), 120);
  }),
);

vi.mock("@/lib/supabase", () => ({ supabaseConfigured: true, supabase: { rpc: (n: string, a: { p_day: string }) => rpc(n, a) } }));
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    lodges: [{ id: "a", code: "AMIENS", name: "Amiens St.", short_name: "Amiens" }],
    post: { function: "office", lodge_id: "a" },
    staff: null,
    serverOffsetMs: 0,
    canWriteLodge: () => true,
  }),
}));

import { I18nProvider } from "@/i18n";
import { Seen } from "./Seen";

afterEach(cleanup);

describe("Seen — troca de dia", () => {
  it("mostra o dia escolhido mesmo se a resposta do dia anterior chegar depois", async () => {
    render(<I18nProvider><MemoryRouter><Seen /></MemoryRouter></I18nProvider>);
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: "2026-02-13" } });
    await waitFor(() => expect(screen.getByText("Chosen X")).toBeTruthy());
    await new Promise((r) => setTimeout(r, 200)); // a resposta atrasada chega
    expect(screen.queryByText("Stale X")).toBeNull();
    expect(screen.getByText("Chosen X")).toBeTruthy();
  });
});
