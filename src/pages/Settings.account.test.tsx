// @vitest-environment jsdom
// Revisão 10: Configurações — Minha conta (troca de senha, aparência, sessões) e Sistema (parâmetros, só Admin).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let management = true;
const signIn = vi.fn(async (_c: { email: string; password: string }) => ({ error: null as null | { message: string } }));
const updateUser = vi.fn(async (_a: { password: string }) => ({ error: null as null | { message: string } }));
const signOutAuth = vi.fn(async (_o?: { scope: string }) => ({ error: null }));
const rpc = vi.fn(async (_n: string, _a?: unknown) => ({ data: null, error: null as null | { message: string } }));
const PARAMS = [
  { key: "security.session_idle_minutes", value: 15, valid_from: "2026-01-01T00:00:00Z", lodge_id: null },
  { key: "fridge.range_celsius", value: { min: 0, max: 5 }, valid_from: "2026-01-01T00:00:00Z", lodge_id: null },
  { key: "presence.check_times", value: ["12:00", "18:00", "22:00"], valid_from: "2026-01-01T00:00:00Z", lodge_id: null },
];
function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "order", "is", "lte"]) q[m] = () => q;
  q.then = (resolve: (v: unknown) => void) => resolve({ data: result, error: null });
  return q;
}
vi.mock("@/lib/supabase", () => ({
  supabaseConfigured: true,
  supabase: {
    rpc: (n: string, a: unknown) => rpc(n, a),
    from: (t: string) => query(t === "parameters" ? PARAMS : []),
    auth: { signInWithPassword: (c: { email: string; password: string }) => signIn(c), updateUser: (a: { password: string }) => updateUser(a), signOut: (o?: { scope: string }) => signOutAuth(o) },
  },
}));
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    isManagement: management,
    staff: { id: "me", full_name: "Vinicius Catto", display_name: null, role: management ? "developer" : "station", email: "me@x.test", home_lodge_id: "a" },
    session: { user: { email: "me@x.test" } },
    lodges: [{ id: "a", code: "AMIENS", name: "Amiens St.", short_name: "Amiens" }],
    refresh: async () => {},
  }),
}));
vi.mock("@/lib/push", () => ({ pushState: async () => "off", enablePush: async () => {}, disablePush: async () => {} }));

import { I18nProvider } from "@/i18n";
import { ToastProvider } from "@/components/Toast";
import { Settings } from "./Settings";

const show = (url = "/settings") => render(<I18nProvider><ToastProvider><MemoryRouter initialEntries={[url]}><Settings /></MemoryRouter></ToastProvider></I18nProvider>);
beforeEach(() => { management = true; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function fillPassword(current: string, next: string, repeat = next) {
  fireEvent.change(await screen.findByLabelText("Current password"), { target: { value: current } });
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: next } });
  fireEvent.change(screen.getByLabelText("Repeat the new password"), { target: { value: repeat } });
  fireEvent.click(screen.getByRole("button", { name: "Change password" }));
}

describe("Minha conta", () => {
  it("mostra o perfil (nome, e-mail, função)", async () => {
    show();
    expect(await screen.findByText("Vinicius Catto")).toBeTruthy();
    expect(screen.getByText("me@x.test")).toBeTruthy();
  });
  it("senha atual errada: avisa e não troca nada", async () => {
    signIn.mockResolvedValueOnce({ error: { message: "Invalid login credentials" } });
    show();
    await fillPassword("wrong-pass-1", "NovaSenha2026");
    expect(await screen.findByText("The current password is incorrect.")).toBeTruthy();
    expect(updateUser).not.toHaveBeenCalled();
  });
  it("valida antes de chamar o servidor: repetição diferente, senha fraca e igual à atual", async () => {
    show();
    await fillPassword("SenhaAtual123", "NovaSenha2026", "OutraSenha2026");
    expect(await screen.findByText("The passwords do not match.")).toBeTruthy();
    await fillPassword("SenhaAtual123", "curta1");
    expect(await screen.findByText("The password does not meet the rules.")).toBeTruthy();
    await fillPassword("SenhaAtual123", "SenhaAtual123");
    expect(await screen.findByText("The new password must be different from the current one.")).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });
  it("troca a senha: confere a atual, grava a nova, desconecta os outros aparelhos e limpa o formulário", async () => {
    show();
    await fillPassword("SenhaAtual123", "NovaSenha2026");
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: "NovaSenha2026" }));
    expect(signIn).toHaveBeenCalledWith({ email: "me@x.test", password: "SenhaAtual123" });
    expect(signOutAuth).toHaveBeenCalledWith({ scope: "others" });
    expect(await screen.findByText("Password changed. Other devices were signed out.")).toBeTruthy();
    expect((screen.getByLabelText("Current password") as HTMLInputElement).value).toBe("");
  });
  it("aparência: escolher Dark aplica o tema; 'Sign out of other devices' encerra as outras sessões", async () => {
    show();
    fireEvent.click(await screen.findByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    fireEvent.click(screen.getByRole("button", { name: "Sign out of other devices" }));
    await waitFor(() => expect(signOutAuth).toHaveBeenCalledWith({ scope: "others" }));
  });
  it("conta de casa vê só Minha conta (sem Notifications, Handover nem System)", async () => {
    management = false;
    show();
    expect(await screen.findByText("Vinicius Catto")).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "System" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Notifications" })).toBeNull();
  });
});

describe("Sistema (Admin)", () => {
  it("mostra os valores atuais e salva só o grupo alterado pelo servidor, com número inteiro", async () => {
    show("/settings?tab=system");
    const idle = (await screen.findByLabelText("Sign out after inactivity (minutes)")) as HTMLInputElement;
    expect(idle.value).toBe("15");
    fireEvent.change(idle, { target: { value: "30" } });
    fireEvent.click(within(idle.closest("section")!).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("set_system_parameter", { p_key: "security.session_idle_minutes", p_value: 30 }));
  });
  it("faixa das geladeiras e horários de Room Check (adicionar e remover)", async () => {
    show("/settings?tab=system");
    const max = (await screen.findByLabelText("Fridge maximum (°C)")) as HTMLInputElement;
    fireEvent.change(max, { target: { value: "6" } });
    fireEvent.click(within(max.closest("section")!).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("set_system_parameter", { p_key: "fridge.range_celsius", p_value: { min: 0, max: 6 } }));
    fireEvent.click(screen.getByRole("button", { name: "Remove 22:00" }));
    fireEvent.change(screen.getByLabelText("New Room Check time"), { target: { value: "14:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Room Check time" }));
    const section = screen.getByLabelText("New Room Check time").closest("section")!;
    fireEvent.click(within(section).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("set_system_parameter", { p_key: "presence.check_times", p_value: ["12:00", "14:30", "18:00"] }));
  });
  it("erro do servidor aparece em linguagem clara", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "invalid_parameter" } });
    show("/settings?tab=system");
    const idle = (await screen.findByLabelText("Sign out after inactivity (minutes)")) as HTMLInputElement;
    fireEvent.change(idle, { target: { value: "1" } });
    fireEvent.click(within(idle.closest("section")!).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("That value is not allowed for this setting.")).toBeTruthy();
  });
});
