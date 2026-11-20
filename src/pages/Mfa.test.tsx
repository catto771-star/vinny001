// @vitest-environment jsdom
// Bug: em StrictMode (e em duplo carregamento) a tela de duas etapas inscrevia o
// autenticador duas vezes ao mesmo tempo; a segunda inscrição colidia no Supabase
// e a tela mostrava "Algo deu errado".
import { StrictMode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const factors: Array<{ id: string; friendly_name: string; status: string }> = [];
const enroll = vi.fn(async ({ friendlyName }: { friendlyName: string }) => {
  await new Promise((r) => setTimeout(r, 10));
  if (factors.some((f) => f.friendly_name === friendlyName)) {
    return { data: null, error: { message: "A factor with the friendly name already exists" } };
  }
  const id = `factor-${factors.length + 1}`;
  factors.push({ id, friendly_name: friendlyName, status: "unverified" });
  return { data: { id, type: "totp", totp: { qr_code: "data:image/svg+xml,", secret: `SECRET${id}`, uri: "" } }, error: null };
});

vi.mock("@/lib/supabase", () => ({
  supabaseConfigured: true,
  supabase: {
    rpc: vi.fn(async () => ({ data: null, error: null })),
    auth: {
      mfa: {
        listFactors: vi.fn(async () => {
          await new Promise((r) => setTimeout(r, 5));
          return { data: { totp: [], all: [] }, error: null };
        }),
        unenroll: vi.fn(async () => ({ error: null })),
        enroll: (args: { friendlyName: string }) => enroll(args),
        challengeAndVerify: vi.fn(),
      },
    },
  },
}));

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ refresh: vi.fn(), signOut: vi.fn() }),
}));

import { I18nProvider } from "@/i18n";
import { Mfa } from "./Mfa";

afterEach(() => {
  cleanup();
  factors.length = 0;
  enroll.mockClear();
});

describe("Verificação em duas etapas — inscrição", () => {
  it("em StrictMode inscreve o autenticador uma única vez e mostra o código, sem erro", async () => {
    render(
      <StrictMode>
        <I18nProvider>
          <Mfa enrol />
        </I18nProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(document.querySelector(".mfa-secret")?.textContent).toMatch(/^SECRET/));
    await new Promise((r) => setTimeout(r, 50));
    expect(enroll).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Something went wrong|Algo deu errado/)).toBeNull();
  });
});
