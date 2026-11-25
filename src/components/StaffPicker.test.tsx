// @vitest-environment jsdom
// Revisão 8: Author + até 3 colegas, sem 4 campos soltos.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "@/i18n";
import { StaffPicker, addColleague, initials, removeColleague, type Person } from "./StaffPicker";

const PEOPLE: Person[] = [
  { id: "p", name: "Pedro Silva" }, { id: "m", name: "Maria Kelly" }, { id: "j", name: "John Doyle" },
  { id: "a", name: "Aoife Byrne" }, { id: "n", name: "Niamh Ó Briain" },
];

function Harness({ required = false, rostered = "p" }: { required?: boolean; rostered?: string }) {
  const [author, setAuthor] = useState<string | null>(null);
  const [co, setCo] = useState<string[]>([]);
  return (
    <I18nProvider>
      <StaffPicker people={PEOPLE} author={author} rosteredId={rostered} coAuthors={co} onAuthor={setAuthor} onCoAuthors={setCo} required={required} />
      <output data-testid="state">{JSON.stringify({ author, co })}</output>
    </I18nProvider>
  );
}
const state = () => JSON.parse(screen.getByTestId("state").textContent!);
afterEach(cleanup);

describe("helpers", () => {
  it("addColleague desduplica, ignora o autor e limita a 3", () => {
    expect(addColleague([], "a", "x")).toEqual(["a"]);
    expect(addColleague(["a"], "a", "x")).toEqual(["a"]);
    expect(addColleague([], "x", "x")).toEqual([]);
    expect(addColleague(["a", "b", "c"], "d", "x")).toEqual(["a", "b", "c"]);
  });
  it("removeColleague e initials", () => {
    expect(removeColleague(["a", "b"], "a")).toEqual(["b"]);
    expect(initials("Maria Kelly")).toBe("MK");
    expect(initials("Niamh")).toBe("N");
  });
});

describe("StaffPicker", () => {
  it("mostra o Author (quem está no Roster) e o botão de adicionar colega com contador", () => {
    render(<Harness />);
    expect(screen.getByText("Author")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Change author/ }).textContent).toContain("Pedro Silva");
    expect(screen.getByRole("button", { name: /Add colleague/ }).textContent).toContain("1/4");
  });
  it("adiciona colegas pela busca e pelo teclado; cada um vira um chip removível", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Add colleague/ }));
    const box = screen.getByRole("combobox");
    fireEvent.change(box, { target: { value: "kel" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.keyDown(box, { key: "Enter" });
    expect(state().co).toEqual(["m"]);
    expect(screen.getByRole("button", { name: "Remove Maria Kelly" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Add colleague/ }));
    fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: /John Doyle/ }));
    expect(state().co).toEqual(["m", "j"]);
    fireEvent.click(screen.getByRole("button", { name: "Remove Maria Kelly" }));
    expect(state().co).toEqual(["j"]);
  });
  it("a lista não oferece quem já foi escolhido, nem o autor", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Add colleague/ }));
    const names = screen.getAllByRole("option").map((o) => o.textContent);
    expect(names.some((n) => n?.includes("Pedro Silva"))).toBe(false);
    expect(names).toHaveLength(4);
  });
  it("com 4 pessoas (autor + 3) o botão some e aparece o aviso do máximo", () => {
    render(<Harness />);
    for (const name of [/Maria/, /John/, /Aoife/]) {
      fireEvent.click(screen.getByRole("button", { name: /Add colleague/ }));
      fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name }));
    }
    expect(state().co).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /Add colleague/ })).toBeNull();
    expect(screen.getByText("Maximum of 4 people")).toBeTruthy();
  });
  it("trocar o autor mantém os colegas e tira o novo autor da lista de colegas", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Add colleague/ }));
    fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: /Maria/ }));
    fireEvent.click(screen.getByRole("button", { name: /Change author/ }));
    fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: /Maria/ }));
    expect(state()).toEqual({ author: "m", co: [] });
  });
  it("Backspace no campo vazio remove o último colega; Escape fecha a lista", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Add colleague/ }));
    fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: /Maria/ }));
    fireEvent.click(screen.getByRole("button", { name: /Add colleague/ }));
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Backspace" });
    expect(state().co).toEqual([]);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(screen.queryByRole("combobox")).toBeNull();
  });
  it("conta de casa sem ninguém no Roster precisa escolher o Author", () => {
    render(<Harness required rostered="" />);
    expect(screen.getByRole("button", { name: /Select the author/ })).toBeTruthy();
  });
});
