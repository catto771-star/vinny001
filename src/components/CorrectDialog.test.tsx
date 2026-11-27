// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n";
import { CorrectDialog } from "./CorrectDialog";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(cleanup);

const setup = (onSubmit = vi.fn().mockResolvedValue({ error: null })) => {
  const onDone = vi.fn();
  render(<I18nProvider><CorrectDialog title="Fix" fields={[{ key: "temperature", label: "Temp", value: "9.5", type: "number" }]} onSubmit={onSubmit} onClose={() => {}} onDone={onDone} /></I18nProvider>);
  return { onSubmit, onDone };
};

describe("CorrectDialog", () => {
  it("só salva com motivo e envia os valores editados", async () => {
    const { onSubmit, onDone } = setup();
    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Temp"), { target: { value: "3.2" } });
    fireEvent.change(screen.getByLabelText("Reason for the correction"), { target: { value: "Typed wrong" } });
    fireEvent.click(save);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith({ temperature: "3.2" }, "Typed wrong");
  });
  it("mostra o erro do banco e não fecha", async () => {
    const { onDone } = setup(vi.fn().mockResolvedValue({ error: { message: "correction_window_closed" } }));
    fireEvent.change(screen.getByLabelText("Reason for the correction"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });
});
