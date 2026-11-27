import { describe, expect, it } from "vitest";
import { groupByRoom, summarise } from "./useOccupancy";
import type { BedOccupancy } from "./types";

const bed = (over: Partial<BedOccupancy>): BedOccupancy => ({
  lodge_id: "L", lodge_code: "AMIENS", room_id: "R1", room_kind: "room", room_code: "1", room_sort: 1,
  bed_id: Math.random().toString(), bed_number: 1, bed_status: "in_use", stay_id: null, stay_status: null,
  admitted_at: null, resident_id: null, first_name: null, last_name: null, date_of_birth: null, pass_id: null, ...over,
});

describe("ocupação", () => {
  it("conta ocupadas, livres (a cama de cancelamento decidido conta como livre), fora de uso e cancelamentos", () => {
    const s = summarise([
      bed({ stay_id: "s1", stay_status: "active" }),
      bed({ stay_id: "s2", stay_status: "out_pending" }),
      bed({}),
      bed({ bed_status: "out_of_service" }),
    ]);
    expect(s).toEqual({ total: 4, occupied: 1, free: 2, outOfService: 1, outPending: 1 });
  });
  it("agrupa por quarto na ordem recebida", () => {
    const rooms = groupByRoom([bed({ room_id: "A", bed_number: 1 }), bed({ room_id: "B" }), bed({ room_id: "A", bed_number: 2 })]);
    expect(rooms.map((r) => [r.room_id, r.beds.length])).toEqual([["A", 2], ["B", 1]]);
  });
});
