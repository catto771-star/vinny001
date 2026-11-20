// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

let offset = 0;
const rpc = vi.fn(async () => ({
  data: { complete: false, pending_slots: ["18:00"], without_evidence: [{ stay_id: "s1", resident_id: "r1", first_name: "Ana", last_name: "X", room_kind: "room", room_code: "4", bed_number: 2 }] },
  error: null,
}));
vi.mock("@/lib/supabase", () => ({ supabaseConfigured: true, supabase: { rpc: (...a: unknown[]) => rpc(...(a as [])) } }));
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    lodges: [{ id: "a", code: "AMIENS", name: "Amiens St.", short_name: "Amiens" }],
    post: { function: "office", lodge_id: "a" },
    isManagement: false,
    serverOffsetMs: offset,
  }),
}));

import { I18nProvider } from "@/i18n";
import { PresenceAlertCard } from "./PresenceAlertCard";

afterEach(() => {
  cleanup();
  rpc.mockClear();
});

function renderCard(at: string) {
  offset = new Date(at).getTime() - Date.now();
  render(
    <I18nProvider>
      <MemoryRouter>
        <PresenceAlertCard />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("Aviso das 18h30", () => {
  it("antes das 18h30 não aparece e não consulta", () => {
    renderCard("2026-11-20T15:00:00Z");
    expect(screen.queryByText(/18:30 alert/)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("depois das 18h30 lista quem está sem evidência e avisa checks por lançar", async () => {
    renderCard("2026-11-20T18:45:00Z");
    await waitFor(() => expect(screen.getByText("Ana X")).toBeTruthy());
    expect(screen.getByText(/Checks still to enter today: 18:00/)).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith("presence_alert", { p_lodge: "a" });
  });
});
