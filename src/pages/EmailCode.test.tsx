// @vitest-environment jsdom
// Segunda etapa por código enviado por e-mail (sem QR Code / autenticador).
import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn(async () => ({ data: null, error: null }));
const signInWithOtp = vi.fn(async () => ({ data: {}, error: null as unknown }));
const verifyOtp = vi.fn(async () => ({ data: {}, error: null as unknown }));
const refresh = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabaseConfigured: true,
  supabase: {
    rpc: (...a: unknown[]) => rpc(...(a as [])),
    auth: {
      signInWithOtp: (...a: unknown[]) => signInWithOtp(...(a as [])),
      verifyOtp: (...a: unknown[]) => verifyOtp(...(a as [])),
      mfa: { enroll: vi.fn(), listFactors: vi.fn() },
    },
  },
}));

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ session: { user: { email: "catto771@gmail.com" } }, refresh, signOut: vi.fn() }),
}));

import { I18nProvider } from "@/i18n";
import { EmailCode } from "./EmailCode";

function renderPage() {
  render(
    <StrictMode>
      <I18nProvider>
        <EmailCode />
      </I18nProvider>
    </StrictMode>,
  );
}

afterEach(() => {
  cleanup();
  rpc.mockClear();
  signInWithOtp.mockClear();
  verifyOtp.mockClear();
});

describe("Código por e-mail", () => {
  it("não mostra QR Code e não envia nada sozinho ao abrir", async () => {
    renderPage();
    await new Promise((r) => setTimeout(r, 30));
    expect(document.querySelector("img")).toBeNull();
    expect(signInWithOtp).not.toHaveBeenCalled();
    expect(screen.getByText(/c\*+@gmail\.com/)).toBeTruthy();
  });

  it("enviar: registra o pedido com a senha e depois pede o e-mail, uma vez só", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => expect(signInWithOtp).toHaveBeenCalledTimes(1));
    expect(rpc).toHaveBeenCalledWith("begin_email_verification");
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(signInWithOtp.mock.invocationCallOrder[0]);
    expect(signInWithOtp).toHaveBeenCalledWith({ email: "catto771@gmail.com", options: { shouldCreateUser: false } });
  });

  it("digitar o código confirma no Supabase", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => expect(screen.getByLabelText("Code")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: " 123456 " } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(verifyOtp).toHaveBeenCalledWith({ email: "catto771@gmail.com", token: "123456", type: "email" }));
  });

  it("limite de envios do servidor vira mensagem clara", async () => {
    signInWithOtp.mockResolvedValueOnce({ data: {}, error: { status: 429, message: "email rate limit exceeded" } });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => expect(screen.getByText(/Too many codes requested/)).toBeTruthy());
  });

  it("código errado mostra aviso", async () => {
    verifyOtp.mockResolvedValueOnce({ data: {}, error: { status: 403, message: "Token has expired or is invalid" } });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => expect(screen.getByLabelText("Code")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(screen.getByText(/Code not accepted/)).toBeTruthy());
  });
});
