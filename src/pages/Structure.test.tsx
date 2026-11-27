// @vitest-environment jsdom
// Revisão 13: Admin gere quartos, camas, geladeiras, máquinas e dados das casas.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn(async (_n: string, _a?: unknown) => ({ data: null, error: null as null | { message: string } }));
const tables: Record<string, unknown[]> = {};
function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "order", "eq", "in", "is"]) q[m] = () => q;
  q.then = (resolve: (v: unknown) => void) => resolve({ data: result, error: null });
  return q;
}
vi.mock("@/lib/supabase", () => ({ supabaseConfigured: true, supabase: { rpc: (n: string, a: unknown) => rpc(n, a), from: (t: string) => query(tables[t] ?? []) } }));
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    isManagement: true, staff: { id: "me", role: "manager" },
    lodges: [{ id: "a", code: "AMIENS", name: "Amiens St.", short_name: "Amiens", has_dinner: true, has_laundry: false }, { id: "c", code: "CONNOLLY", name: "Connolly", short_name: "Connolly", has_dinner: false, has_laundry: true }],
    canWriteLodge: () => true,
  }),
}));

import { I18nProvider } from "@/i18n";
import { ToastProvider } from "@/components/Toast";
import { Structure } from "./Structure";

const show = (url = "/structure") => render(<I18nProvider><ToastProvider><MemoryRouter initialEntries={[url]}><Structure /></MemoryRouter></ToastProvider></I18nProvider>);
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
beforeEach(() => {
  tables.rooms = [
    { id: "r1", code: "1", kind: "room", active: true, sort_order: 1, beds: [{ id: "b1", number: 1, active: true, status: "in_use" }, { id: "b2", number: 2, active: true, status: "in_use" }] },
    { id: "r2", code: "2", kind: "room", active: false, sort_order: 2, beds: [{ id: "b3", number: 1, active: true, status: "in_use" }] },
  ];
  tables.bed_occupancy = [{ bed_id: "b1", stay_id: "s1" }];
  tables.fridges = [{ id: "f1", code: "F1", name: "Kitchen fridge", active: true, sort_order: 1 }, { id: "f2", code: "F2", name: "Old fridge", active: false, sort_order: 2 }];
  tables.laundry_machines = [{ id: "m1", code: "A-WASH", label: "A · Wash", kind: "wash", active: true, sort_order: 1 }];
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Structure", () => {
  it("lista quartos com camas; cama ocupada aparece marcada e sem botão de remover", async () => {
    show();
    const room = (await screen.findByText("Room 1")).closest("article")!;
    expect(within(room).getByText("Bed 1").closest("li")!.textContent).toContain("Occupied");
    expect(within(room).queryByRole("button", { name: "Remove bed 1" })).toBeNull();
    expect(within(room).getByRole("button", { name: "Remove bed 2" })).toBeTruthy();
  });
  it("adiciona quarto (código, tipo e número de camas)", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "New Room" }));
    const dlg = document.querySelector("dialog[open]") as HTMLElement;
    fireEvent.change(within(dlg).getByLabelText("Room"), { target: { value: "13" } });
    fireEvent.change(within(dlg).getByLabelText("Beds"), { target: { value: "3" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "New Room" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("add_room", { p_lodge: "a", p_code: "13", p_kind: "room", p_beds: 3 }));
  });
  it("+ Bed, remover cama livre e remover quarto chamam as funções certas", async () => {
    show();
    const room = (await screen.findByText("Room 1")).closest("article")!;
    fireEvent.click(within(room).getByRole("button", { name: "Add bed" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("add_bed", { p_room: "r1" }));
    fireEvent.click(within(room).getByRole("button", { name: "Remove bed 2" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("set_bed_active", { p_bed: "b2", p_active: false }));
    fireEvent.click(within(room).getByRole("button", { name: "Remove room" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("set_room_active", { p_room: "r1", p_active: false }));
  });
  it("quarto removido fica numa seção própria e pode ser restaurado", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: /Removed \(1\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "Restore room 2" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("set_room_active", { p_room: "r2", p_active: true }));
  });
  it("erro do banco aparece em linguagem clara (quarto ocupado)", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "room_occupied" } });
    show();
    const room = (await screen.findByText("Room 1")).closest("article")!;
    fireEvent.click(within(room).getByRole("button", { name: "Remove room" }));
    expect(await screen.findByText("A resident is in this room. Move them first.")).toBeTruthy();
  });
  it("geladeiras: adicionar, renomear e remover", async () => {
    show("/structure?tab=fridges");
    fireEvent.click(await screen.findByRole("button", { name: "Add fridge" }));
    const dlg = document.querySelector("dialog[open]") as HTMLElement;
    fireEvent.change(within(dlg).getByLabelText("Name"), { target: { value: "Cold room" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Add fridge" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("add_fridge", { p_lodge: "a", p_name: "Cold room" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Kitchen fridge" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("set_fridge_active", { p_fridge: "f1", p_active: false }));
  });
  it("máquinas de lavar: adicionar lavadora", async () => {
    show("/structure?tab=laundry");
    fireEvent.click(await screen.findByRole("button", { name: "Add machine" }));
    const dlg = document.querySelector("dialog[open]") as HTMLElement;
    fireEvent.change(within(dlg).getByLabelText("Name"), { target: { value: "C · Wash" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Add machine" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("add_laundry_machine", { p_lodge: "a", p_kind: "wash", p_label: "C · Wash" }));
  });
  it("casas: renomear e ligar/desligar Dinner e Laundry", async () => {
    tables.lodges = [
      { id: "a", name: "Amiens St.", short_name: "Amiens", has_dinner: true, has_laundry: false, active: true },
      { id: "c", name: "Connolly", short_name: "Connolly", has_dinner: false, has_laundry: true, active: true },
    ];
    show("/structure?tab=houses");
    const name = (await screen.findAllByLabelText("Name"))[0] as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Amiens Street" } });
    fireEvent.click(within(name.closest("article")!).getByRole("switch", { name: "Laundry" }));
    fireEvent.click(within(name.closest("article")!).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("update_lodge", { p_lodge: "a", p_name: "Amiens Street", p_short_name: "Amiens", p_has_dinner: true, p_has_laundry: true }));
  });
  it("casas: cria uma casa nova e desativa uma existente", async () => {
    tables.lodges = [{ id: "a", name: "Amiens St.", short_name: "Amiens", has_dinner: true, has_laundry: false, active: true }];
    show("/structure?tab=houses");
    fireEvent.click(await screen.findByRole("button", { name: "Add house" }));
    const dlg = document.querySelector("dialog[open]") as HTMLElement;
    fireEvent.change(within(dlg).getByLabelText(/Code/), { target: { value: "new_house" } });
    fireEvent.change(within(dlg).getByLabelText("Name"), { target: { value: "New House" } });
    fireEvent.change(within(dlg).getByLabelText("Short name"), { target: { value: "New" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("add_lodge", { p_code: "NEW_HOUSE", p_name: "New House", p_short: "New", p_has_dinner: false, p_has_laundry: false }));
    fireEvent.click(await screen.findByRole("button", { name: "Deactivate house" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("set_lodge_active", { p_lodge: "a", p_active: false }));
  });

  it("Suppliers: lista com as regras de cada um e cria fornecedor com campos obrigatórios", async () => {
    tables.suppliers = [
      { id: "s1", name: "Tesco", active: true, require_batch: false, require_best_before: false, require_temperature: false, links_order: true, sort_order: 1 },
      { id: "s2", name: "Ripley's", active: true, require_batch: true, require_best_before: true, require_temperature: false, links_order: false, sort_order: 2 },
    ];
    show("/structure?tab=suppliers");
    const ripley = (await screen.findByText("Ripley's")).closest("li")!;
    expect(within(ripley).getByText("Batch code")).toBeTruthy();
    expect(within(ripley).getByText("Best before")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "New Supplier" }));
    const dlg = document.querySelector("dialog[open]") as HTMLElement;
    fireEvent.change(within(dlg).getByLabelText("Name"), { target: { value: "Dunnes" } });
    fireEvent.click(within(dlg).getByRole("switch", { name: "Batch code" }));
    fireEvent.click(within(dlg).getByRole("button", { name: "New Supplier" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("add_supplier", { p_name: "Dunnes", p_batch: true, p_best_before: false, p_temperature: false, p_links_order: false }));
  });

  it("embutido em Settings > Registers: sem título de página, com a sub-aba Suppliers e a chave 'reg' na URL", async () => {
    tables.suppliers = [];
    render(<I18nProvider><ToastProvider><MemoryRouter initialEntries={["/settings?tab=registers&reg=suppliers"]}><Structure embedded /></MemoryRouter></ToastProvider></I18nProvider>);
    expect(await screen.findByRole("button", { name: "New Supplier" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("tab", { name: "Suppliers" }).getAttribute("aria-selected")).toBe("true");
  });
});
