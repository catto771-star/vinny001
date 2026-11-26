// @vitest-environment jsdom
// Revisão 13: o aviso de prazo vencido nunca abre por cima de outro formulário aberto.
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const ticket = { id: "t1", lodge_id: "a", priority: "normal", status: "open", location: "Room 7 — window", description: "Does not close", deadline_at: "2026-11-17T10:26:00Z", created_at: "2026-11-10T10:00:00Z", created_by: "me", resolved_at: null, overdue: true };
const rpc = vi.fn(async (name: string) => ({ data: name === "maintenance_reminders" ? [ticket] : null, error: null }));
vi.mock("@/lib/supabase", () => ({ supabaseConfigured: true, supabase: { rpc: (n: string) => rpc(n), from: () => ({}) } }));
vi.mock("@/auth/AuthProvider", () => ({ useAuth: () => ({ isManagement: true, staff: { id: "me" }, lodges: [], canWriteLodge: () => true }) }));

import { I18nProvider } from "@/i18n";
import { ToastProvider } from "@/components/Toast";
import { MaintenanceReminder } from "./Maintenance";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); document.body.innerHTML = ""; vi.clearAllMocks(); });

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
});
