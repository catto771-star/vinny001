// @vitest-environment jsdom
// Revisão 8: interruptor das casas — só Admin alterna; conta de casa (station) fica presa à sua casa.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let role: "manager" | "station" = "manager";
const LODGES = [
  { id: "a", code: "AMIENS", name: "Amiens St.", short_name: "Amiens", has_dinner: true, has_laundry: false },
  { id: "c", code: "CONNOLLY", name: "Connolly", short_name: "Connolly", has_dinner: false, has_laundry: true },
];
vi.mock("@/lib/supabase", () => ({ supabaseConfigured: true, supabase: { rpc: async () => ({ data: null, error: null }), from: () => ({}) } }));
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    lodges: role === "station" ? [LODGES[0]] : LODGES,
    post: null,
    staff: { id: "me", full_name: "Me", display_name: null, role, home_lodge_id: "a" },
    isManagement: role === "manager",
  }),
}));

import { I18nProvider } from "@/i18n";
import { ActiveLodgeProvider } from "@/lib/activeLodge";
import { HouseSwitch } from "./Layout";

const show = () => render(<I18nProvider><MemoryRouter><ActiveLodgeProvider><HouseSwitch /></ActiveLodgeProvider></MemoryRouter></I18nProvider>);

beforeEach(() => { role = "manager"; window.localStorage.clear(); delete document.documentElement.dataset.house; });
afterEach(cleanup);

describe("interruptor das casas", () => {
  it("Admin vê um grupo de opções (radiogroup) e troca a casa, que muda o tema", () => {
    show();
    const group = screen.getByRole("radiogroup");
    expect(group.getAttribute("data-active")).toBe("amiens");
    fireEvent.click(screen.getByRole("radio", { name: "Connolly" }));
    expect(screen.getByRole("radio", { name: "Connolly" }).getAttribute("aria-checked")).toBe("true");
    expect(group.getAttribute("data-active")).toBe("connolly");
    expect(document.documentElement.dataset.house).toBe("connolly");
  });
  it("conta de casa não vê o interruptor, mesmo com outra casa guardada no navegador", () => {
    role = "station";
    window.localStorage.setItem("lodge.active", "c");
    show();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(document.documentElement.dataset.house).toBe("amiens");
  });
  it("setas do teclado alternam entre as casas", () => {
    show();
    fireEvent.keyDown(screen.getByRole("radio", { name: "Amiens" }), { key: "ArrowRight" });
    expect(screen.getByRole("radiogroup").getAttribute("data-active")).toBe("connolly");
  });
});
