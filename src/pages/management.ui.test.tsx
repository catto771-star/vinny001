// @vitest-environment jsdom
// Telas da Fase 3: Compras, Distribuição, Rota, Horas, Férias e Relatório mensal.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let management = true;
const rpcResult: Record<string, unknown> = {};
const rpc = vi.fn(async (name: string, _args?: unknown) => ({ data: rpcResult[name] ?? null, error: null }));
function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "order", "limit", "in", "is", "lt", "gt"]) q[m] = () => q;
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
    post: null,
    staff: { id: "me", full_name: "Me", display_name: null, role: management ? "manager" : "porter", home_lodge_id: "a" },
    isManagement: management,
    serverOffsetMs: 0,
    canWriteLodge: () => true,
  }),
}));

import { I18nProvider } from "@/i18n";
import { Purchases } from "./Purchases";
import { Distribution } from "./Distribution";
import { Rota } from "./Rota";
import { Hours } from "./Hours";
import { Vacations } from "./Vacations";
import { Reports } from "./Reports";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
beforeEach(() => {
  management = true;
  for (const k of Object.keys(rpcResult)) delete rpcResult[k];
  for (const k of Object.keys(tables)) delete tables[k];
});
afterEach(() => {
  cleanup();
  rpc.mockClear();
});
const wrap = (ui: React.ReactNode) => render(<I18nProvider><MemoryRouter>{ui}</MemoryRouter></I18nProvider>);

describe("Compras", () => {
  it("total da linha arredonda ao centavo (meio centavo para cima) e produto novo é criado antes da compra", async () => {
    rpcResult.upsert_product = "p-new";
    wrap(<Purchases />);
    fireEvent.click(await screen.findByRole("button", { name: "Record purchase" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Supplier"), { target: { value: "Musgrave" } });
    fireEvent.change(within(dialog).getByPlaceholderText("New product name"), { target: { value: "Milk 2L" } });
    fireEvent.change(within(dialog).getByLabelText("Qty"), { target: { value: "3" } });
    fireEvent.change(within(dialog).getByLabelText("Unit price (€)"), { target: { value: "1,335" } });
    expect(within(dialog).getAllByText(/4\.01/).length).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("create_purchase", expect.objectContaining({
      p_supplier: "Musgrave", p_lines: [{ product_id: "p-new", quantity: 3, unit_price: 1.335 }],
    })));
    expect(rpc.mock.calls.findIndex((c) => c[0] === "upsert_product")).toBeLessThan(rpc.mock.calls.findIndex((c) => c[0] === "create_purchase"));
  });
});

describe("Distribuição", () => {
  it("aloca a quantidade restante para o Lodge escolhido; transferência exige Lodges diferentes", async () => {
    tables.products = [{ id: "p1", name: "Milk 2L", unit: "un" }];
    tables.purchase_lines = [{ id: "l1", purchase_id: "pu", product_id: "p1", quantity: "10", purchases: { supplier: "Musgrave", purchased_on: "2026-11-19" } }];
    tables.product_movements = [{ id: "m1", kind: "allocation", product_id: "p1", purchase_line_id: "l1", from_lodge_id: null, to_lodge_id: "a", quantity: "4", note: null, created_by: "me", created_at: "2026-11-19T10:00:00Z" }];
    wrap(<Distribution />);
    expect(await screen.findByText("6 to allocate")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "c" } });
    fireEvent.change(screen.getByLabelText("Qty"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Allocate" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("allocate_purchase_line", { p_line: "l1", p_lodge: "c", p_quantity: 6 }));

    fireEvent.click(screen.getByRole("tab", { name: "Transfer between Lodges" }));
    const transfer = screen.getByRole("button", { name: "Transfer" }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("Product"), { target: { value: "p1" } });
    fireEvent.change(screen.getByLabelText("Qty"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "a" } });
    expect(transfer.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "c" } });
    expect(transfer.disabled).toBe(false);
  });
});

