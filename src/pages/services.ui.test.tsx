// @vitest-environment jsdom
// Telas da Fase 2: Fridge, Dinner, Laundry e Notificações.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let management = false;
let role = "porter";
const rpcResult: Record<string, unknown> = {};
const rpc = vi.fn(async (name: string, _args?: unknown) => ({ data: rpcResult[name] ?? null, error: null }));
function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "order", "limit", "in", "is"]) q[m] = () => q;
  q.then = (resolve: (v: unknown) => void) => resolve({ data: result, error: null });
  return q;
}
const tables: Record<string, unknown[]> = {};
vi.mock("@/lib/supabase", () => ({
  supabaseConfigured: true,
  supabase: { rpc: (n: string, a: unknown) => rpc(n, a), from: (t: string) => query(tables[t] ?? []) },
}));
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    lodges: [
      { id: "a", code: "AMIENS", name: "Amiens St.", short_name: "Amiens", has_dinner: true, has_laundry: false },
      { id: "c", code: "CONNOLLY", name: "Connolly", short_name: "Connolly", has_dinner: false, has_laundry: true },
    ],
    post: { id: "p", function: "float", lodge_id: null, started_at: "2026-11-20T07:00:00Z" },
    staff: { id: "me", full_name: "Me", display_name: null, role },
    isManagement: management,
    serverOffsetMs: 0,
    canWriteLodge: () => true,
  }),
}));

import { I18nProvider } from "@/i18n";
import { Fridge } from "./Fridge";
import { Dinner } from "./Dinner";
import { Laundry } from "./Laundry";
import { Notifications } from "./Notifications";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
beforeEach(() => {
  management = false;
  role = "porter";
  for (const k of Object.keys(rpcResult)) delete rpcResult[k];
  for (const k of Object.keys(tables)) delete tables[k];
});
afterEach(() => {
  cleanup();
  rpc.mockClear();
});
const wrap = (ui: React.ReactNode) => render(<I18nProvider><MemoryRouter>{ui}</MemoryRouter></I18nProvider>);

