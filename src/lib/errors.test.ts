import { describe, expect, it } from "vitest";
import { errorKey } from "./errors";

describe("errorKey", () => {
  it("mapeia erros do banco para mensagens", () => {
    expect(errorKey({ message: 'duplicate key value violates unique constraint "stays_one_open_per_bed"' })).toBe("errors.bedTaken");
    expect(errorKey({ message: "new row violates row-level security policy" })).toBe("errors.notAuthorised");
    expect(errorKey({ message: "stale_version" })).toBe("errors.staleVersion");
    expect(errorKey(new TypeError("Failed to fetch"))).toBe("errors.network");
    expect(errorKey(null)).toBe("errors.generic");
    expect(errorKey({ message: "not_author" })).toBe("errors.notAuthor");
    expect(errorKey({ message: "unmarked_residents" })).toBe("sheet.markAll");
    expect(errorKey({ message: "checks_pending" })).toBe("noShows.incomplete");
  });

  it("mapeia erros da gestão (Fase 3)", () => {
    expect(errorKey({ message: "staff_overlap" })).toBe("errors.staffOverlap");
    expect(errorKey({ message: "float_overlap" })).toBe("errors.floatOverlap");
    expect(errorKey({ message: "role_not_allowed" })).toBe("errors.roleNotAllowed");
    expect(errorKey({ message: "exceeds_purchased_quantity" })).toBe("errors.exceedsPurchased");
    expect(errorKey({ message: "same_lodge" })).toBe("errors.sameLodge");
    expect(errorKey({ message: "invalid_period" })).toBe("errors.invalidPeriod");
  });
});
