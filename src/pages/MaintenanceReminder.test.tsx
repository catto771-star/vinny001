// @vitest-environment jsdom
// Revisão 13: o aviso de prazo vencido nunca abre por cima de outro formulário aberto.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const ticket = { id: "t1", lodge_id: "a", priority: "normal", status: "open", location: "Room 7 — window", description: "Does not close", deadline_at: "2026-11-17T10:26:00Z", created_at: "2026-11-10T10:00:00Z", created_by: "me", resolved_at: null, overdue: true };
let tickets = [ticket];
const rpc = vi.fn(async (name: string) => ({ data: name === "maintenance_reminders" ? tickets : null, error: null }));
vi.mock("@/lib/supabase", () => ({ supabaseConfigured: true, supabase: { rpc: (n: string) => rpc(n), from: () => ({}) } }));
vi.mock("@/auth/AuthProvider", () => ({ useAuth: () => ({ isManagement: true, staff: { id: "me" }, lodges: [], canWriteLodge: () => true }) }));

import { I18nProvider } from "@/i18n";
import { ToastProvider } from "@/components/Toast";
import { MaintenanceReminder } from "./Maintenance";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); document.body.innerHTML = ""; vi.clearAllMocks(); tickets = [ticket]; window.sessionStorage.clear(); });

const show = () => render(<I18nProvider><ToastProvider><MaintenanceReminder /></ToastProvider></I18nProvider>);

describe("aviso de prazo vencido", () => {
  it("abre sozinho quando não há outro formulário aberto", async () => {
    show();
    expect(await screen.findByText("Deadline passed — what is the status?")).toBeTruthy();
  });
  it("espera enquanto outro formulário está aberto e só então aparece", async () => {
    const other = document.createElement("dialog");
    other.setAttribute("open", "");
    document.body.appendChild(other);
    show();
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("maintenance_reminders"));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("Deadline passed — what is the status?")).toBeNull();
    await act(async () => { other.removeAttribute("open"); await new Promise((r) => setTimeout(r, 50)); });
    expect(await screen.findByText("Deadline passed — what is the status?")).toBeTruthy();
  });

  it("com vários pedidos vencidos, o X dispensa todos (por 1 hora) e a janela fecha de verdade", async () => {
    tickets = [ticket, { ...ticket, id: "t2", location: "Room 21 — sink" }, { ...ticket, id: "t3", location: "Garden light" }];
    show();
    expect(await screen.findByText("1 of 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "×" }));
    await waitFor(() => expect(screen.queryByText("Deadline passed — what is the status?")).toBeNull());
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByText("Deadline passed — what is the status?")).toBeNull();
    expect(rpc).not.toHaveBeenCalledWith("snooze_maintenance_reminder");
  });
  it("a dispensa vale também depois de recarregar a tela (mesma sessão do navegador)", async () => {
    window.sessionStorage.setItem("maint.reminder.until", String(Date.now() + 3_600_000));
    show();
    await waitFor(() => expect(rpc).not.toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByText("Deadline passed — what is the status?")).toBeNull();
  });
});
