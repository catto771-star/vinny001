// @vitest-environment jsdom
// Componentes base do design (docs/DESIGN.md).
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Tabs } from "./Tabs";
import { Skeleton } from "./Skeleton";
import { ToastProvider, useToast } from "./Toast";
import { Dialog } from "./Dialog";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function TabsHarness() {
  const [v, setV] = useState("a");
  return (
    <Tabs
      label="Lodge"
      value={v}
      onChange={setV}
      items={[
        { value: "a", label: "Amiens St." },
        { value: "b", label: "Connolly" },
        { value: "c", label: "Outro" },
      ]}
    />
  );
}

describe("Tabs", () => {
  it("marca a aba ativa, tem indicador deslizante e troca com clique", () => {
    render(<TabsHarness />);
    expect(screen.getByRole("tab", { name: "Amiens St." }).getAttribute("aria-selected")).toBe("true");
    expect(document.querySelector(".tabs-indicator")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Connolly" }));
    expect(screen.getByRole("tab", { name: "Connolly" }).getAttribute("aria-selected")).toBe("true");
  });

  it("setas do teclado mudam de aba (acessível)", () => {
    render(<TabsHarness />);
    fireEvent.keyDown(screen.getByRole("tab", { name: "Amiens St." }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Connolly" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Connolly" }), { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Amiens St." }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("Skeleton", () => {
  it("mostra linhas de carregamento anunciadas como ocupado", () => {
    render(<Skeleton rows={4} />);
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(document.querySelectorAll(".skeleton-line")).toHaveLength(4);
  });
});

function ToastHarness() {
  const toast = useToast();
  return <button onClick={() => toast.success("Check lançado.")}>go</button>;
}

describe("Toast", () => {
  it("mostra a confirmação e some sozinha", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("go"));
    expect(screen.getByText("Check lançado.")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText("Check lançado.")).toBeNull();
  });
});

describe("Dialog", () => {
  it("fecha com animação: aplica a classe de saída e só depois avisa", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      <Dialog title="Admitir residente" onClose={onClose}>
        <p>corpo</p>
      </Dialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "×" }));
    expect(document.querySelector("dialog")?.classList.contains("is-closing")).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
