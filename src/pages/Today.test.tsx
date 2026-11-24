// @vitest-environment jsdom
// Bug: enquanto a lista de quem está de serviço carregava, a tela Hoje mostrava
// "Ninguém" no posto — parecia que o Lodge estava sem Office.
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

let onDuty: { posts: unknown[]; loading: boolean } = { posts: [], loading: true };

vi.mock("@/lib/useOnDuty", () => ({ useOnDuty: () => ({ ...onDuty, reload: vi.fn() }) }));
vi.mock("@/lib/useOccupancy", async (orig) => ({
  ...(await orig<typeof import("@/lib/useOccupancy")>()),
  useOccupancy: () => ({ beds: [], loading: false, error: null, reload: vi.fn() }),
}));
vi.mock("@/lib/supabase", () => ({ supabaseConfigured: true, supabase: {} }));
vi.mock("@/components/PresenceAlertCard", () => ({ PresenceAlertCard: () => null }));
vi.mock("@/components/PendingTile", () => ({ PendingTile: () => null }));
vi.mock("@/components/ShiftRuler", () => ({ ShiftRuler: () => null }));
vi.mock("@/lib/useNextCheck", () => ({ useNextCheck: () => ({ slot: "12:00", pendingCount: 1, loading: false }) }));
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    lodges: [{ id: "a", code: "AMIENS", name: "Amiens St.", short_name: "Amiens" }],
    post: { id: "p", function: "office", lodge_id: "a", started_at: new Date().toISOString() },
    isManagement: false,
    staff: { full_name: "Porter", display_name: null, role: "porter" },
    serverOffsetMs: 0,
  }),
}));

import { I18nProvider } from "@/i18n";
import { Today } from "./Today";

function renderToday() {
  render(
    <I18nProvider>
      <MemoryRouter>
        <Today />
      </MemoryRouter>
    </I18nProvider>,
  );
}

afterEach(cleanup);

describe("Hoje — de serviço agora", () => {
  it("enquanto carrega, não mostra 'Nobody' nos postos", () => {
    onDuty = { posts: [], loading: true };
    renderToday();
    expect(screen.queryByText("Nobody")).toBeNull();
    expect(screen.getAllByText("Loading…").length).toBeGreaterThan(0);
  });

  it("depois de carregar, mostra quem está no posto ou 'Nobody'", () => {
    onDuty = {
      posts: [{ id: "p", staff_id: "s", function: "office", lodge_id: "a", started_at: "2026-11-20T08:00:00Z", ended_at: null, staff: { full_name: "Porter B", display_name: null } }],
      loading: false,
    };
    renderToday();
    expect(screen.getByText(/Porter B/)).toBeTruthy();
    expect(screen.getByText("Nobody")).toBeTruthy(); // Float vazio
  });

  it("ação principal do turno: Office com check vencido vê 'Enter the 12:00 check'", () => {
    onDuty = { posts: [], loading: false };
    renderToday();
    expect(screen.getByRole("button", { name: "Enter the 12:00 check" })).toBeTruthy();
    expect(screen.getByText("1 check(s) due and not entered yet")).toBeTruthy();
  });
});
