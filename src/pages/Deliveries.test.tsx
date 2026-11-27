// @vitest-environment jsdom
// Revisão 15: New Delivery com fornecedor da lista; Batch code, Best before e Temperature obrigatórios conforme o fornecedor.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const rpc = vi.fn(async (_n: string, _a?: unknown) => ({ data: "d1", error: null }));
const tables: Record<string, unknown[]> = {
  suppliers: [
    { id: "tesco", name: "Tesco", active: true, require_batch: false, require_best_before: false, require_temperature: false, links_order: true, sort_order: 1 },
    { id: "ripley", name: "Ripley's", active: true, require_batch: true, require_best_before: true, require_temperature: false, links_order: false, sort_order: 2 },
  ],
  food_deliveries: [{ id: "x1", product: "Milk", supplier: "Tesco", supplier_id: "tesco", order_id: null, batch: null, expiry_date: null, temperature: null, note: null, received_by: "s1", received_at: "2026-11-27T10:30:00Z" }],
  parameters: [{ key: "delivery.expiry_alert_days", value: 5, valid_from: "2026-01-01", lodge_id: null }],
  staff: [{ id: "s1", full_name: "Niamh Doyle", display_name: null, role: "station", active: true }],
};
function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "in", "is", "order", "limit"]) q[m] = () => q;
  q.then = (resolve: (v: unknown) => void) => resolve({ data: result, error: null });
  return q;
}
vi.mock("@/lib/supabase", () => ({ supabaseConfigured: true, supabase: { rpc: (n: string, a: unknown) => rpc(n, a), from: (t: string) => query(tables[t] ?? []) } }));
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    isManagement: false, serverOffsetMs: 0, staff: { id: "me", role: "station" },
    lodges: [{ id: "a", code: "AMIENS", name: "Amiens St.", short_name: "Amiens", has_dinner: true, has_laundry: false }],
    canWriteLodge: () => true, post: null,
  }),
}));

import { I18nProvider } from "@/i18n";
import { ToastProvider } from "@/components/Toast";
import { Deliveries } from "./Deliveries";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const open = async () => {
  render(<I18nProvider><ToastProvider><MemoryRouter><Deliveries /></MemoryRouter></ToastProvider></I18nProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "New Delivery" }));
  return document.querySelector("dialog[open]") as HTMLElement;
};
const save = (d: HTMLElement) => d.querySelector('button[type="submit"]') as HTMLButtonElement;
const field = (d: HTMLElement, label: string) => Array.from(d.querySelectorAll("label")).find((l) => l.textContent?.startsWith(label))!.querySelector("input,select") as HTMLInputElement;

describe("alerta de validade", () => {
  it("usa o prazo configurado em Settings (parameters), e não 2 dias fixos", async () => {
    const d = new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10);
    tables.food_deliveries = [{ ...(tables.food_deliveries[0] as object), id: "x2", expiry_date: d }];
    render(<I18nProvider><ToastProvider><MemoryRouter><Deliveries /></MemoryRouter></ToastProvider></I18nProvider>);
    expect(await screen.findByText("expires soon")).toBeTruthy();
  });
});

describe("New Delivery", () => {
  it("o botão se chama New Delivery e o fornecedor vem de uma lista (Tesco, Ripley's)", async () => {
    const d = await open();
    await waitFor(() => expect(Array.from(field(d, "Supplier").querySelectorAll("option")).map((o) => o.textContent)).toEqual(["Choose a supplier", "Tesco", "Ripley's"]));
  });
  it("Tesco não exige Batch code nem Best before; grava só com produto e fornecedor", async () => {
    const d = await open();
    await waitFor(() => expect(field(d, "Supplier").querySelectorAll("option").length).toBe(3));
    fireEvent.change(field(d, "Supplier"), { target: { value: "tesco" } });
    fireEvent.change(field(d, "Product"), { target: { value: "Weekly order" } });
    expect(save(d).disabled).toBe(false);
    fireEvent.click(save(d));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("record_food_delivery", expect.objectContaining({ p_supplier: "tesco", p_batch: null, p_expiry: null })));
  });
  it("Ripley's exige Batch code e Best before", async () => {
    const d = await open();
    await waitFor(() => expect(field(d, "Supplier").querySelectorAll("option").length).toBe(3));
    fireEvent.change(field(d, "Supplier"), { target: { value: "ripley" } });
    fireEvent.change(field(d, "Product"), { target: { value: "Ham" } });
    expect(save(d).disabled).toBe(true);
    fireEvent.change(field(d, "Batch code"), { target: { value: "L1" } });
    expect(save(d).disabled).toBe(true);
    fireEvent.change(field(d, "Best before"), { target: { value: "2026-12-30" } });
    expect(save(d).disabled).toBe(false);
  });
  it("entrega do Tesco aparece marcada como aguardando vínculo com o pedido", async () => {
    render(<I18nProvider><ToastProvider><MemoryRouter><Deliveries /></MemoryRouter></ToastProvider></I18nProvider>);
    expect(await screen.findByText("awaiting order link")).toBeTruthy();
  });
});
