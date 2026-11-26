// @vitest-environment jsdom
// Configurações do Admin (revisão 3): tags visíveis no Handover e notificações de cada Admin.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const impl = async (name: string, _a?: unknown) => ({
  data: name === "my_push_prefs" ? [
    { key: "tag:incident", label: "Incident / Safety", group: "handover", enabled: true },
    { key: "maintenance:low", label: "Low", group: "maintenance", enabled: false },
    { key: "warning", label: "Warnings", group: "other", enabled: true },
  ] : null,
  error: null as null | { message: string },
});
const rpc = vi.fn(impl);
const tags = [
  { id: "g0", code: "incident", label: "Incident / Safety", color: "red", sort_order: 1, visible: true, notify_default: true },
  { id: "g1", code: "delivery", label: "Delivery", color: "grey", sort_order: 7, visible: true, notify_default: false },
];
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

afterEach(cleanup);
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

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
    expect(await screen.findByText(/can't receive notifications|Add to Home Screen/)).toBeTruthy();
  });

  it("revisão 14: cria uma tag nova (nome, cor, avisa por padrão)", async () => {
    render(<I18nProvider><MemoryRouter initialEntries={["/settings?tab=handover"]}><Settings /></MemoryRouter></I18nProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Add tag" }));
    const dlg = document.querySelector("dialog[open]") as HTMLElement;
    fireEvent.change(within(dlg).getByLabelText("Name"), { target: { value: "Fire drill" } });
    fireEvent.change(within(dlg).getByLabelText("Colour"), { target: { value: "red" } });
    fireEvent.click(within(dlg).getByRole("checkbox", { name: "Notify Admins by default" }));
    fireEvent.click(within(dlg).getByRole("button", { name: "Add tag" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("add_handover_tag", { p_label: "Fire drill", p_color: "red", p_notify: true }));
  });
  it("revisão 14: liga o aviso padrão de uma tag, edita e muda a ordem", async () => {
    render(<I18nProvider><MemoryRouter initialEntries={["/settings?tab=handover"]}><Settings /></MemoryRouter></I18nProvider>);
    fireEvent.click(await screen.findByRole("switch", { name: "Notify by default · Delivery" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("update_handover_tag", { p_tag: "g1", p_label: "Delivery", p_color: "grey", p_notify: true }));
    fireEvent.click(screen.getByRole("button", { name: "Move Delivery up" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("move_handover_tag", { p_tag: "g1", p_dir: -1 }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Delivery" }));
    const dlg = document.querySelector("dialog[open]") as HTMLElement;
    fireEvent.change(within(dlg).getByLabelText("Name"), { target: { value: "Deliveries" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("update_handover_tag", { p_tag: "g1", p_label: "Deliveries", p_color: "grey", p_notify: false }));
  });
  it("revisão 14: erro do banco (nome repetido) aparece em linguagem clara", async () => {
    rpc.mockImplementation(async (name: string) => (name === "add_handover_tag" ? { data: null, error: { message: "tag_exists" } } : impl(name)));
    render(<I18nProvider><MemoryRouter initialEntries={["/settings?tab=handover"]}><Settings /></MemoryRouter></I18nProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Add tag" }));
    const dlg = document.querySelector("dialog[open]") as HTMLElement;
    fireEvent.change(within(dlg).getByLabelText("Name"), { target: { value: "Delivery" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Add tag" }));
    expect(await screen.findByText("A tag with this name already exists.")).toBeTruthy();
    rpc.mockImplementation(impl);
  });
});
