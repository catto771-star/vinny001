// @vitest-environment jsdom
// Bug (achado na gravação dos vídeos): o diálogo "Vi este residente" listava também quem já saiu do
// Lodge no dia (aparece na tabela do dia); escolher essa pessoa voltava "Algo deu errado".
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const row = (id: string, name: string) => ({
  resident_id: `r-${id}`, stay_id: id, first_name: name, last_name: "X", room_kind: "room", room_code: "4", bed_number: Number(id.slice(1)),
  seen_day: false, seen_night: false, day_sources: [], night_sources: [],
});
const rpc = vi.fn(async (name: string) => ({ data: name === "seen_for_day" ? [row("s1", "Present"), row("s2", "Left")] : null, error: null }));
vi.mock("@/lib/supabase", () => ({ supabaseConfigured: true, supabase: { rpc: (n: string, a: unknown) => (rpc as (...x: unknown[]) => unknown)(n, a) } }));
vi.mock("@/lib/useOccupancy", () => ({
  useOccupancy: () => ({ beds: [{ stay_id: "s1", bed_id: "b1" }], loading: false, error: null, reload: vi.fn() }),
}));
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    lodges: [{ id: "a", code: "AMIENS", name: "Amiens St.", short_name: "Amiens" }],
    post: { function: "office", lodge_id: "a" }, staff: null, serverOffsetMs: 0, canWriteLodge: () => true,
  }),
}));

import { I18nProvider } from "@/i18n";
import { Seen } from "./Seen";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(cleanup);

describe("Seen — diálogo 'Vi este residente'", () => {
  it("lista só quem está no Lodge agora (quem já saiu não pode ser marcado)", async () => {
    render(<I18nProvider><MemoryRouter><Seen /></MemoryRouter></I18nProvider>);
    await waitFor(() => expect(screen.getAllByText(/Left X/).length).toBeGreaterThan(0)); // a tabela do dia mostra os dois
    fireEvent.click(screen.getByRole("button", { name: "Record seen" }));
    const dialog = await screen.findByRole("dialog");
    const options = Array.from(within(dialog).getByRole("combobox").querySelectorAll("option")).map((o) => o.textContent);
    expect(options.some((o) => o?.includes("Present"))).toBe(true);
    expect(options.some((o) => o?.includes("Left"))).toBe(false);
  });
});