describe("Fridge", () => {
  it("em branco não salva; aceita vírgula; fora da faixa avisa na hora", async () => {
    rpcResult.param_value = { min: 0, max: 5 };
    tables.fridges = [{ id: "f1", lodge_id: "a", name: "Kitchen fridge", sort_order: 1 }];
    wrap(<Fridge />);
    const input = await screen.findByLabelText("Temperature (°C)");
    const save = screen.getByRole("button", { name: "New Reading" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "7,5" } });
    expect(screen.getAllByText("Out of range").length).toBeGreaterThan(0);
    fireEvent.change(input, { target: { value: "3,5" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("record_fridge_reading", { p_fridge: "f1", p_temperature: 3.5, p_note: "" }));
  });

  it("Beta: casa com várias geladeiras mostra uma aba por geladeira e grava na escolhida", async () => {
    rpcResult.param_value = { min: 0, max: 5 };
    tables.fridges = [1, 2, 3, 4].map((n) => ({ id: `c${n}`, lodge_id: "a", name: `Fridge ${n}`, sort_order: n }));
    tables.fridge_readings = [{ id: "r1", fridge_id: "c3", temperature: "7.5", range_min: "0", range_max: "5", out_of_range: true, note: null, recorded_by: "me", recorded_at: "2026-11-20T10:00:00Z" }];
    wrap(<Fridge />);
    fireEvent.click(await screen.findByRole("tab", { name: /Fridge 3/ }));
    fireEvent.change(screen.getByLabelText("Temperature (°C)"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "New Reading" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("record_fridge_reading", { p_fridge: "c3", p_temperature: 4, p_note: "" }));
    delete tables.fridges;
    delete tables.fridge_readings;
  });
});

describe("Dinner", () => {
  const row = { stay_id: "s1", resident_id: "r1", first_name: "Ana", last_name: "X", room_kind: "room", room_code: "4", room_sort: 4, bed_number: 1, served: null, marked_by: null, final_warning: false };

  it("'Received' envia a marca do residente (vale como Seen Night); não há botão 'No' (revisão 4)", async () => {
    rpcResult.dinner_sheet = [row];
    rpcResult.dinner_summary = [{ service_id: null, leftovers: null, packaged: null, close_note: null, closed_at: null, closed_by: null, served_count: 0, not_served_count: 0, residents_count: 1 }];
    wrap(<Dinner />);
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: "2026-11-01" } });
    fireEvent.click(await screen.findByRole("button", { name: "Received — Ana X" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("mark_dinner", { p_lodge: "a", p_day: "2026-11-01", p_stay: "s1", p_served: true }));
    expect(screen.queryByRole("button", { name: "No" })).toBeNull();
  });

  it("revisão 4: tocar de novo desfaz (marca como não pegou)", async () => {
    rpcResult.dinner_sheet = [{ ...row, served: true }];
    rpcResult.dinner_summary = [{ service_id: null, leftovers: null, packaged: null, close_note: null, closed_at: null, closed_by: null, served_count: 1, not_served_count: 0, residents_count: 1 }];
    wrap(<Dinner />);
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: "2026-11-01" } });
    fireEvent.click(await screen.findByRole("button", { name: "Received — Ana X" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("mark_dinner", { p_lodge: "a", p_day: "2026-11-01", p_stay: "s1", p_served: false }));
  });

  it("Beta: antes das 18h pede confirmação e só então registra", async () => {
    rpcResult.dinner_sheet = [row];
    rpcResult.dinner_summary = [{ service_id: null, leftovers: null, packaged: null, close_note: null, closed_at: null, closed_by: null, served_count: 0, not_served_count: 0, residents_count: 1 }];
    wrap(<Dinner />);
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: "2099-01-01" } });
    fireEvent.click(await screen.findByRole("button", { name: "Received — Ana X" }));
    expect(await screen.findByText(/Record Ana X's meal now/)).toBeTruthy();
    expect(rpc).not.toHaveBeenCalledWith("mark_dinner", expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Record now" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("mark_dinner", { p_lodge: "a", p_day: "2099-01-01", p_stay: "s1", p_served: true }));
  });

  it("Beta: escolher quem pegou a refeição com @ marca 'Yes'", async () => {
    rpcResult.dinner_sheet = [row];
    rpcResult.dinner_summary = [{ service_id: null, leftovers: null, packaged: null, close_note: null, closed_at: null, closed_by: null, served_count: 0, not_served_count: 0, residents_count: 1 }];
    wrap(<Dinner />);
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: "2026-11-01" } });
    await screen.findByRole("button", { name: "Received — Ana X" });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "@ana" } });
    fireEvent.mouseDown(within(screen.getByRole("listbox")).getByRole("option", { name: /Ana X/ }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("mark_dinner", { p_lodge: "a", p_day: "2026-11-01", p_stay: "s1", p_served: true }));
  });

  it("só o Manager fecha as sobras (depois das 22h); Office não vê o botão", async () => {
    rpcResult.dinner_sheet = [row];
    rpcResult.dinner_summary = [{ service_id: "x", leftovers: null, packaged: null, close_note: null, closed_at: null, closed_by: null, served_count: 0, not_served_count: 0, residents_count: 1 }];
    wrap(<Dinner />);
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: "2026-11-01" } });
    await screen.findByRole("button", { name: "Received — Ana X" });
    expect(screen.queryByRole("button", { name: "Close leftovers" })).toBeNull();
    cleanup();
    management = true;
    role = "manager";
    wrap(<Dinner />);
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: "2026-11-01" } });
    fireEvent.click(await screen.findByRole("button", { name: "Close leftovers" }));
    fireEvent.change(screen.getByLabelText("Leftover portions"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("Packaged (not people served)"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("close_dinner", expect.objectContaining({ p_leftovers: 6, p_packaged: 4 })));
  });
});

describe("Laundry", () => {
  it("máquina livre inicia (residente opcional); ocupada finaliza", async () => {
    rpcResult.laundry_status = [
      { machine_id: "m1", code: "A-WASH", label: "A · Wash", kind: "wash", use_id: null, started_at: null, resident_id: null, first_name: null, last_name: null },
      { machine_id: "m2", code: "A-DRY", label: "A · Dry", kind: "dry", use_id: "u2", started_at: "2026-11-20T09:00:00Z", resident_id: "r1", first_name: "Caio", last_name: "Y" },
    ];
    wrap(<Laundry />);
    const free = (await screen.findByText("A · Wash")).closest("article")!;
    fireEvent.click(within(free).getByRole("button", { name: "Start" }));
    fireEvent.click(within(document.querySelector("dialog[open]") as HTMLElement).getByRole("button", { name: "Start" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("start_laundry", { p_machine: "m1", p_stay: null }));
    const busy = screen.getByText("A · Dry").closest("article")!;
    expect(within(busy).getByText("Caio Y")).toBeTruthy();
    fireEvent.click(within(busy).getByRole("button", { name: "Finish" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("finish_laundry", { p_use: "u2" }));
  });
});

describe("Notificações", () => {
  it("clicar marca como lida (não resolve o item)", async () => {
    management = true;
    rpcResult.my_notifications = [{ id: 7, kind: "fridge_out_of_range", lodge_id: "a", resident_id: null, payload: { temperature: 7.5, min: 0, max: 5, fridge_name: "Kitchen fridge" }, created_at: "2026-11-20T10:00:00Z", read: false }];
    wrap(<Notifications />);
    const item = await screen.findByText("Amiens · Kitchen fridge at 7.5 °C (range 0–5 °C)");
    fireEvent.click(item);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("mark_notification_read", { p_id: 7 }));
  });
});
