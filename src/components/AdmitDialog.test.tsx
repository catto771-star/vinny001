// @vitest-environment jsdom
// Bug: no diálogo "Admitir residente", clicar no botão do rodapé não enviava o formulário
// (a tela não chamava admit_resident e não mostrava erro).
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const BED = { bed_id: "bed-1", lodge_id: "lodge-a", lodge_code: "AMIENS", room_id: "room-1", room_kind: "room", room_code: "1", room_sort: 1, bed_number: 1, bed_status: "in_use", stay_id: null, stay_status: null, admitted_at: null, resident_id: null, first_name: null, last_name: null, date_of_birth: null, pass_id: null };

let occupancyDelayMs = 0;
const rpc = vi.fn(async () => ({ data: "stay-1", error: null }));

function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "order", "eq", "or", "limit"]) q[m] = () => q;
  q.single = async () => ({ data: { resident_id: "res-1" }, error: null });
  q.then = (resolve: (v: unknown) => void) => setTimeout(() => resolve({ data: result, error: null }), occupancyDelayMs);
  return q;
}

vi.mock("@/lib/supabase", () => ({
  supabaseConfigured: true,
  supabase: { rpc: (...args: unknown[]) => rpc(...(args as [])), from: (table: string) => query(table === "bed_occupancy" ? [BED] : []) },
}));

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ lodges: [{ id: "lodge-a", code: "AMIENS", name: "Amiens St.", short_name: "Amiens" }], canWriteLodge: () => true }),
}));

import { I18nProvider } from "@/i18n";
import { AdmitDialog } from "./AdmitDialog";

beforeAll(() => {
  // jsdom não implementa <dialog>.showModal/close
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

afterEach(() => {
  cleanup();
  rpc.mockClear();
  occupancyDelayMs = 0;
});

describe("AdmitDialog", () => {
  it("clicar em Admitir residente envia a admissão ao servidor", async () => {
    const onDone = vi.fn();
    render(
      <I18nProvider>
        <AdmitDialog initialBed={{ bedId: "bed-1", lodgeId: "lodge-a" }} onClose={() => {}} onDone={onDone} />
      </I18nProvider>,
    );
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(1));
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Maria" } });
    fireEvent.click(screen.getByRole("button", { name: "Admit resident" }));

    await waitFor(() => expect(rpc).toHaveBeenCalledWith("admit_resident", expect.objectContaining({ p_bed: "bed-1", p_first_name: "Maria" })));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("res-1"));
  });

  it("enquanto as camas livres carregam, o botão de admitir fica desabilitado (bug: clique rápido não admitia)", async () => {
    occupancyDelayMs = 300;
    render(
      <I18nProvider>
        <AdmitDialog initialBed={{ bedId: "bed-1", lodgeId: "lodge-a" }} onClose={() => {}} onDone={() => {}} />
      </I18nProvider>,
    );
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Maria" } });
    const button = screen.getByRole("button", { name: "Admit resident" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await waitFor(() => expect(button.disabled).toBe(false));
    expect((document.querySelector("select") as HTMLSelectElement).value).toBe("bed-1");
  });
});