describe("Rota", () => {
  it("equipe vê só a escala, sem publicar, adicionar nem buracos de cobertura", async () => {
    management = false;
    wrap(<Rota />);
    expect(await screen.findByText("You see the published Roster.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Publish week/ })).toBeNull();
    expect(screen.queryAllByRole("button", { name: /Add shift/ })).toHaveLength(0);
    expect(rpc).not.toHaveBeenCalledWith("coverage_gaps", expect.anything());
  });

  it("turno Night termina no dia seguinte; buracos aparecem como 'not covered'", async () => {
    rpcResult.coverage_gaps = [{ lodge_id: "a", lodge_code: "AMIENS", kind: "night", starts_at: new Date().toISOString(), ends_at: new Date().toISOString() }];
    tables.staff = [{ id: "s1", full_name: "Ana Porter", display_name: null, role: "porter" }];
    wrap(<Rota />);
    expect(await screen.findByText(/not covered/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /Add shift/ })[0]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Night 19–07/ }));
    fireEvent.change(within(dialog).getByLabelText("Person"), { target: { value: "s1" } });
    fireEvent.change(dialog.querySelector('input[type="date"]')!, { target: { value: "2026-11-20" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("save_rota_shift", {
      p_id: null, p_staff: "s1", p_lodge: "a", p_function: "office",
      p_start: "2026-11-20T19:00:00.000Z", p_end: "2026-11-21T07:00:00.000Z",
    }));
  });

  it("Beta: saída antecipada às 12h coberta por outra pessoa; horas da semana previstas × trabalhadas", async () => {
    tables.staff = [{ id: "s1", full_name: "Ana Porter", display_name: null, role: "porter" }, { id: "s2", full_name: "Bia Porter", display_name: null, role: "porter" }];
    const start = new Date();
    start.setUTCHours(7, 0, 0, 0);
    const end = new Date(start.getTime() + 12 * 3_600_000);
    tables.rota_shifts = [{ id: "sh1", staff_id: "s1", lodge_id: "a", function: "office", starts_at: start.toISOString(), ends_at: end.toISOString(), status: "published", planned_starts_at: start.toISOString(), planned_ends_at: end.toISOString() }];
    rpcResult.staff_hours = [{ staff_id: "s1", full_name: "Ana Porter", role: "porter", planned_minutes: 720, effective_minutes: 300 }];
    wrap(<Rota />);
    expect(await screen.findByText("Hours this week")).toBeTruthy();
    expect(screen.getByText("−7 h 00")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: /Ana Porter/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Left at"), { target: { value: "12:00" } });
    fireEvent.change(within(dialog).getByLabelText("Covered by"), { target: { value: "s2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Split shift" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("split_rota_shift", expect.objectContaining({ p_shift: "sh1", p_cover: "s2" })));
    const call = rpc.mock.calls.find((c) => c[0] === "split_rota_shift")!;
    expect(new Date((call[1] as { p_at: string }).p_at).getTime()).toBe(start.getTime() + 5 * 3_600_000);
    delete tables.rota_shifts;
  });

  it("Float não tem Lodge e só aceita cargos permitidos", async () => {
    tables.staff = [{ id: "s1", full_name: "Ana Porter", display_name: null, role: "porter" }, { id: "s2", full_name: "Cleo Cleaner", display_name: null, role: "cleaner" }];
    wrap(<Rota />);
    fireEvent.click((await screen.findAllByRole("button", { name: /Add shift/ }))[0]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Float" }));
    expect(within(dialog).queryByLabelText("Lodge")).toBeNull();
    const options = Array.from(within(dialog).getByLabelText("Person").querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toContain("Ana Porter");
    expect(options).not.toContain("Cleo Cleaner");
  });
});

describe("Horas", () => {
  it("mostra planejado × efetivo e o ajuste do Assumir Posto exige motivo", async () => {
    rpcResult.staff_hours = [{ staff_id: "s1", full_name: "Ana Porter", role: "porter", planned_minutes: 720, effective_minutes: 690 }];
    rpcResult.staff_work_log = [{ source: "post", id: "post1", lodge_id: "a", function: "office", starts_at: "2026-11-10T07:10:00Z", ends_at: "2026-11-10T18:40:00Z", note: null }];
    wrap(<Hours />);
    expect(await screen.findByText("−0 h 30")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Work log" }));
    fireEvent.click(await screen.findByRole("button", { name: "Adjust" }));
    const dialog = await screen.findByRole("dialog");
    const save = within(dialog).getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "Forgot to take post" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("adjust_work_interval", expect.objectContaining({ p_post: "post1", p_reason: "Forgot to take post" })));
  });
});

describe("Férias", () => {
  it("registra e avisa quando há conflito com a Rota", async () => {
    tables.staff = [{ id: "s1", full_name: "Ana Porter", display_name: null, role: "porter" }];
    rpcResult.register_vacation = { id: "v1", conflicts: 2 };
    wrap(<Vacations />);
    fireEvent.click(await screen.findByRole("button", { name: "Register holidays" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Person"), { target: { value: "s1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Conflict: 2 Roster shift(s) in this period.")).toBeTruthy();
  });
});

describe("Relatório mensal", () => {
  const report = {
    order: ["occupancy", "dinner", "laundry", "hours"],
    occupancy: { beds_total: 44, occupied: 40, admissions: 3 },
    dinner: null,
    laundry: { uses: 12 },
    hours: { planned_minutes: 1440, effective_minutes: 1500 },
  };
  it("blocos na ordem, sem Dinner quando o Lodge não tem; número abre os registros", async () => {
    rpcResult.report_monthly = report;
    rpcResult.report_details = [{ ref_id: "x", label: "Ana X — bed 4/1", at: "2026-11-03T15:00:00Z", extra: null }];
    wrap(<Reports />);
    const headings = (await screen.findAllByRole("heading", { level: 2 })).map((h) => h.textContent);
    expect(headings).toEqual(["Bed occupancy", "Laundry", "Hours"]);
    expect(screen.getByText("24 h 00")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("report_details", expect.objectContaining({ p_metric: "occupancy.admissions" })));
    expect(await screen.findByText("Ana X — bed 4/1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "44" })).toBeNull();
  });
});
