// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "@/i18n";
import type { BedOccupancy } from "@/lib/types";
import { BedBoard } from "./BedBoard";

afterEach(cleanup);

const bed = (room: string, n: number, extra: Partial<BedOccupancy> = {}): BedOccupancy => ({
  lodge_id: "a", lodge_code: "AMIENS", room_id: `r${room}`, room_kind: "room", room_code: room, room_sort: Number(room),
  bed_id: `${room}-${n}`, bed_number: n, bed_status: "in_use", stay_id: null, stay_status: null, admitted_at: null,
  resident_id: null, first_name: null, last_name: null, date_of_birth: null, pass_id: null, ...extra,
});

describe("Quadro de camas", () => {
  it("um bloco por quarto, uma célula por cama, com a situação de cada uma e o total", () => {
    const beds = [
      bed("1", 1, { stay_id: "s1", stay_status: "active" }),
      bed("1", 2, { stay_id: "s2", stay_status: "out_pending" }),
      bed("2", 1),
      bed("2", 2, { bed_status: "out_of_service" }),
    ];
    const { container } = render(
      <I18nProvider><MemoryRouter><BedBoard lodge={{ id: "a", code: "AMIENS", name: "Amiens St.", short_name: "Amiens", has_dinner: true, has_laundry: false }} beds={beds} /></MemoryRouter></I18nProvider>,
    );
    expect(container.querySelectorAll(".board-room")).toHaveLength(2);
    expect(container.querySelectorAll(".board-beds .bed-cell.occ")).toHaveLength(1);
    expect(container.querySelectorAll(".board-beds .bed-cell.cancelled")).toHaveLength(1);
    expect(container.querySelectorAll(".board-beds .bed-cell.free")).toHaveLength(2);
    expect(container.querySelectorAll(".board-beds .bed-cell.oos")).toHaveLength(1);
    expect(screen.getByText("of 4 beds")).toBeTruthy();
    expect(screen.getByText(/1 free from a cancelled bed/)).toBeTruthy();
    expect(screen.getByText(/2 free/)).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/beds");
  });
});
