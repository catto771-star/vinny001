import pg from "pg";

const url = process.env.LOCAL_PG_URL ?? "postgresql://postgres@localhost:54322";
const dbName = process.env.LOCAL_PG_DB ?? "dslodge";

export type Actor = { userId: string | null; staffId: string; role: string; aal?: "aal1" | "aal2" };

/**
 * Cada teste roda numa transação que é desfeita no fim, sobre o banco recriado
 * por `npm run db:reset`. `as(actor)` faz as consultas seguintes rodarem como
 * o usuário autenticado (mesmo mecanismo do Supabase: role + claims do JWT),
 * de modo que as políticas RLS são realmente exercitadas.
 */
export class Db {
  constructor(private client: pg.Client) {}

  static async open(): Promise<Db> {
    const client = new pg.Client({ connectionString: `${url}/${dbName}` });
    await client.connect();
    await client.query("begin");
    return new Db(client);
  }

  async close() {
    await this.client.query("rollback");
    await this.client.end();
  }

  async asSuperuser() {
    await this.client.query("reset role");
    await this.client.query("select set_config('request.jwt.claims', '', true)");
  }

  async as(actor: Actor) {
    await this.client.query("reset role");
    const claims = JSON.stringify({ sub: actor.userId, role: "authenticated", aal: actor.aal ?? "aal2" });
    await this.client.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    await this.client.query("set local role authenticated");
  }

  async query<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) {
    return this.client.query<T>(sql, params);
  }

  async one<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T> {
    const result = await this.client.query<T>(sql, params);
    if (result.rows.length !== 1) throw new Error(`expected 1 row, got ${result.rows.length}`);
    return result.rows[0];
  }

  /** Executa e devolve a mensagem de erro (ou null se não houve erro). Usa savepoint para seguir a transação. */
  async error(sql: string, params: unknown[] = []): Promise<string | null> {
    await this.client.query("savepoint t");
    try {
      await this.client.query(sql, params);
      await this.client.query("release savepoint t");
      return null;
    } catch (error) {
      await this.client.query("rollback to savepoint t");
      return (error as Error).message;
    }
  }

  /** Cria usuário de auth + cadastro na equipe (como superusuário). */
  async createStaff(role: string, name: string, opts: { login?: boolean } = {}): Promise<Actor> {
    await this.asSuperuser();
    let userId: string | null = null;
    if (opts.login !== false && role !== "cleaner") {
      const user = await this.one<{ id: string }>(
        "insert into auth.users (email) values ($1) returning id",
        [`${name.toLowerCase().replace(/\W+/g, ".")}.${Math.random().toString(36).slice(2, 8)}@test.local`],
      );
      userId = user.id;
    }
    const staff = await this.one<{ id: string }>(
      "insert into public.staff (user_id, full_name, role) values ($1, $2, $3) returning id",
      [userId, name, role],
    );
    return { userId, staffId: staff.id, role };
  }

  async lodgeId(code: "AMIENS" | "CONNOLLY"): Promise<string> {
    await this.asSuperuser();
    return (await this.one<{ id: string }>("select id from public.lodges where code = $1", [code])).id;
  }

  async freeBeds(code: "AMIENS" | "CONNOLLY", count = 1): Promise<string[]> {
    await this.asSuperuser();
    const result = await this.query<{ bed_id: string }>(
      "select bed_id from public.bed_occupancy where lodge_code = $1 and stay_id is null and bed_status = 'in_use' order by room_sort, bed_number limit $2",
      [code, count],
    );
    return result.rows.map((row) => row.bed_id);
  }
}
