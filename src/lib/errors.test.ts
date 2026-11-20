import { describe, expect, it } from "vitest";
import { errorKey } from "./errors";

describe("errorKey", () => {
  it("mapeia erros do banco para mensagens", () => {
    expect(errorKey({ message: 'duplicate key value violates unique constraint "stays_one_open_per_bed"' })).toBe("errors.bedTaken");
    expect(errorKey({ message: "new row violates row-level security policy" })).toBe("errors.notAuthorised");
    expect(errorKey({ message: "stale_version" })).toBe("errors.staleVersion");
    expect(errorKey(new TypeError("Failed to fetch"))).toBe("errors.network");
    expect(errorKey(null)).toBe("errors.generic");
  });
});
