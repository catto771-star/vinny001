import { describe, expect, it } from 'vitest';
import { TOOLS, checkArgs } from './lib';
import { runTool, snapshot, type Db } from './tools';

const UID = '11111111-1111-4111-8111-111111111111';
const TASK = '22222222-2222-4222-8222-222222222222';
const HABIT = '33333333-3333-4333-8333-333333333333';
const GOAL = '44444444-4444-4444-8444-444444444444';
const MEM = '55555555-5555-4555-8555-555555555555';
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
  if (q.table === 'project_tasks') return q.calls.some(([m, a]) => (m === 'in' && a[0] === 'project_id') || m === 'insert');
  return q.calls.some(([m, a]) =>
    (m === 'eq' && a[0] === 'user_id' && a[1] === UID) ||
    ((m === 'insert' || m === 'upsert') && (a[0] as { user_id?: string }).user_id === UID));
}

const SAMPLE: Record<string, Record<string, unknown>> = {
  listar_tarefas: { periodo: 'semana' },
  criar_tarefa: { titulo: 'Ligar', data: '2026-11-20' },
  concluir_tarefa: { titulo: 'ligar' },
  reagendar_tarefa: { titulo: 'ligar', data: '2026-11-22', hora: '14:00' },
  criar_lembrete: { titulo: 'Vitamina', data: '2026-11-20', hora: '09:00' },
  listar_agenda: { inicio: '2026-11-18', fim: '2026-11-25' },
  criar_compromisso: { titulo: 'Dentista', data: '2026-11-21', inicio: '15:00', fim: '16:00' },
  listar_habitos: {},
  marcar_habito: { nome: 'ler' },
  listar_contas: {},
  resumo_financeiro: { ano: 2026, mes: 11 },
  registrar_transacao: { descricao: 'Tesco', valor: 18.5, tipo: 'despesa', moeda: 'EUR', conta: 'Revolut', cotacao: 6.45 },
  buscar_notas: { texto: 'creatina' },
  criar_nota: { titulo: 'Ideia', texto: 'linha' },
  listar_metas: {},
  registrar_progresso_meta: { titulo: 'reserva', valor: 250 },
  listar_projetos: {},
  criar_marco_projeto: { projeto: 'Casa', titulo: 'Pintura', prazo: '2026-12-01' },
  criar_plano_projeto: { projeto: 'Casa', etapas: [{ titulo: 'Fase 1', prazo: '2026-12-01', subetapas: ['Comprar tinta', 'Lixar parede'] }] },
  concluir_marco_projeto: { projeto: 'Casa', titulo: 'Pintura' },
  registrar_refeicao: { alimento: 'Frango com arroz', refeicao: 'almoco', kcal: 540, proteina_g: 45, carbo_g: 55, gordura_g: 12 },
  registrar_peso: { peso_kg: 79.2 },
  registrar_treino: { titulo: 'Superior A', duracao_min: 55, notas: 'Supino 4x8' },
  registrar_cardio: { tipo: 'corrida', duracao_min: 30, distancia_km: 5, kcal: 320 },
  resumo_saude_hoje: {},
  registrar_transferencia: { origem: 'Revolut', destino: 'Wise', valor: 100, moeda: 'EUR', cotacao: 6.45 },
  definir_orcamento: { categoria: 'Mercado', limite: 400, moeda: 'EUR' },
  concluir_lembrete: { titulo: 'Vitamina' },
  reagendar_compromisso: { titulo: 'Dentista', data: '2026-11-25', inicio: '16:00', fim: '17:00' },
  listar_memorias: {},
  salvar_memoria: { categoria: 'financas', conteudo: 'Gastos em euro vão na Revolut' },
  esquecer_memoria: { trecho: 'Revolut' },
};

describe('tools stay inside the user', () => {
  it('has a sample for every tool', () => {
    expect(Object.keys(SAMPLE).sort()).toEqual(TOOLS.map((t) => t.function.name).sort());
  });
  for (const name of Object.keys(SAMPLE)) {
    it(`${name}: every query is limited to the user`, async () => {
      const { db, queries } = fakeDb({
        tasks: [{ id: TASK, title: 'Ligar para o contador', due_date: '2026-11-18T12:00:00Z', due_all_day: true }],
        habits: [{ id: HABIT, name: 'Ler', target_value: 1, schedule_days: null }],
        projects: [{ id: 'p1', name: 'Casa' }],
        project_steps: [{ id: 's1', project_id: 'p1', title: 'Pintura', completed: false, order_index: 0 }],
        goals: [{ id: GOAL, title: 'Reserva financeira' }],
        banks: [
          { id: 'b1', name: 'Revolut', currency: 'EUR', initial_balance: 1000 },
          { id: 'b2', name: 'Wise', currency: 'EUR', initial_balance: 200 },
        ],
        reminders: [{ id: 'r1', title: 'Tomar Vitamina', datetime: '2026-11-20T12:00:00Z', completed: false }],
        events: [{ id: 'e1', title: 'Dentista', start_at: '2026-11-21T18:00:00Z', end_at: '2026-11-21T19:00:00Z', all_day: false }],
        assistant_memories: [{ id: MEM, category: 'financas', content: 'Gastos em euro na Revolut' }],
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
  it('completes a task found by its title and returns undo metadata', async () => {
    const { db, queries } = fakeDb({ tasks: [{ id: TASK, title: 'Ligar para o contador' }] });
    const res = await runTool(db, UID, 'concluir_tarefa', { id: null, titulo: 'ligar para o contador' }, NOW, 'America/Sao_Paulo');
    const update = queries.find((q) => q.calls.some(([m]) => m === 'update'));
    expect(update?.calls.some(([m, a]) => m === 'eq' && a[0] === 'id' && a[1] === TASK)).toBe(true);
    expect(res.undo).toMatchObject({ table: 'tasks', op: 'update', id: TASK });
  });
});
