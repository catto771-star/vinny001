// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const row = (i: number, over: Record<string, unknown> = {}) => ({
  room_id: `room-${i}`, room_kind: "room", room_code: String(i), room_sort: i, bed_id: `bed-${i}`, bed_number: 1, bed_status: "in_use",
  stay_id: `stay-${i}`, resident_id: `res-${i}`, first_name: `Resident${i}`, last_name: "X", date_of_birth: "1980-01-01",
  absence_id: null, result: null, marked_by: null, ...over,
});

let sheet: ReturnType<typeof row>[] = [];
let canWrite = true;
const rpcResults: Record<string, unknown> = {};
const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
  if (name === "check_slots") return { data: ["12:00", "18:00", "22:00"], error: null };
  if (name === "room_check_sheet") return { data: sheet, error: null };
  if (name === "mark_resident") {
    sheet = sheet.map((r) => (r.stay_id === args?.p_stay ? { ...r, result: args?.p_result } : r)) as typeof sheet;
    return { data: rpcResults.mark_resident ?? { absence_active: false }, error: null };
  }
  if (name === "launch_room_check") return { data: { status: "launched" }, error: null };
  return { data: null, error: null };
});

const RUN = { id: "run-1", slot: "12:00", status: "pending", sheet_number: "AM-20261119-1200", checked_at: "2026-11-19T12:00:00Z", performed_by: "me", entered_by: "me", performed_reported_by_entrant: false };

function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "order", "is", "lte", "gt"]) q[m] = () => q;
  q.then = (resolve: (v: unknown) => void) => resolve({ data: result, error: null });
  return q;
}

vi.mock("@/lib/supabase", () => ({
  supabaseConfigured: true,
  supabase: {
    rpc: (name: string, args?: Record<string, unknown>) => rpc(name, args),
    from: (table: string) => query(table === "room_check_runs" ? [RUN] : table === "staff" ? [{ id: "me", full_name: "Me", display_name: null, role: "porter" }] : []),
  },
}));

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    lodges: [{ id: "lodge-a", code: "AMIENS", name: "Amiens St.", short_name: "Amiens", has_dinner: true }],
    post: { id: "p", function: "office", lodge_id: "lodge-a", started_at: "2026-11-19T07:00:00Z" },
    staff: null,
    serverOffsetMs: 0,
    canWriteLodge: () => canWrite,
  }),
}));

import { I18nProvider } from "@/i18n";
import { DailySheet } from "./DailySheet";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

beforeEach(() => {
  sheet = [row(1), row(2, { stay_id: null, resident_id: null, first_name: null }), row(3)];
  canWrite = true;
  delete rpcResults.mark_resident;
});

afterEach(() => {
  cleanup();
  rpc.mockClear();
});

async function renderSheet() {
  render(
    <I18nProvider>
      <MemoryRouter>
        <DailySheet />
      </MemoryRouter>
    </I18nProvider>,
  );
  await waitFor(() => expect(screen.getByText("Resident1 X")).toBeTruthy());
}

describe("Folha do dia", () => {
  it("cama livre aparece como 'free bed' e sem botões", async () => {
    await renderSheet();
    const freeRow = screen.getByText("free bed").closest("tr")!;
    expect(within(freeRow).queryAllByRole("button")).toHaveLength(0);
  });

  it("teclado: V marca visto o residente selecionado e pula a cama livre", async () => {
    await renderSheet();
    const table = document.querySelector(".sheet-table-wrap") as HTMLElement;
    fireEvent.keyDown(table, { key: "v" });
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("mark_resident", { p_run: "run-1", p_stay: "stay-1", p_result: "seen" }));
    fireEvent.keyDown(table, { key: "n" });
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("mark_resident", { p_run: "run-1", p_stay: "stay-3", p_result: "not_seen" }));
  });

  it("B28: 'Enter check' só habilita com todos marcados", async () => {
    await renderSheet();
    const launch = screen.getByRole("button", { name: "Enter check" }) as HTMLButtonElement;
    expect(launch.disabled).toBe(true);
    fireEvent.click(within(screen.getByText("Resident1 X").closest("tr")!).getByRole("button", { name: "Seen" }));
    fireEvent.click(within(screen.getByText("Resident3 X").closest("tr")!).getByRole("button", { name: "Not seen" }));
    await waitFor(() => expect(launch.disabled).toBe(false));
    fireEvent.click(launch);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("launch_room_check", { p_run: "run-1" }));
  });

  it("'Ausência' só habilita para quem tem ausência comunicada", async () => {
    sheet = [row(1, { absence_id: "abs-1" }), row(3)];
    await renderSheet();
    const absentButtons = screen.getAllByRole("button", { name: "Absence" }) as HTMLButtonElement[];
    expect(absentButtons.map((b) => b.disabled)).toEqual([false, true]);
    expect(screen.getByText("reported absence")).toBeTruthy();
  });

  it("B05: visto durante ausência pergunta se antecipa; 'sim' registra o retorno", async () => {
    sheet = [row(1, { absence_id: "abs-1" })];
    rpcResults.mark_resident = { absence_active: true, absence_id: "abs-1" };
    await renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Seen" }));
    await waitFor(() => expect(screen.getByText("Do you want to bring forward this resident's return?")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Yes, record the return now" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("end_absence", { p_absence: "abs-1", p_returned_at: null }));
  });

  it("sem permissão no Lodge (outro Lodge / sem posto) a folha é só leitura", async () => {
    canWrite = false;
    await renderSheet();
    for (const b of screen.getAllByRole("button", { name: "Seen" }) as HTMLButtonElement[]) expect(b.disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Enter check" })).toBeNull();
  });
});
