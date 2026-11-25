// @vitest-environment jsdom
// Home (revisão 25/11): painéis com dados da plataforma.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const dash = {
  lodges: [{ lodge_id: "a", beds_total: 37, out_of_use: 1, occupied: 30, out_pending: 2, seen_today: 27, checks_done: 1, checks_total: 3, rounds_done: 5, absences_now: 2 }],
  series: Array.from({ length: 14 }, (_, i) => ({ day: `2026-11-${String(12 + i).padStart(2, "0")}`, admissions: i % 3, outs: i % 2, no_shows: i === 4 ? 1 : 0, maintenance: 0, occupied: 28 + (i % 4) })),
  maintenance_open: { urgent: 2, normal: 5, low: 1, overdue: 3 },
};
vi.mock("@/lib/supabase", () => ({ supabaseConfigured: true, supabase: { rpc: async () => ({ data: dash, error: null }) } }));
vi.mock("@/auth/AuthProvider", () => ({ useAuth: () => ({ lodges: [{ id: "a", code: "AMIENS", name: "Amiens St.", short_name: "Amiens" }] }) }));

import { I18nProvider } from "@/i18n";
import { HomeDashboard, linePath, pct } from "./HomeDashboard";

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
    expect(screen.getByRole("img", { name: "Admissions and Outs · last 14 days" }).querySelectorAll(".barchart-col")).toHaveLength(14);
    expect(screen.getByText("28–31")).toBeTruthy();
    expect(screen.getByText("1 No Show(s) in the period.")).toBeTruthy();
  });
});
