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
const invoke = vi.fn(async (_n: string, _o: unknown) => ({ data: { staff_id: "new" }, error: null }));
vi.mock("@/lib/supabase", () => ({ supabaseConfigured: true, supabase: { from: () => query(staff), functions: { invoke: (n: string, o: unknown) => invoke(n, o) } } }));
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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("admin-users", { body: expect.objectContaining({ role: "porter", password: null }) }));
    fireEvent.click(await screen.findByRole("button", { name: "Create user" }));
    const again = await waitFor(() => document.querySelector("dialog[open]") as HTMLElement);
    fireEvent.change(again.querySelectorAll("select")[0], { target: { value: "station" } });
    expect(again.querySelector('input[type="email"]')).not.toBeNull();
    expect((again.querySelectorAll("select")[1] as HTMLSelectElement).required).toBe(true);
  });
});
