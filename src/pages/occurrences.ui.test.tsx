// @vitest-environment jsdom
// Telas da Fase 1 (2ª parte): Handover, tarefas e manutenção.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let management = false;
let station = false;
let post: Record<string, unknown> | null = { id: "p", function: "office", lodge_id: "a", started_at: "2026-11-20T07:00:00Z" };
const rpcResult: Record<string, unknown> = {};
const rpc = vi.fn(async (name: string, _args?: unknown) => ({ data: rpcResult[name] ?? null, error: null }));

function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "or", "in", "order", "limit", "is", "lte", "gt"]) q[m] = () => q;
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
    lodges: [{ id: "a", code: "AMIENS", name: "Amiens St.", short_name: "Amiens" }],
    post,
    staff: { id: "me", full_name: "Me", display_name: null, role: management ? "manager" : station ? "station" : "porter" },
    isManagement: management,
    isStation: station,
    serverOffsetMs: 0,
    canWriteLodge: () => true,
  }),
}));

import { I18nProvider } from "@/i18n";
import { groupRounds, Handover, type Entry } from "./Handover";
import { Tasks } from "./Tasks";
import { TicketDialog, type Ticket } from "./Maintenance";
import { MaintenanceDialog } from "@/components/MaintenanceDialog";
import { Maintenance } from "./Maintenance";
import { Warnings } from "./Warnings";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

beforeEach(() => {
  management = false;
  station = false;
  post = { id: "p", function: "office", lodge_id: "a", started_at: "2026-11-20T07:00:00Z" };
  for (const k of Object.keys(rpcResult)) delete rpcResult[k];
  for (const k of Object.keys(tables)) delete tables[k];
  tables.bed_occupancy = [
    { lodge_id: "a", lodge_code: "AMIENS", room_id: "r4", room_kind: "room", room_code: "4", room_sort: 4, bed_id: "b1", bed_number: 2, bed_status: "in_use", stay_id: "s1", stay_status: "active", admitted_at: null, resident_id: "res1", first_name: "Seán", last_name: "Byrne", date_of_birth: null, pass_id: null },
  ];
  tables.staff = [{ id: "me", full_name: "Me", display_name: null, role: "porter" }];
  rpcResult.param_value = ["other_occurrence", "system_failure", "forgot", "info_received_later"];
  rpcResult.round_slots = ["08:00", "10:00"];
});

afterEach(() => {
  cleanup();
  rpc.mockClear();
});

const wrap = (ui: React.ReactNode) => render(<I18nProvider><MemoryRouter>{ui}</MemoryRouter></I18nProvider>);

