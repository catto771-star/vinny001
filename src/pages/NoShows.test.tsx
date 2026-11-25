// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let review: Record<string, unknown> = {};
let management = false;
const rpc = vi.fn(async (name: string, _args?: unknown) => {
  if (name === "no_show_review") return { data: review, error: null };
  if (name === "param_value") return { data: 3, error: null };
  if (name === "confirm_no_shows") return { data: [{ stay_id: "s1", month_count: 3 }], error: null };
  return { data: null, error: null };
});
vi.mock("@/lib/supabase", () => ({ supabaseConfigured: true, supabase: { rpc: (n: string, a: unknown) => rpc(n, a) } }));
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    lodges: [{ id: "a", code: "AMIENS", name: "Amiens St.", short_name: "Amiens" }],
    post: { function: "office", lodge_id: "a" },
    staff: null,
    isManagement: management,
    serverOffsetMs: 0,
    canWriteLodge: () => true,
  }),
}));

import { I18nProvider } from "@/i18n";
import { NoShows } from "./NoShows";

const candidate = { stay_id: "s1", resident_id: "r1", first_name: "Ana", last_name: "X", room_kind: "room", room_code: "4", bed_number: 2, month_count: 2 };

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

afterEach(() => {
  cleanup();
  rpc.mockClear();
  management = false;
});

async function renderPage() {
  render(
    <I18nProvider>
      <MemoryRouter>
        <NoShows />
      </MemoryRouter>
    </I18nProvider>,
  );
  await waitFor(() => expect(screen.getByText("Possible No Shows")).toBeTruthy());
}

describe("No Shows", () => {
  it("B27: com check por lançar, avisa lista incompleta e bloqueia confirmar", async () => {
    review = { operational_day: "2026-11-19", day_finished: true, complete: false, pending_slots: ["22:00"], candidates: [candidate], confirmed: [] };
    await renderPage();
    expect(screen.getByText(/Incomplete list: checks still to enter \(22:00\)/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Confirm selected" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("lista completa: confirma os selecionados e avisa quando chega a 3 no mês", async () => {
    review = { operational_day: "2026-11-19", day_finished: true, complete: true, pending_slots: [], candidates: [candidate], confirmed: [] };
    await renderPage();
    expect(screen.getByText("2/3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm selected" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("confirm_no_shows", { p_lodge: "a", p_day: expect.any(String), p_stays: ["s1"] }));
    await waitFor(() => expect(screen.getByText(/Ana X reached 3 No Shows this month/)).toBeTruthy());
  });

  it("Revisão 25/11: primeiro o Seen do dia (link), depois os candidatos — quem não foi visto", async () => {
    review = { operational_day: "2026-11-19", day_finished: true, complete: true, pending_slots: [], candidates: [candidate], confirmed: [] };
    await renderPage();
    expect(screen.getByText("Seen of the day")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Seen" }).getAttribute("href")).toBe("/seen");
    expect(screen.getByText("Not seen: 1 No Show candidate(s)")).toBeTruthy();
  });

  it("desmarcar o residente tira da confirmação", async () => {
    review = { operational_day: "2026-11-19", day_finished: true, complete: true, pending_slots: [], candidates: [candidate], confirmed: [] };
    await renderPage();
    fireEvent.click(screen.getByLabelText("Ana X"));
    expect((screen.getByRole("button", { name: "Confirm selected" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("só a gestão vê 'Undo' em No Show confirmado", async () => {
    review = { operational_day: "2026-11-19", day_finished: true, complete: true, pending_slots: [], candidates: [], confirmed: [{ id: "n1", resident_id: "r1", first_name: "Ana", last_name: "X", status: "confirmed", undo_reason: null, month_count: 1 }] };
    render(<I18nProvider><MemoryRouter><NoShows /></MemoryRouter></I18nProvider>);
    await waitFor(() => expect(screen.getByText("Confirmed")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    cleanup();
    management = true;
    render(<I18nProvider><MemoryRouter><NoShows /></MemoryRouter></I18nProvider>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy());
  });
});
