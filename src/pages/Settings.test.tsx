// @vitest-environment jsdom
// Configurações do Admin (revisão 3): tags visíveis no Handover e notificações de cada Admin.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn(async (name: string, _a?: unknown) => ({
  data: name === "my_push_prefs" ? [
    { key: "tag:incident", label: "Incident / Safety", group: "handover", enabled: true },
    { key: "maintenance:low", label: "Low", group: "maintenance", enabled: false },
    { key: "warning", label: "Warnings", group: "other", enabled: true },
  ] : null,
  error: null,
}));
const tags = [{ id: "g1", code: "delivery", label: "Delivery", sort_order: 7, visible: true, notify_default: false }];
function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "order"]) q[m] = () => q;
  q.then = (resolve: (v: unknown) => void) => resolve({ data: result, error: null });
  return q;
}
vi.mock("@/lib/supabase", () => ({ supabaseConfigured: true, supabase: { rpc: (n: string, a: unknown) => rpc(n, a), from: () => query(tags) } }));

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ isManagement: true, staff: { id: "me", full_name: "Admin", display_name: null, role: "manager", email: "a@x", home_lodge_id: null }, session: null, lodges: [] }),
}));

import { I18nProvider } from "@/i18n";
import { Settings } from "./Settings";

describe("Configurações do Admin", () => {
  it("liga a manutenção 'Low' só para mim e esconde a tag Delivery do Handover", async () => {
    render(<I18nProvider><MemoryRouter initialEntries={["/settings?tab=notifications"]}><Settings /></MemoryRouter></I18nProvider>);
    const low = await screen.findByRole("switch", { name: "Maintenance (by priority) · Low" });
    expect((low as HTMLInputElement).checked).toBe(false);
    fireEvent.click(low);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("set_push_pref", { p_key: "maintenance:low", p_enabled: true }));
    fireEvent.click(screen.getByRole("tab", { name: "Handover" }));
    fireEvent.click(await screen.findByRole("switch", { name: "Show · Delivery" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("set_handover_tag", { p_tag: "g1", p_visible: false }));
  });

  it("fora do app instalado no iPhone, explica como adicionar à Tela de Início", async () => {
    render(<I18nProvider><MemoryRouter initialEntries={["/settings?tab=notifications"]}><Settings /></MemoryRouter></I18nProvider>);
    expect(await screen.findByText(/cannot receive notifications|Add to Home Screen/)).toBeTruthy();
  });
});
