// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { I18nProvider } from "@/i18n";
import { filterResidents, ResidentPicker } from "./ResidentPicker";

afterEach(cleanup);

const options = [
  { id: "1", label: "Room 2 · 3 — Ana Sofía Pérez" },
  { id: "2", label: "Room 4 · 1 — Marta Nowak" },
  { id: "3", label: "Room 4 · 2 — Mário Silva" },
];
const renderPicker = (onChange = vi.fn()) => {
  render(<I18nProvider><ResidentPicker options={options} value="" onChange={onChange} emptyLabel="No resident" /></I18nProvider>);
  return onChange;
};

describe("escolha do residente (Laundry e Dinner) — um campo só", () => {
  it("filtro: com ou sem @, ignora acento e caixa; vazio mostra todos", () => {
    expect(filterResidents("@mar", options).map((o) => o.id)).toEqual(["2", "3"]);
    expect(filterResidents("sofia", options).map((o) => o.id)).toEqual(["1"]);
    expect(filterResidents("@room 4 silva", options).map((o) => o.id)).toEqual(["3"]);
    expect(filterResidents("@", options)).toHaveLength(3);
    expect(filterResidents("", options)).toHaveLength(3);
  });

  it("um campo só: ao focar mostra a lista; digitar @ e o nome filtra e um toque escolhe", () => {
    const onChange = renderPicker();
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    const box = screen.getByRole("combobox");
    fireEvent.focus(box);
    expect(within(screen.getByRole("listbox")).getAllByRole("option")).toHaveLength(3);
    fireEvent.change(box, { target: { value: "@nowak" } });
    const list = screen.getByRole("listbox");
    expect(within(list).getAllByRole("option")).toHaveLength(1);
    fireEvent.mouseDown(within(list).getByRole("option", { name: /Marta Nowak/ }));
    expect(onChange).toHaveBeenLastCalledWith("2");
  });

  it("teclado: setas escolhem e Enter confirma", () => {
    const onChange = renderPicker();
    const box = screen.getByRole("combobox");
    fireEvent.change(box, { target: { value: "@mar" } }); // Marta e Mário
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("3");
  });
});
