import { describe, expect, it } from 'vitest';
import { TOOLS, checkArgs } from './lib';
import { runTool, snapshot, type Db } from './tools';

const UID = '11111111-1111-4111-8111-111111111111';
const TASK = '22222222-2222-4222-8222-222222222222';
const HABIT = '33333333-3333-4333-8333-333333333333';
const NOW = { date: '2026-11-18', time: '10:00', weekday: 3 };

interface Query { table: string; calls: [string, unknown[]][] }

/** A stand-in for the Supabase client that records every query and answers with fixed rows. */
function fakeDb(rows: Record<string, unknown[]>) {
  const queries: Query[] = [];
  const db = {
    from(table: string) {
      const q: Query = { table, calls: [] };
      queries.push(q);
      const result = () => ({ data: rows[table] ?? [], error: null });
      const builder: Record<string, unknown> = {};
      const proxy: unknown = new Proxy(builder, {
        get(_t, prop: string) {
          if (prop === 'then') return (ok: (v: unknown) => void) => ok(result());
          if (prop === 'maybeSingle' || prop === 'single') return () => Promise.resolve({ data: (rows[table] ?? [])[0] ?? null, error: null });
          return (...args: unknown[]) => { q.calls.push([prop, args]); return proxy; };
        },
      });
      return proxy;
    },
  };
  return { db: db as unknown as Db, queries };
}

/** A query is the user's when it filters by user_id = UID or writes rows carrying it. */
function isScoped(q: Query): boolean {
  if (q.table === 'project_tasks') return q.calls.some(([m, a]) => m === 'in' && a[0] === 'project_id');
  return q.calls.some(([m, a]) =>
    (m === 'eq' && a[0] === 'user_id' && a[1] === UID) ||
    ((m === 'insert' || m === 'upsert') && (a[0] as { user_id?: string }).user_id === UID));
}

const SAMPLE: Record<string, Record<string, unknown>> = {
  listar_tarefas: { periodo: 'semana' },
  criar_tarefa: { titulo: 'Ligar', data: '2026-11-20' },
  concluir_tarefa: { titulo: 'ligar' },
  criar_lembrete: { titulo: 'Vitamina', data: '2026-11-20', hora: '09:00' },
  listar_habitos: {},
  marcar_habito: { nome: 'ler' },
  resumo_financeiro: { ano: 2026, mes: 11 },
  registrar_transacao: { descricao: 'Almoço', valor: 32.5, tipo: 'despesa' },
  buscar_notas: { texto: 'creatina' },
  criar_nota: { titulo: 'Ideia', texto: 'linha' },
  listar_metas: {},
  listar_projetos: {},
};

describe('tools stay inside the user', () => {
  it('has a sample for every tool', () => {
    expect(Object.keys(SAMPLE).sort()).toEqual(TOOLS.map((t) => t.function.name).sort());
  });
  for (const name of Object.keys(SAMPLE)) {
    it(`${name}: every query is limited to the user`, async () => {
      const { db, queries } = fakeDb({
        tasks: [{ id: TASK, title: 'Ligar para o contador' }],
        habits: [{ id: HABIT, name: 'Ler', target_value: 1, schedule_days: null }],
        projects: [{ id: 'p1', name: 'Casa' }],
      });
      const checked = checkArgs(name, SAMPLE[name]);
      expect(checked.ok).toBe(true);
      if (!checked.ok) return;
      await runTool(db, UID, name, checked.args, NOW, 'America/Sao_Paulo');
      expect(queries.length).toBeGreaterThan(0);
      for (const q of queries) expect(isScoped(q), `${q.table}: ${JSON.stringify(q.calls)}`).toBe(true);
    });
  }
  it('snapshot: every query is limited to the user', async () => {
    const { db, queries } = fakeDb({});
    await snapshot(db, UID, NOW, 'America/Sao_Paulo');
    for (const q of queries) expect(isScoped(q), q.table).toBe(true);
  });
  it('completes a task found by its title', async () => {
    const { db, queries } = fakeDb({ tasks: [{ id: TASK, title: 'Ligar para o contador' }] });
    await runTool(db, UID, 'concluir_tarefa', { id: null, titulo: 'ligar para o contador' }, NOW, 'America/Sao_Paulo');
    const update = queries.find((q) => q.calls.some(([m]) => m === 'update'));
    expect(update?.calls.some(([m, a]) => m === 'eq' && a[0] === 'id' && a[1] === TASK)).toBe(true);
  });
});
