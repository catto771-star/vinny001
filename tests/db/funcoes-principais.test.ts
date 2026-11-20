// Testes simples das 5 funções mais importantes do sistema.
// Cada teste mostra o resultado esperado de forma direta.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { operationalDay } from "@/lib/time";
import { Db, type Actor } from "./helpers";

let db: Db;
let manager: Actor;
let porter: Actor;
let amiens: string;
let connolly: string;

beforeEach(async () => {
  db = await Db.open();
  manager = await db.createStaff("manager", "Gestão Teste");
  porter = await db.createStaff("porter", "Porter Teste");
  amiens = await db.lodgeId("AMIENS");
  connolly = await db.lodgeId("CONNOLLY");
});

afterEach(async () => {
  await db.close();
});

describe("1. assume_post — Assumir Posto", () => {
  it("Porter assume o Office de Amiens e o posto fica aberto", async () => {
    await db.as(porter);
    const r = await db.one("select public.assume_post('office', $1) as r", [amiens]);
    expect(r.r.status).toBe("assumed");

    await db.asSuperuser();
    const post = await db.one("select function, lodge_id, ended_at from public.duty_posts where staff_id = $1", [porter.staffId]);
    expect(post).toEqual({ function: "office", lodge_id: amiens, ended_at: null });
  });
});

describe("2. can_write_lodge — quem pode registrar em cada Lodge", () => {
  it("Office de Amiens escreve em Amiens e não em Connolly; Manager escreve nos dois", async () => {
    await db.as(porter);
    await db.query("select public.assume_post('office', $1)", [amiens]);
    const office = await db.one("select public.can_write_lodge($1) as amiens, public.can_write_lodge($2) as connolly", [amiens, connolly]);
    expect(office).toEqual({ amiens: true, connolly: false });

    await db.as(manager);
    const gestao = await db.one("select public.can_write_lodge($1) as amiens, public.can_write_lodge($2) as connolly", [amiens, connolly]);
    expect(gestao).toEqual({ amiens: true, connolly: true });
  });
});

describe("3. admit_resident — admitir residente numa cama livre", () => {
  it("Cria o residente e a estadia ativa na cama escolhida", async () => {
    const [bed] = await db.freeBeds("AMIENS");
    await db.as(porter);
    await db.query("select public.assume_post('office', $1)", [amiens]);
    const stay = await db.one<{ id: string }>(
      "select public.admit_resident(p_lodge => $1, p_bed => $2, p_first_name => 'Ana', p_last_name => 'Teste') as id",
      [amiens, bed],
    );

    await db.asSuperuser();
    const row = await db.one(
      "select s.status, s.bed_id, r.first_name from public.stays s join public.residents r on r.id = s.resident_id where s.id = $1",
      [stay.id],
    );
    expect(row).toEqual({ status: "active", bed_id: bed, first_name: "Ana" });
  });
});

describe("4. decide_out / effect_out — fluxo do Out", () => {
  it("Office decide o Out (fica pendente) e o Manager efetiva (estadia encerrada)", async () => {
    const [bed] = await db.freeBeds("AMIENS");
    await db.as(porter);
    await db.query("select public.assume_post('office', $1)", [amiens]);
    const stay = await db.one<{ id: string }>(
      "select public.admit_resident(p_lodge => $1, p_bed => $2, p_first_name => 'Bruno') as id",
      [amiens, bed],
    );

    await db.as(porter);
    await db.query("select public.decide_out($1, 'Saiu')", [stay.id]);
    await db.asSuperuser();
    expect((await db.one("select status from public.stays where id = $1", [stay.id])).status).toBe("out_pending");

    await db.as(manager);
    await db.query("select public.effect_out($1)", [stay.id]);
    await db.asSuperuser();
    expect((await db.one("select status, end_reason from public.stays where id = $1", [stay.id]))).toEqual({
      status: "ended",
      end_reason: "out",
    });
  });
});

describe("5. operationalDay — dia operacional (07h às 07h, Dublin)", () => {
  it("06h59 conta no dia anterior e 07h00 no próprio dia, igual na tela e no banco", async () => {
    // Inverno (Dublin = UTC)
    expect(operationalDay(new Date("2026-12-15T06:59:00Z"))).toBe("2026-12-14");
    expect(operationalDay(new Date("2026-12-15T07:00:00Z"))).toBe("2026-12-15");

    await db.asSuperuser();
    const r = await db.one(
      "select public.operational_day('2026-12-15T06:59:00Z')::text as antes, public.operational_day('2026-12-15T07:00:00Z')::text as depois",
    );
    expect(r).toEqual({ antes: "2026-12-14", depois: "2026-12-15" });
  });
});
