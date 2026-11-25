// @vitest-environment jsdom
// Revisão 8: módulos do menu retraídos, com a soma das pendências no cabeçalho e o detalhe ao expandir.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let role = "manager";
vi.mock("@/lib/supabase", () => ({
  supabaseConfigured: true,
  supabase: {
    rpc: async (name: string) => ({
      data: name === "pending_counts" ? { tasks: 0, maintenance: 13, absences: 0, checks: 0, rounds: 10, no_shows: 0 } : name === "unread_notifications_count" ? 29 : null,
      error: null,
    }),
    from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [] }) }) }) }),
  },
}));
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    lodges: [{ id: "a", code: "AMIENS", name: "Amiens St.", short_name: "Amiens", has_dinner: true, has_laundry: false }],
    post: null, serverOffsetMs: 0, signOut: () => {},
    staff: { id: "me", full_name: "Me", display_name: null, role, home_lodge_id: "a" },
    isManagement: role === "manager", isStation: role === "station", canWriteLodge: () => true,
  }),
}));
vi.mock("@/lib/useOnDuty", () => ({ useOnDuty: () => ({ posts: [], loading: false }), onDutyFor: () => null }));
vi.mock("@/pages/Maintenance", () => ({ MaintenanceReminder: () => null }));

import { I18nProvider } from "@/i18n";
import { Layout } from "./Layout";

const show = (path: string) => render(<I18nProvider><MemoryRouter initialEntries={[path]}><Layout /></MemoryRouter></I18nProvider>);
beforeEach(() => { role = "manager"; window.localStorage.clear(); });
afterEach(cleanup);

describe("menu lateral em módulos", () => {
  it("o módulo da rota ativa abre sozinho e os outros ficam retraídos", async () => {
    show("/handover");
    const occ = await screen.findByRole("button", { name: /Occurrences/ });
    expect(occ.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: /Services/ }).getAttribute("aria-expanded")).toBe("false");
  });
  it("o cabeçalho soma os submódulos (10 + 13 = 23) e cada submódulo mostra o seu número", async () => {
    show("/handover");
    const occ = await screen.findByRole("button", { name: /Occurrences/ });
    expect(await within(occ).findByLabelText("23 pending in total")).toBeTruthy();
    const panel = document.getElementById(occ.getAttribute("aria-controls")!)!;
    expect(within(panel).getByRole("link", { name: /Handover/ }).textContent).toContain("10");
    expect(within(panel).getByRole("link", { name: /Maintenance/ }).textContent).toContain("13");
  });
  it("clicar no módulo alterna e a escolha fica guardada", async () => {
    show("/");
    const services = await screen.findByRole("button", { name: /Services/ });
    fireEvent.click(services);
    expect(services.getAttribute("aria-expanded")).toBe("true");
    expect(JSON.parse(window.localStorage.getItem("nav.open")!)).toContain("nav.groupServices");
    fireEvent.click(services);
    expect(services.getAttribute("aria-expanded")).toBe("false");
  });
  it("conta de casa não soma Notifications (só Admin tem) no módulo Overview", async () => {
    role = "station";
    show("/");
    const overview = await screen.findByRole("button", { name: /Overview/ });
    expect(within(overview).queryByLabelText("29 pending in total")).toBeNull();
  });
});
