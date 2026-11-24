// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { I18nProvider } from "@/i18n";
import { filterResidents, ResidentPicker } from "./ResidentPicker";

const options = [
  { id: "1", label: "Room 2 · 3 — Ana Sofía Pérez" },
  { id: "2", label: "Room 4 · 1 — Marta Nowak" },
  { id: "3", label: "Room 4 · 2 — Mário Silva" },
];

describe("escolha do residente (Laundry e Dinner)", () => {
  it("busca com @: ignora acento e caixa, todas as palavras precisam aparecer", () => {
    expect(filterResidents("@mar", options).map((o) => o.id)).toEqual(["2", "3"]);
    expect(filterResidents("@sofia", options).map((o) => o.id)).toEqual(["1"]);
    expect(filterResidents("@room 4 silva", options).map((o) => o.id)).toEqual(["3"]);
    expect(filterResidents("@", options)).toEqual([]);
  });

  it("digitar @ e escolher na lista seleciona o residente; o menu em cascata também funciona", () => {
    const onChange = vi.fn();
    render(<I18nProvider><ResidentPicker options={options} value="" onChange={onChange} emptyLabel="No resident" /></I18nProvider>);
    fireEvent.change(screen.getByPlaceholderText(/@/), { target: { value: "@nowak" } });
    fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: /Marta Nowak/ }));
    expect(onChange).toHaveBeenLastCalledWith("2");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "3" } });
    expect(onChange).toHaveBeenLastCalledWith("3");
  });
});
