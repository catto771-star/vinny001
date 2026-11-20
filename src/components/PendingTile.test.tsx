// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

let counts = { tasks: 0, maintenance: 0, absences: 0, checks: 0, rounds: 0, no_shows: 0 };
vi.mock("@/lib/pending", () => ({ usePendingCounts: () => counts }));
vi.mock("@/auth/AuthProvider", () => ({ useAuth: () => ({ lodges: [{ id: "a" }], post: null, isManagement: true }) }));

import { I18nProvider } from "@/i18n";
import { PendingTile } from "./PendingTile";

afterEach(cleanup);
const renderTile = () => render(<I18nProvider><MemoryRouter><PendingTile /></MemoryRouter></I18nProvider>);

describe("Pendências na tela inicial", () => {
  it("sem pendências mostra mensagem tranquila", () => {
    counts = { tasks: 0, maintenance: 0, absences: 0, checks: 0, rounds: 0, no_shows: 0 };
    renderTile();
    expect(screen.getByText("Nothing pending. Good shift.")).toBeTruthy();
  });
  it("lista cada seção com contagem e link", () => {
    counts = { tasks: 3, maintenance: 1, absences: 0, checks: 2, rounds: 0, no_shows: 0 };
    renderTile();
    expect(screen.getByText("2 check(s) to enter").closest("a")?.getAttribute("href")).toBe("/sheet");
    expect(screen.getByText("3 task(s) pending").closest("a")?.getAttribute("href")).toBe("/tasks");
    expect(screen.getByText("1 maintenance request(s) open")).toBeTruthy();
    expect(screen.queryByText(/absence/)).toBeNull();
  });
});
