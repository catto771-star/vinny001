// @vitest-environment jsdom
// Revisão 12: Audit com filtros (período, módulo, ação, pessoa, registro, texto), detalhe, histórico, Load more e CSV.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ANA = "11111111-1111-4111-8111-111111111111";
const ev = (id: number, over: Record<string, unknown> = {}) => ({
  id, occurred_at: "2026-11-25T10:00:00+00:00", actor_staff_id: ANA, actor_name: "Ana Lima", action: "UPDATE", table_name: "maintenance_tickets",
  record_id: `rec-${id}`, old_data: { status: "open", assigned_to: null, version: 1 }, new_data: { status: "resolved", assigned_to: ANA, version: 2 }, ...over,
});
let auditRows: unknown[] = [];
let readRows: unknown[] = [];
const rpc = vi.fn(async (name: string, _a?: unknown) => ({ data: name === "search_audit" ? auditRows : name === "search_access_log" ? readRows : null, error: null }));
function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "order", "limit", "eq"]) q[m] = () => q;
  q.then = (resolve: (v: unknown) => void) => resolve({ data: result, error: null });
  return q;
}
vi.mock("@/lib/supabase", () => ({
  supabaseConfigured: true,
  supabase: { rpc: (n: string, a: unknown) => rpc(n, a), from: () => query([{ id: ANA, full_name: "Ana Lima", display_name: null, role: "manager" }]) },
}));

import { I18nProvider } from "@/i18n";
import { Audit } from "./Audit";

const show = (url = "/audit") => render(<I18nProvider><MemoryRouter initialEntries={[url]}><Audit /></MemoryRouter></I18nProvider>);
const lastArgs = (name: string) => (rpc.mock.calls.filter((c) => c[0] === name).at(-1)?.[1] ?? {}) as Record<string, unknown>;
beforeEach(() => { auditRows = [ev(3), ev(2, { action: "INSERT", old_data: null, new_data: { status: "open", location: "Boiler" } })]; readRows = []; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Audit", () => {
  it("mostra o evento com nome de negócio, quem fez e a mudança legível (antes → depois)", async () => {
    show();
    expect(await screen.findAllByText("Changed · Maintenance request")).toHaveLength(1);
    expect(screen.getByText("Created · Maintenance request")).toBeTruthy();
    expect(screen.getAllByText("Ana Lima").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Status/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("open").length).toBeGreaterThan(0);
    expect(screen.getAllByText("resolved").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Version/)).toBeNull();
  });
  it("filtros da URL viram parâmetros do servidor (módulo, ação, pessoa, texto, registro, período)", async () => {
    show(`/audit?module=handover,settings&action=UPDATE&actor=${ANA}&q=fire&record=rec-9&range=7d`);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("search_audit", expect.anything()));
    const a = lastArgs("search_audit");
    expect(a.p_tables).toEqual(expect.arrayContaining(["handover_entries", "parameters"]));
    expect(a.p_actions).toEqual(["UPDATE"]);
    expect(a.p_actor).toBe(ANA);
    expect(a.p_q).toBe("fire");
    expect(a.p_record).toBe("rec-9");
    expect(typeof a.p_from).toBe("string");
    expect(new Date(a.p_from as string).getTime()).toBeLessThan(Date.now() - 6 * 86400000);
  });
  it("datas De/Até têm prioridade sobre o período e 'Até' inclui o dia inteiro", async () => {
    show("/audit?from=2026-11-01&to=2026-11-10&range=7d");
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    const a = lastArgs("search_audit");
    expect(new Date(a.p_from as string).getDate()).toBe(1);
    expect(new Date(a.p_to as string).getDate()).toBe(11);
  });
  it("Details abre o antes/depois completo; History filtra pelo registro", async () => {
    show();
    const row = (await screen.findByText("Changed · Maintenance request")).closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: "Details" }));
    expect(await screen.findByText("Assigned to")).toBeTruthy();
    fireEvent.click(within(row).getByRole("button", { name: "History" }));
    await waitFor(() => expect(lastArgs("search_audit").p_record).toBe("rec-3"));
    expect(screen.getByRole("button", { name: "Remove filter: Record: rec-3" })).toBeTruthy();
  });
  it("Load more pede a página seguinte (p_before) e some quando acaba", async () => {
    const page = (from: number, n: number) => Array.from({ length: n }, (_, i) => ev(from - i));
    rpc.mockImplementation(async (name: string, args?: unknown) => {
      const before = (args as { p_before?: number | null })?.p_before ?? null;
      if (name !== "search_audit") return { data: null, error: null };
      return { data: before === null ? page(500, 100) : before === 401 ? page(400, 100) : page(300, 1), error: null };
    });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    await waitFor(() => expect(lastArgs("search_audit").p_before).toBe(401));
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    await waitFor(() => expect(lastArgs("search_audit").p_before).toBe(301));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Load more" })).toBeNull());
    rpc.mockImplementation(async (name: string, _a?: unknown) => ({ data: name === "search_audit" ? auditRows : name === "search_access_log" ? readRows : null, error: null }));
  });
  it("Export CSV baixa um arquivo com uma linha por campo alterado", async () => {
    let blobText = "";
    const create = vi.fn((b: Blob) => { const fr = new FileReader(); fr.onload = () => { blobText = String(fr.result); }; fr.readAsText(b); return "blob:x"; });
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    await waitFor(() => expect(blobText).toContain("When,Who,Action,Module,Record,Field,Before,After"));
    expect(blobText).toContain("Status,open,resolved");
    click.mockRestore();
  });
  it("aba Profile views usa search_access_log", async () => {
    readRows = [{ id: 1, occurred_at: "2026-11-25T10:00:00+00:00", actor_staff_id: ANA, actor_name: "Ana Lima", resident_id: "r1", resident_name: "Joana Silva", context: "profile" }];
    show();
    fireEvent.click(await screen.findByRole("tab", { name: "Profile views" }));
    expect(await screen.findByText(/Joana Silva/)).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith("search_access_log", expect.anything());
  });
  it("sem eventos mostra um estado vazio curto", async () => {
    auditRows = [];
    show();
    expect(await screen.findByText("No events")).toBeTruthy();
  });
});
