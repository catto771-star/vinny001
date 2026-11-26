// @vitest-environment jsdom
// A lista de usuários começa só com os ativos; os desativados ficam numa aba própria.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const staff = [
  { id: "1", user_id: "u1", full_name: "Paddy Active", display_name: null, role: "porter", email: "p@x", locale: "en-IE", home_lodge_id: null, active: true, must_change_password: false, version: 1, created_at: "", deactivated_at: null },
  { id: "2", user_id: "u2", full_name: "Old Porter", display_name: null, role: "porter", email: "o@x", locale: "en-IE", home_lodge_id: null, active: false, must_change_password: false, version: 1, created_at: "", deactivated_at: "2026-11-01T10:00:00Z" },
];
function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "order", "eq"]) q[m] = () => q;
  q.then = (resolve: (v: unknown) => void) => resolve({ data: result, error: null });
  return q;
}
const rpcPerson = vi.fn(async () => ({ data: { functions: { float: 3, office: 5 }, roster_upcoming: [], shifts_recent: [], notes_recent: [{ id: "n1", lodge_id: "a", kind: "note", body: "Fire alarm tested", occurred_at: "2026-11-24T10:00:00Z" }], hours_month: { planned_minutes: 720, effective_minutes: 600 }, tasks_signed_30d: 4 }, error: null }));
const invoke = vi.fn(async (_n: string, _o: unknown) => ({ data: { staff_id: "new" }, error: null }));
vi.mock("@/lib/supabase", () => ({ supabaseConfigured: true, supabase: { rpc: () => rpcPerson(), from: () => query(staff), functions: { invoke: (n: string, o: unknown) => invoke(n, o) } } }));
vi.mock("@/auth/AuthProvider", () => ({ useAuth: () => ({ lodges: [{ id: "a", code: "AMIENS", name: "Amiens St.", short_name: "Amiens" }], staff: { id: "me" } }) }));

import { I18nProvider } from "@/i18n";
import { Users } from "./Users";

afterEach(cleanup);
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

describe("Usuários", () => {
  it("mostra só os ativos; a aba Deactivated mostra os desativados", async () => {
    render(<I18nProvider><MemoryRouter><Users /></MemoryRouter></I18nProvider>);
    await waitFor(() => expect(screen.getByText("Paddy Active")).toBeTruthy());
    expect(screen.queryByText("Old Porter")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Deactivated" }));
    expect(screen.getByText("Old Porter")).toBeTruthy();
    expect(screen.queryByText("Paddy Active")).toBeNull();
  });

  it("Beta: Porter é cadastrado sem login (sem e-mail nem senha); conta da casa exige e-mail e a casa", async () => {
    render(<I18nProvider><MemoryRouter><Users /></MemoryRouter></I18nProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Create user" }));
    const dialog = document.querySelector("dialog[open]") as HTMLElement;
    fireEvent.change(dialog.querySelector("input")!, { target: { value: "Pedro Almeida" } });
    expect(dialog.querySelector('input[type="email"]')).toBeNull();
    // Revisão 13: Staff (Porter ou Float) atua nas duas casas — o cadastro não pede casa.
    expect(dialog.querySelectorAll("select")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("admin-users", { body: expect.objectContaining({ role: "porter", password: null, home_lodge_id: null }) }));
    fireEvent.click(await screen.findByRole("button", { name: "Create user" }));
    const again = await waitFor(() => document.querySelector("dialog[open]") as HTMLElement);
    fireEvent.change(again.querySelectorAll("select")[0], { target: { value: "station" } });
    expect(again.querySelector('input[type="email"]')).not.toBeNull();
    expect((again.querySelectorAll("select")[1] as HTMLSelectElement).required).toBe(true);
  });

  it("Pessoas (revisão 25/11): abrir a pessoa mostra função no Roster, horas do mês e anotações do Handover", async () => {
    render(<I18nProvider><MemoryRouter><Users /></MemoryRouter></I18nProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Paddy Active" }));
    expect(await screen.findByText("Fire alarm tested")).toBeTruthy();
    expect(screen.getByText(/Office ×5 · Float ×3/)).toBeTruthy();
    expect(screen.getByText("10 h 00 / 12 h 00")).toBeTruthy();
  });
});
