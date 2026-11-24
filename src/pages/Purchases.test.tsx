// @vitest-environment jsdom
// Purchases (Beta 4.1): lista fixa do Tesco, pedido com padrão / a mais / a menos / não comprar e preço em branco.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const rpc = vi.fn(async (_n: string, _a?: unknown) => ({ data: null, error: null }));
const tables: Record<string, unknown[]> = {
  shop_items: [
    { id: "i1", sort_order: 1, category: "Dairy & Chilled", name: "Milk", default_qty: 18, default_action: "buy", tesco_url: "https://www.tesco.ie/shop/en-IE/products/260776455", image_path: "/products/milk.jpg", version: 1 },
    { id: "i2", sort_order: 2, category: "Drinks & Groceries", name: "Salt", default_qty: 1, default_action: "dont_buy", tesco_url: null, image_path: null, version: 1 },
  ],
  shop_orders: [{ id: "o1", delivery_date: "2026-11-27", notes: null, status: "draft", created_at: "2026-11-24T10:00:00Z" }],
  shop_order_lines: [
    { id: "l1", item_id: "i1", standard_qty: 18, action: "standard", delta: 0, final_qty: 18, unit_price: null },
    { id: "l2", item_id: "i2", standard_qty: 1, action: "dont", delta: 0, final_qty: 0, unit_price: null },
  ],
};
function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) q[m] = () => q;
  q.then = (resolve: (v: unknown) => void) => resolve({ data: result, error: null });
  return q;
}
vi.mock("@/lib/supabase", () => ({ supabaseConfigured: true, supabase: { rpc: (n: string, a: unknown) => rpc(n, a), from: (t: string) => query(tables[t] ?? []) } }));

import { I18nProvider } from "@/i18n";
import { finalQty, parsePrice, Purchases } from "./Purchases";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(cleanup);
const wrap = () => render(<I18nProvider><MemoryRouter><Purchases /></MemoryRouter></I18nProvider>);

describe("Purchases — regras", () => {
  it("quantidade final: padrão, +X, −X (nunca negativo) e não comprar", () => {
    expect(finalQty(18, "standard", 0)).toBe(18);
    expect(finalQty(1, "more", 5)).toBe(6);
    expect(finalQty(18, "less", 4)).toBe(14);
    expect(finalQty(1, "less", 9)).toBe(0);
    expect(finalQty(10, "dont", 3)).toBe(0);
  });
  it("preço: vazio é sem preço; aceita vírgula; texto inválido é recusado", () => {
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("1,29")).toBe(1.29);
    expect(parsePrice("abc")).toBeUndefined();
    expect(parsePrice("1.234")).toBeUndefined();
  });
});

describe("Purchases — pedido", () => {
  it("mostra foto e link do Tesco; 'Buy more' +5 e o preço vão para o banco e o total soma", async () => {
    wrap();
    const milk = await screen.findByRole("article", { name: "Milk" });
    expect(within(milk).getByRole("link", { name: /Tesco/ }).getAttribute("href")).toContain("tesco.ie");
    expect(milk.querySelector("img")?.getAttribute("src")).toBe("/products/milk.jpg");
    fireEvent.click(within(milk).getByRole("button", { name: "Buy more" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("set_shop_line", { p_line: "l1", p_action: "more", p_delta: 1, p_unit_price: null }));
    const howMany = within(milk).getByLabelText("How many");
    fireEvent.change(howMany, { target: { value: "5" } });
    fireEvent.blur(howMany);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("set_shop_line", { p_line: "l1", p_action: "more", p_delta: 5, p_unit_price: null }));
    expect(within(milk).getByText("23")).toBeTruthy();
    const price = within(milk).getByLabelText("Unit price (€)");
    fireEvent.change(price, { target: { value: "1,20" } });
    fireEvent.blur(price);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("set_shop_line", { p_line: "l1", p_action: "more", p_delta: 5, p_unit_price: 1.2 }));
    expect(screen.getAllByText(/27,60|27\.60/).length).toBeGreaterThan(0);
  });
});
