import { describe, expect, it } from "vitest";
import { onDutyFor, type OnDutyPost } from "./useOnDuty";

const p = (id: string, fn: OnDutyPost["function"], lodge: string | null): OnDutyPost => ({ id, staff_id: id, function: fn, lodge_id: lodge, started_at: "", ends_at: "", staff: null });

describe("quem está escalado numa casa (Roster)", () => {
  it("Office da casa; sem Office, o Float; Cleaner não conta", () => {
    const list = [p("c", "cleaner", "a"), p("f", "float", null), p("o", "office", "a")];
    expect(onDutyFor(list, "a")?.id).toBe("o");
    expect(onDutyFor(list, "b")?.id).toBe("f");
    expect(onDutyFor([p("c", "cleaner", "a")], "a")).toBeUndefined();
  });
});
