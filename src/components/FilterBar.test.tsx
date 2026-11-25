// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "@/i18n";
import type { FilterDef } from "@/lib/filters";
import { useUrlFilters } from "@/lib/useUrlFilters";
import { FilterBar } from "./FilterBar";

const DEFS: FilterDef[] = [
  { key: "q", label: "Search entries", type: "search" },
  { key: "kind", label: "Type", type: "select", primary: true, options: [{ value: "note", label: "Notes" }, { value: "round", label: "Rounds" }] },
  { key: "tags", label: "Tags", type: "multi", options: [{ value: "a", label: "Incident" }, { value: "b", label: "Delivery" }] },
];
function Page() {
  const { values, set, clear } = useUrlFilters(DEFS);
  const loc = useLocation();
  return (<><FilterBar defs={DEFS} values={values} onChange={set} onClear={clear} count={3} /><output data-testid="url">{loc.search}</output></>);
}
const show = (url = "/handover") => render(<I18nProvider><MemoryRouter initialEntries={[url]}><Page /></MemoryRouter></I18nProvider>);
afterEach(cleanup);

describe("FilterBar", () => {
  it("digitar na busca atualiza a URL; a contagem é anunciada", () => {
    show();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search entries" }), { target: { value: "fire" } });
    expect(screen.getByTestId("url").textContent).toBe("?q=fire");
    expect(screen.getByText("3 result(s)")).toBeTruthy();
  });
  it("filtro principal aparece direto; vira chip e some com ×", () => {
    show();
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "round" } });
    expect(screen.getByTestId("url").textContent).toBe("?kind=round");
    fireEvent.click(screen.getByRole("button", { name: "Remove filter: Type: Rounds" }));
    expect(screen.getByTestId("url").textContent).toBe("");
  });
  it("More filters abre o painel; várias tags viram vários chips e o contador", () => {
    show("/handover?kind=note");
    fireEvent.click(screen.getByRole("button", { name: /More filters/ }));
    fireEvent.click(screen.getByRole("button", { name: "Incident" }));
    fireEvent.click(screen.getByRole("button", { name: "Delivery" }));
    expect(screen.getByTestId("url").textContent).toBe("?kind=note&tags=a%2Cb");
    expect(screen.getByRole("button", { name: /More filters \(2\)/ })).toBeTruthy();
  });
  it("Clear all limpa tudo; a URL inicial já aplica os filtros", () => {
    show("/handover?q=x&kind=round&tags=a");
    expect((screen.getByLabelText("Type") as HTMLSelectElement).value).toBe("round");
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.getByTestId("url").textContent).toBe("");
  });
});
