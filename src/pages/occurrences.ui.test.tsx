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
import { TicketDialog, type Ticket } from "./Maintenance";
import { MaintenanceDialog } from "@/components/MaintenanceDialog";

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
    id, lodge_id: "a", kind, body: kind === "round" ? "Room Check Done" : "nota", occurred_at: at, operational_day: "2026-11-20",
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
    const box = await screen.findByPlaceholderText(/Write in the Handover/);
    fireEvent.change(box, { target: { value: "Conversei com @Se", selectionStart: 17 } });
    (box as HTMLTextAreaElement).setSelectionRange(17, 17);
    fireEvent.change(box, { target: { value: "Conversei com @Se" } });
    const option = await screen.findByText("@Seán Byrne");
    fireEvent.click(option);
    fireEvent.click(screen.getByRole("button", { name: "Add to Handover" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("add_handover_note", expect.objectContaining({ p_lodge: "a", p_mentions: [{ resident_id: "res1" }], p_late_reason: null })),
    );
  });

  it("Beta: conta da casa — 'Filled in by' começa com quem está no Roster e vai junto da anotação; dá para trocar", async () => {
    station = true;
    post = null;
    tables.staff = [
      { id: "me", full_name: "Amiens Reception", display_name: null, role: "station" },
      { id: "pedro", full_name: "Pedro Almeida", display_name: null, role: "porter" },
      { id: "ana", full_name: "Ana Lima", display_name: null, role: "porter" },
    ];
    tables.rota_shifts = [{ id: "r1", staff_id: "pedro", function: "office", lodge_id: "a", started_at: "2026-11-20T07:00:00Z", ends_at: "2099-01-01T00:00:00Z", staff: { full_name: "Pedro Almeida", display_name: null } }];
    wrap(<Handover />);
    const box = await screen.findByPlaceholderText(/Write in the Handover/);
    fireEvent.change(box, { target: { value: "Bins out" } });
    const select = (await screen.findByLabelText("Filled in by")) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe("pedro"));
    expect(within(select).queryByRole("option", { name: /Amiens Reception/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add to Handover" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("add_handover_note", expect.objectContaining({ p_filled_by: "pedro" })));
    fireEvent.change(select, { target: { value: "ana" } });
    fireEvent.change(box, { target: { value: "Covered the desk" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to Handover" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("add_handover_note", expect.objectContaining({ p_body: "Covered the desk", p_filled_by: "ana" })));
  });

  it("B38: fato de turno encerrado → Office precisa escolher motivo; sem motivo o botão fica bloqueado", async () => {
    wrap(<Handover />);
    const box = await screen.findByPlaceholderText(/Write in the Handover/);
    fireEvent.change(box, { target: { value: "Aconteceu ontem" } });
    fireEvent.click(screen.getByLabelText("Now"));
    const input = document.querySelector('.composer input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-01-10T10:00" } });
    expect(await screen.findByText("This fact belongs to a shift that has ended — choose a reason.")).toBeTruthy();
    const post = screen.getByRole("button", { name: "Add to Handover" }) as HTMLButtonElement;
    expect(post.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Reason for entering after the shift"), { target: { value: "forgot" } });
    expect(post.disabled).toBe(false);
  });

  it("B39: para a gestão não aparece pedido de motivo", async () => {
    management = true;
    wrap(<Handover />);
    const box = await screen.findByPlaceholderText(/Write in the Handover/);
    fireEvent.change(box, { target: { value: "Nota antiga" } });
    fireEvent.click(screen.getByLabelText("Now"));
    fireEvent.change(document.querySelector('.composer input[type="datetime-local"]') as HTMLInputElement, { target: { value: "2026-01-10T10:00" } });
    expect(screen.queryByText("This fact belongs to a shift that has ended — choose a reason.")).toBeNull();
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
