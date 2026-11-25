// App dos Admins (PWA): 5 abas no celular — Home, Alerts, Presence, Log, More.
import { describe, expect, it } from "vitest";
import { BOTTOM_ADMIN } from "./Layout";
import { translate } from "@/i18n";

describe("abas do app dos Admins", () => {
  it("Home, Alerts, Presence e Log (+ More no botão de menu), com rótulos curtos", () => {
    expect(BOTTOM_ADMIN.map((i) => translate("en-IE", i.label))).toEqual(["Home", "Alerts", "Presence", "Log"]);
    expect(translate("en-IE", "nav.more")).toBe("More");
    for (const i of BOTTOM_ADMIN) expect(translate("en-IE", i.label).length).toBeLessThanOrEqual(10);
  });
});
