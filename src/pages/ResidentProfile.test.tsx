// @vitest-environment jsdom
// Link velho ou URL editada: o perfil de um residente que não existe mostra o motivo e um caminho de volta.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn(async () => ({ data: null, error: { message: "resident_not_found" } }));
vi.mock("@/lib/supabase", () => ({ supabaseConfigured: true, supabase: { rpc: (...a: unknown[]) => (rpc as (...x: unknown[]) => unknown)(...a) } }));
vi.mock("@/lib/useOccupancy", () => ({ useOccupancy: () => ({ beds: [], loading: false, error: null, reload: vi.fn() }) }));
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ lodges: [], canWriteLodge: () => true, isManagement: false, post: null }),
}));

import { I18nProvider } from "@/i18n";
import { ResidentProfile } from "./ResidentProfile";

afterEach(cleanup);

describe("Perfil de residente inexistente", () => {
  it("explica que o registro não foi encontrado e oferece voltar à lista", async () => {
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={["/residents/00000000-0000-0000-0000-000000000000"]}>
          <Routes><Route path="/residents/:id" element={<ResidentProfile />} /></Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
    await waitFor(() => expect(screen.getByText(/This record was not found/)).toBeTruthy());
    expect(screen.getByRole("link", { name: /Residents/ }).getAttribute("href")).toBe("/residents");
  });
});
