// Revisão 13 — Pessoas não pertencem a uma casa: só a conta de casa (station) guarda a sua.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db } from "./helpers";

let db: Db;
beforeEach(async () => { db = await Db.open(); });
afterEach(async () => { await db.close(); });

describe("pessoa × casa", () => {
  it("Porter, Cleaner, Manager e Owner não aceitam casa; a conta de casa exige", async () => {
    await db.asSuperuser();
    const amiens = await db.lodgeId("AMIENS");
    for (const role of ["porter", "cleaner", "manager", "owner"]) {
      const e = await db.error("insert into public.staff (full_name, role, home_lodge_id) values ('X', $1, $2)", [role, amiens]);
      expect(e, role).toMatch(/staff_home_only_station|violates check/);
      expect(await db.error("insert into public.staff (full_name, role) values ('X', $1)", [role]), role).toBeNull();
    }
    expect(await db.error("insert into public.staff (full_name, role, home_lodge_id) values ('House', 'station', $1)", [amiens])).toBeNull();
  });
  it("quem já tinha casa perde o vínculo (Staff atua nas duas casas)", async () => {
    await db.asSuperuser();
    const amiens = await db.lodgeId("AMIENS");
    const st = await db.one<{ id: string }>("insert into public.staff (full_name, role) values ('Pedro', 'porter') returning id");
    expect(await db.error("update public.staff set home_lodge_id = $1 where id = $2", [amiens, st.id])).toMatch(/staff_home_only_station|violates check/);
  });
});
