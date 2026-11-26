// @vitest-environment jsdom
// Home (revisão 25/11): painéis com dados da plataforma.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpcCalls: [string, unknown][] = [];
const dash = {
  lodges: [{ lodge_id: "a", beds_total: 37, out_of_use: 1, occupied: 30, present: 30, out_pending: 2, seen_today: 27, checks_done: 1, checks_total: 3, rounds_done: 5, absences_now: 2 }],
  series: Array.from({ length: 14 }, (_, i) => ({ day: `2026-11-${String(12 + i).padStart(2, "0")}`, admissions: i % 3, outs: i % 2, no_shows: i === 4 ? 1 : 0, maintenance: 0, occupied: 28 + (i % 4) })),
  maintenance_open: { urgent: 2, normal: 5, low: 1, overdue: 3 },
};
vi.mock("@/lib/supabase", () => ({ supabaseConfigured: true, supabase: { rpc: async (n: string, a: unknown) => { rpcCalls.push([n, a]); return { data: dash, error: null }; } } }));
vi.mock("@/auth/AuthProvider", () => ({ useAuth: () => ({ lodges: [{ id: "a", code: "AMIENS", name: "Amiens St.", short_name: "Amiens" }] }) }));

import { I18nProvider } from "@/i18n";
import { HomeDashboard, linePath, pct, presetRange, validPeriod } from "./HomeDashboard";

beforeEach(() => { try { window.localStorage.clear(); } catch { /* */ } rpcCalls.length = 0; });
afterEach(cleanup);

describe("Home — painéis", () => {
  it("percentual sem dividir por zero; linha da série cabe na área", () => {
    expect(pct(27, 30)).toBe(90);
    expect(pct(1, 0)).toBe(0);
    expect(linePath([1, 3, 2], 100, 50)).toBe("M0.0,50.0 L50.0,0.0 L100.0,25.0");
  });

  it("mostra ocupação, Seen de hoje (anel), checks, manutenção por prioridade e o gráfico de 14 dias", async () => {
    render(<I18nProvider><MemoryRouter><HomeDashboard /></MemoryRouter></I18nProvider>);
    expect(await screen.findByText("Amiens St.")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Seen today" }).textContent).toContain("90%");
    expect(screen.getByText("27/30")).toBeTruthy();
    expect(screen.getByText("1/3")).toBeTruthy();
    expect(screen.getByText("3 past the deadline")).toBeTruthy();
    // revisão 4: ocupação e movimento em gráficos separados (não se sobrepõem)
    expect(screen.getByRole("img", { name: "Occupancy · last 14 days" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Admissions and cancelled beds · last 14 days" }).querySelectorAll(".barchart-col")).toHaveLength(14);
    expect(screen.getAllByText(/28–31/).length).toBeGreaterThan(0);
    expect(screen.getByText("1 No Show(s) in the period.")).toBeTruthy();
  });

  it("período: 14 dias por padrão; 30d busca o intervalo certo, é lembrado e o título acompanha", async () => {
    render(<I18nProvider><MemoryRouter><HomeDashboard /></MemoryRouter></I18nProvider>);
    await screen.findByText("Amiens St.");
    fireEvent.click(screen.getByRole("button", { name: "30d" }));
    await waitFor(() => expect(rpcCalls.some(([, a]) => (a as { p_from: string; p_to: string }).p_to > (a as { p_from: string }).p_from && Math.round((Date.parse((a as { p_to: string }).p_to) - Date.parse((a as { p_from: string }).p_from)) / 864e5) === 29)).toBe(true));
    expect(screen.getByRole("img", { name: "Occupancy · last 30 days" })).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem("home.period")!).kind).toBe("30");
  });
  it("período personalizado: abre o seletor, valida e aplica", async () => {
    render(<I18nProvider><MemoryRouter><HomeDashboard /></MemoryRouter></I18nProvider>);
    await screen.findByText("Amiens St.");
    fireEvent.click(screen.getByRole("button", { name: "Custom period" }));
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-11-10" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-11-20" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(rpcCalls.some(([, a]) => (a as { p_from: string }).p_from === "2026-11-10" && (a as { p_to: string }).p_to === "2026-11-20")).toBe(true));
  });
  it("cartões recolhem mostrando os dados em uma linha, e o estado fica guardado", async () => {
    render(<I18nProvider><MemoryRouter><HomeDashboard /></MemoryRouter></I18nProvider>);
    await screen.findByText("Amiens St.");
    fireEvent.click(screen.getByRole("button", { name: "Collapse Amiens St." }));
    expect(screen.getByText(/30\/37 beds · 90% seen · 1\/3 Checks/)).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem("home.collapsed")!)).toContain("house:a");
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(screen.getByRole("button", { name: "Expand all" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Expand Amiens St." })).toBeTruthy();
  });
  it("regras do período: presets terminam em hoje e o personalizado tem no máximo 1 ano", () => {
    expect(presetRange("7", "2026-11-26")).toEqual({ from: "2026-11-20", to: "2026-11-26" });
    expect(validPeriod("2026-11-10", "2026-11-20")).toBe(true);
    expect(validPeriod("2026-11-20", "2026-11-10")).toBe(false);
    expect(validPeriod("2025-01-01", "2026-11-26")).toBe(false);
  });
});