describe("Handover", () => {
  const entry = (id: string, kind: Entry["kind"], at: string): Entry => ({
    id, lodge_id: "a", kind, body: kind === "round" ? "Welfare Check Done" : "nota", occurred_at: at, operational_day: "2026-11-20",
    round_slot: kind === "round" ? at.slice(11, 16) : null, author_id: "me", filled_by: null, late_reason: null, status: "active", void_reason: null, version: 1,
  });

  it("agrupa rondas seguidas numa linha só (Handover não fica poluído)", () => {
    const g = groupRounds([entry("1", "round", "2026-11-20T12:00:00Z"), entry("2", "round", "2026-11-20T10:00:00Z"), entry("3", "note", "2026-11-20T09:00:00Z"), entry("4", "round", "2026-11-20T08:00:00Z")]);
    expect(g.map((x) => (x.kind === "round-group" ? `g${x.entries.length}` : x.kind))).toEqual(["g2", "note", "g1"]);
  });

  it("bug: anotação de lavanderia (tipo novo da Fase 2) aparece no Handover sem quebrar a tela", async () => {
    tables.handover_entries = [
      { id: "l1", lodge_id: "a", kind: "laundry", body: "Laundry — A · Wash", occurred_at: "2026-11-20T09:00:00Z", operational_day: "2026-11-20", round_slot: null, author_id: "me", late_reason: null, status: "active", void_reason: null, version: 1 },
    ];
    wrap(<Handover />);
    expect(await screen.findByText("Laundry — A · Wash")).toBeTruthy();
    expect(screen.getAllByText("Laundry").length).toBeGreaterThan(0);
  });

  it("@ marca residente: escolhe na lista e envia a menção junto da anotação", async () => {
    wrap(<Handover />);
    const box = await screen.findByPlaceholderText(/Write an entry/);
    fireEvent.change(box, { target: { value: "Conversei com @Se", selectionStart: 17 } });
    (box as HTMLTextAreaElement).setSelectionRange(17, 17);
    fireEvent.change(box, { target: { value: "Conversei com @Se" } });
    const option = await screen.findByText("@Seán Byrne");
    fireEvent.click(option);
    fireEvent.click(screen.getByRole("button", { name: "Save Entry" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("add_handover_note", expect.objectContaining({ p_lodge: "a", p_mentions: [{ resident_id: "res1" }], p_late_reason: null })),
    );
  });

  it("Beta: conta da casa — o Author começa com quem está no Roster e vai junto da anotação; dá para trocar", async () => {
    station = true;
    post = null;
    tables.staff = [
      { id: "me", full_name: "Amiens Reception", display_name: null, role: "station" },
      { id: "pedro", full_name: "Pedro Almeida", display_name: null, role: "porter" },
      { id: "ana", full_name: "Ana Lima", display_name: null, role: "porter" },
    ];
    tables.rota_shifts = [{ id: "r1", staff_id: "pedro", function: "office", lodge_id: "a", started_at: "2026-11-20T07:00:00Z", ends_at: "2099-01-01T00:00:00Z", staff: { full_name: "Pedro Almeida", display_name: null } }];
    wrap(<Handover />);
    const box = await screen.findByPlaceholderText(/Write an entry/);
    fireEvent.change(box, { target: { value: "Bins out" } });
    const authorBtn = await screen.findByRole("button", { name: /Change author/ });
    await waitFor(() => expect(authorBtn.textContent).toContain("Pedro Almeida"));
    fireEvent.click(authorBtn);
    expect(within(screen.getByRole("listbox")).queryByRole("option", { name: /Amiens Reception/ })).toBeNull();
    fireEvent.keyDown(screen.getByLabelText("Search colleague"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Save Entry" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("add_handover_note", expect.objectContaining({ p_filled_by: "pedro" })));
    expect(rpc.mock.calls.find((c) => c[0] === "add_handover_note")![1]).not.toHaveProperty("p_co_authors");
    fireEvent.click(screen.getByRole("button", { name: /Change author/ }));
    fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: /Ana Lima/ }));
    // Revisão 8: colega junto do autor.
    fireEvent.click(screen.getByRole("button", { name: /Add colleague/ }));
    fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: /Pedro Almeida/ }));
    fireEvent.change(box, { target: { value: "Covered the desk" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Entry" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("add_handover_note", expect.objectContaining({ p_body: "Covered the desk", p_filled_by: "ana", p_co_authors: ["pedro"] })));
  });

  it("Revisão 25/11: sem turno aberto, abre com quem está no Roster; com turno aberto, encerra passando o serviço", async () => {
    station = true;
    post = null;
    tables.staff = [
      { id: "pedro", full_name: "Pedro Almeida", display_name: null, role: "porter" },
      { id: "ana", full_name: "Ana Lima", display_name: null, role: "porter" },
    ];
    tables.rota_shifts = [{ id: "r1", staff_id: "pedro", function: "office", lodge_id: "a", started_at: "2026-11-20T07:00:00Z", ends_at: "2099-01-01T00:00:00Z", staff: { full_name: "Pedro Almeida", display_name: null } }];
    wrap(<Handover />);
    fireEvent.click(await screen.findByRole("button", { name: "Open shift" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("open_handover_shift", expect.objectContaining({ p_lodge: "a", p_staff: "pedro", p_function: "office", p_at: expect.any(String) })));
    cleanup();
    tables.handover_shifts = [{ id: "sh1", staff_id: "pedro", opened_at: "2026-11-25T07:02:00Z" }];
    wrap(<Handover />);
    expect(await screen.findByText("Shift of Pedro Almeida")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: /Change author/ }).textContent).toContain("Pedro Almeida"));
    fireEvent.click(screen.getByRole("button", { name: "Hand Over Shift" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Hand over to"), { target: { value: "ana" } });
    // revisão 5: o horário da passagem é informado (aqui, 19:10 de 24/11 em Dublin = UTC no inverno)
    fireEvent.change(within(dialog).getByLabelText("Handover time"), { target: { value: "2026-11-24T19:10" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Hand over" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("close_handover_shift", { p_shift: "sh1", p_handed_to: "ana", p_note: "", p_at: "2026-11-24T19:10:00.000Z" }));
  });

  it("Revisão 4: Float — início com quem assume o Float (do Roster) e fim passando para quem assume", async () => {
    station = true;
    post = null;
    tables.staff = [
      { id: "ana", full_name: "Ana Lima", display_name: null, role: "porter" },
      { id: "rui", full_name: "Rui Costa", display_name: null, role: "porter" },
    ];
    tables.rota_shifts = [{ id: "r2", staff_id: "ana", function: "float", lodge_id: null, started_at: "2026-11-20T12:00:00Z", ends_at: "2099-01-01T00:00:00Z", staff: { full_name: "Ana Lima", display_name: null } }];
    wrap(<Handover />);
    fireEvent.click(await screen.findByRole("button", { name: "Start Float shift" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("open_handover_shift", expect.objectContaining({ p_lodge: "a", p_staff: "ana", p_function: "float" })));
  });

  it("Revisão 3: tags no lugar dos atalhos — marcar a tag vai junto da anotação; tag escondida pelo Admin não aparece", async () => {
    tables.handover_tags = [
      { id: "g1", code: "incident", label: "Incident / Safety", sort_order: 1, visible: true, notify_default: true },
      { id: "g2", code: "delivery", label: "Delivery", sort_order: 7, visible: false, notify_default: false },
    ];
    wrap(<Handover />);
    const box = await screen.findByPlaceholderText(/Write an entry/);
    fireEvent.change(box, { target: { value: "Fight in room 4" } });
    const group = await screen.findByRole("group", { name: "Tags" });
    expect(within(group).queryByRole("button", { name: "Delivery" })).toBeNull();
    fireEvent.click(within(group).getByRole("button", { name: "Incident / Safety" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Entry" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("add_handover_note", expect.objectContaining({ p_body: "Fight in room 4", p_tags: ["g1"] })));
  });

  it("Revisão 8: filtro na URL procura em vários dias pelo banco e mostra a contagem; sem filtro volta ao dia", async () => {
    rpcResult.search_handover = [
      { id: "e1", lodge_id: "a", kind: "note", body: "Fire alarm test", occurred_at: "2026-11-20T10:00:00Z", operational_day: "2026-11-20", round_slot: null, author_id: "me", filled_by: null, late_reason: null, status: "active", void_reason: null, version: 1 },
    ];
    render(<I18nProvider><MemoryRouter initialEntries={["/handover?q=alarm&from=2026-11-01&to=2026-11-25"]}><Handover /></MemoryRouter></I18nProvider>);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("search_handover", expect.objectContaining({ p_lodge: "a", p_q: "alarm", p_from: "2026-11-01", p_to: "2026-11-25" })));
    expect(await screen.findByText("Fire alarm test")).toBeTruthy();
    expect(screen.getByText("1 result(s)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    await waitFor(() => expect(screen.queryByText("1 result(s)")).toBeNull());
  });

  it("B38: fato de turno encerrado → Office precisa escolher motivo; sem motivo o botão fica bloqueado", async () => {
    wrap(<Handover />);
    const box = await screen.findByPlaceholderText(/Write an entry/);
    fireEvent.change(box, { target: { value: "Aconteceu ontem" } });
    const input = document.querySelector('.composer input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-01-10T10:00" } });
    expect(await screen.findByText("Occurred in a finished shift. Select a reason.")).toBeTruthy();
    const post = screen.getByRole("button", { name: "Save Entry" }) as HTMLButtonElement;
    expect(post.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Reason for late entry"), { target: { value: "forgot" } });
    expect(post.disabled).toBe(false);
  });

  it("R19: o check 'Now' vem sempre desmarcado (hora editável); marcar volta a usar a hora atual", async () => {
    wrap(<Handover />);
    await screen.findByPlaceholderText(/Write an entry/);
    const now = screen.getByLabelText("Now") as HTMLInputElement;
    expect(now.checked).toBe(false);
    expect(document.querySelector('.composer input[type="datetime-local"]')).toBeTruthy();
    fireEvent.click(now);
    expect(document.querySelector('.composer input[type="datetime-local"]')).toBeNull();
  });

  it("B39: para a gestão não aparece pedido de motivo", async () => {
    management = true;
    wrap(<Handover />);
    const box = await screen.findByPlaceholderText(/Write an entry/);
    fireEvent.change(box, { target: { value: "Nota antiga" } });
    fireEvent.change(document.querySelector('.composer input[type="datetime-local"]') as HTMLInputElement, { target: { value: "2026-01-10T10:00" } });
    expect(screen.queryByText("Occurred in a finished shift. Select a reason.")).toBeNull();
  });
});

describe("Manutenção", () => {
  it("clique duplo envia o mesmo pedido (o servidor não duplica)", async () => {
    wrap(<MaintenanceDialog lodgeId="a" onClose={() => {}} onDone={() => {}} />);
    fireEvent.change(screen.getByLabelText("Where"), { target: { value: "Room 4" } });
    fireEvent.change(screen.getByLabelText("What happened"), { target: { value: "Broken window" } });
    const save = screen.getByRole("button", { name: "Save" });
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(rpc.mock.calls.filter((c) => c[0] === "create_maintenance").length).toBeGreaterThanOrEqual(1));
    const keys = new Set(rpc.mock.calls.filter((c) => c[0] === "create_maintenance").map((c) => (c[1] as { p_request_key: string }).p_request_key));
    expect(keys.size).toBe(1);
  });

  const ticket: Ticket = {
    id: "k1", lodge_id: "a", location: "Room 4", description: "Broken window", priority: "normal", status: "open",
    deadline_at: "2026-11-27T10:00:00Z", created_at: "2026-11-20T10:00:00Z", created_by: "me", resolved_at: null, overdue: false,
  };

  it("Office do próprio Lodge só vê 'Mark resolved' (sem mudar prazo nem status)", async () => {
    wrap(<TicketDialog ticket={ticket} onClose={() => {}} onDone={() => {}} />);
    expect(screen.getByRole("button", { name: "Mark resolved" })).toBeTruthy();
    expect(screen.queryByLabelText("New deadline")).toBeNull();
  });

  it("Float sozinho não resolve", async () => {
    post = { id: "p", function: "float", lodge_id: null, started_at: "2026-11-20T07:00:00Z" };
    wrap(<TicketDialog ticket={ticket} onClose={() => {}} onDone={() => {}} />);
    expect(screen.queryByRole("button", { name: "Mark resolved" })).toBeNull();
  });

  it("Manager muda status e prazo", async () => {
    management = true;
    wrap(<TicketDialog ticket={ticket} onClose={() => {}} onDone={() => {}} />);
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "in_progress" } });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("maintenance_set_status", expect.objectContaining({ p_ticket: "k1", p_status: "in_progress" })));
  });
});

describe("Daily Tasks (de volta na revisão 25/11)", () => {
  it("assinar chama sign_task com o turno e o dia exibidos", async () => {
    rpcResult.shift_tasks = [{ kind: "template", task_id: "t1", title: { "en-IE": "Fridge temperature" }, suggested_time: "10:00", staff_id: null, due_at: null, signatures: [] }];
    rpcResult.pending_tasks = [];
    wrap(<Tasks />);
    const row = (await screen.findByText("Fridge temperature")).closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Sign" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("sign_task", expect.objectContaining({ p_kind: "template", p_task: "t1", p_lodge: "a" })));
  });

  it("B50: mostra quem assinou, a função e a hora", async () => {
    rpcResult.shift_tasks = [{
      kind: "template", task_id: "t1", title: { "en-IE": "Fridge temperature" }, suggested_time: null, staff_id: null, due_at: null,
      signatures: [{ staff_id: "me", duty_function: "office", signed_at: "2026-11-20T10:05:00Z" }, { staff_id: "x", duty_function: "float", signed_at: "2026-11-20T10:07:00Z" }],
    }];
    rpcResult.pending_tasks = [];
    wrap(<Tasks />);
    expect(await screen.findByText("Me · Office · 10:05")).toBeTruthy();
    expect(screen.getByText(/Float · 10:07/)).toBeTruthy();
  });

  it("conta da casa assina em nome de quem está no turno aberto do Handover", async () => {
    station = true;
    post = null;
    tables.staff = [{ id: "pedro", full_name: "Pedro Almeida", display_name: null, role: "porter" }];
    tables.handover_shifts = [{ staff_id: "pedro" }];
    rpcResult.shift_tasks = [{ kind: "extra", task_id: "x1", title: { "en-IE": "Call the plumber" }, suggested_time: null, staff_id: null, due_at: null, signatures: [] }];
    rpcResult.pending_tasks = [];
    wrap(<Tasks />);
    await waitFor(() => expect((screen.getByLabelText("Signing as") as HTMLSelectElement).value).toBe("pedro"));
    const row = (await screen.findByText("Call the plumber")).closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Sign" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("sign_task", expect.objectContaining({ p_task: "x1", p_signed_by: "pedro" })));
  });

  it("Admin cria tarefa recorrente para o turno nos dias escolhidos", async () => {
    management = true;
    rpcResult.shift_tasks = [];
    rpcResult.pending_tasks = [];
    wrap(<Tasks />);
    fireEvent.click(await screen.findByRole("button", { name: "Recurring task" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Task"), { target: { value: "Check fire exits" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Mon" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("create_task_template", expect.objectContaining({ p_lodge: "a", p_shift: "day", p_weekdays: [1], p_title: { "en-IE": "Check fire exits" } })));
  });
});

describe("Revisão 8: filtros em Maintenance e Warnings", () => {
  const ticket = (id: string, priority: string, location: string, overdue = false) => ({
    id, lodge_id: "a", priority, status: "open", location, description: `Fix ${location}`, deadline_at: "2026-11-30T10:00:00Z",
    created_at: "2026-11-10T10:00:00Z", created_by: "me", resolved_at: null, overdue,
  });
  it("Maintenance: prioridade e busca de texto reduzem a lista e mostram a contagem", async () => {
    rpcResult.maintenance_list = [ticket("t1", "urgent", "Room 4 sink"), ticket("t2", "low", "Garden light"), ticket("t3", "urgent", "Boiler", true)];
    render(<I18nProvider><MemoryRouter initialEntries={["/maintenance?priority=urgent&q=boiler"]}><Maintenance /></MemoryRouter></I18nProvider>);
    expect(await screen.findByText("Boiler")).toBeTruthy();
    expect(screen.queryByText("Room 4 sink")).toBeNull();
    expect(screen.queryByText("Garden light")).toBeNull();
    expect(screen.getByText("1 result(s)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(await screen.findByText("Garden light")).toBeTruthy();
  });
  it("Warnings: filtro por tipo e por situação (ativo/inativo)", async () => {
    const w = (id: string, type: string, active: boolean, name: string) => ({
      id, resident_id: `r-${id}`, type, note: null, issued_by: "me", issued_at: "2026-11-12T10:00:00Z", active, deactivation_reason: null,
      residents: { first_name: name, last_name: "Test" },
    });
    tables.warnings = [w("1", "warning", true, "Alice"), w("2", "final_warning", true, "Bruno"), w("3", "final_warning", false, "Carla")];
    render(<I18nProvider><MemoryRouter initialEntries={["/warnings?type=final_warning&status=active"]}><Warnings /></MemoryRouter></I18nProvider>);
    expect(await screen.findByText("Bruno Test")).toBeTruthy();
    expect(screen.queryByText("Alice Test")).toBeNull();
    expect(screen.queryByText("Carla Test")).toBeNull();
    expect(screen.getByText("1 result(s)")).toBeTruthy();
  });
});
