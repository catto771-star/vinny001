import { describe, expect, it } from "vitest";
import { BADGE_FOR_PATH, sumCounts } from "./pending";

describe("pendências", () => {
  it("soma os dois Lodges e ignora respostas vazias", () => {
    expect(sumCounts([{ tasks: 2, maintenance: 1 }, null, { tasks: 1, checks: 3 }])).toEqual({ tasks: 3, maintenance: 1, absences: 0, checks: 3, rounds: 0, no_shows: 0 });
  });
  it("cada seção do menu tem sua bolinha", () => {
    expect(Object.keys(BADGE_FOR_PATH).sort()).toEqual(["/absences", "/handover", "/maintenance", "/no-shows", "/sheet", "/tasks"]);
  });
});

import { badgeFor, groupBadgeTotal } from "./pending";
describe("soma por módulo do menu (revisão 8)", () => {
  const counts = { tasks: 58, maintenance: 13, absences: 1, checks: 4, rounds: 10, no_shows: 51 };
  it("Occurrences soma Handover e Maintenance (10 + 13 = 23)", () => {
    expect(groupBadgeTotal(["/handover", "/maintenance"], counts)).toBe(23);
  });
  it("cada submódulo mantém a sua contagem; Notifications usa as não lidas", () => {
    expect(badgeFor("/handover", counts)).toBe(10);
    expect(badgeFor("/maintenance", counts)).toBe(13);
    expect(badgeFor("/notifications", counts, 29)).toBe(29);
    expect(groupBadgeTotal(["/", "/tasks", "/notifications"], counts, 29)).toBe(87);
  });
  it("rota sem contador conta zero", () => {
    expect(badgeFor("/fridge", counts)).toBe(0);
    expect(groupBadgeTotal([], counts)).toBe(0);
  });
});
