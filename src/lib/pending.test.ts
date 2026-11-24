import { describe, expect, it } from "vitest";
import { BADGE_FOR_PATH, sumCounts } from "./pending";

describe("pendências", () => {
  it("soma os dois Lodges e ignora respostas vazias", () => {
    expect(sumCounts([{ tasks: 2, maintenance: 1 }, null, { tasks: 1, checks: 3 }])).toEqual({ tasks: 3, maintenance: 1, absences: 0, checks: 3, rounds: 0, no_shows: 0 });
  });
  it("cada seção do menu tem sua bolinha", () => {
    expect(Object.keys(BADGE_FOR_PATH).sort()).toEqual(["/absences", "/handover", "/maintenance", "/no-shows", "/sheet"]);
  });
});
