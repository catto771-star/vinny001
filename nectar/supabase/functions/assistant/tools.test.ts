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
  if (q.table === 'diet_day_targets') return q.calls.some(([m, a]) => m === 'in' && a[0] === 'plan_id');
  if (q.table === 'foods' || q.table === 'exercises' || q.table === 'set_types') {
    return q.calls.some(([m, a]) =>
      (m === 'or' && String(a[0]).includes(`user_id.eq.${UID}`)) ||
      ((m === 'insert' || m === 'upsert') && (a[0] as { user_id?: string }).user_id === UID),
    );
  }
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
  registrar_treino: { titulo: 'Superior A', duracao_min: 55, notas: 'Supino 4x8', exercicios: [{ nome: 'Supino reto com barra', series: 3, reps: 8, carga_kg: 80 }] },
  gerar_rotina_treino: { nome_rotina: 'Upper A', pasta: 'Upper Lower', exercicios: [{ nome: 'Supino reto com barra', series: 4, reps: '6-8', descanso_s: 120, superset: 'A' }] },
  analisar_evolucao_treino: { dias: 28 },
  registrar_cardio: { tipo: 'corrida', duracao_min: 30, distancia_km: 5, kcal: 320 },
  resumo_saude_hoje: {},
  consultar_oraculo_nutrientes: { nutriente: 'potassio', modo: 'oraculo', limite: 5 },
  sugerir_alimentos_dia: { refeicao: 'jantar' },
  registrar_agua: { ml: 300 },
  iniciar_jejum: { protocolo: '16:8', inicio_data: '2026-11-18', inicio_hora: '20:00' },
  encerrar_jejum: { fim_data: '2026-11-19', fim_hora: '12:30' },
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
        foods: [
          { id: 'f1', name: 'Espinafre refogado', kcal: 23, protein_g: 2.9, carbs_g: 3.6, fat_g: 0.4, fiber_g: 2.2 },
          { id: 'f2', name: 'Peito de frango grelhado', kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, fiber_g: 0 },
        ],
        diet_plans: [{ id: 'dp1', name: 'Cutting', is_active: true }],
        diet_day_targets: [{ plan_id: 'dp1', day_type: 'training', kcal: 2100, protein_g: 165, carbs_g: 210, fat_g: 60 }],
        fasting_sessions: [{ id: 'fs1', protocol: '16:8', target_hours: 16, started_at: '2026-11-18T23:00:00.000Z', notes: null }],
        workout_plans: [{ id: 'wp1', name: 'Minha ficha', is_active: true }],
        workout_plan_sessions: [{ id: 'wps1', plan_id: 'wp1', order_index: 0 }],
        workouts: [{ id: 'w1', date: '2026-11-18', title: 'Push A', duration_min: 50, notes: null }],
        exercises: [{ id: 'ex1', name: 'Supino reto com barra', muscle_group: 'peito', secondary_muscles: ['triceps'] }],
        set_types: [{ id: 'st1', name: 'Working set', drives_progression: true }],
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
  it('ranks foods in Oracle, computes daily gaps, and starts/ends intermittent fasts with undo', async () => {
    const { db } = fakeDb({
      foods: [
        { id: 'f1', name: 'Espinafre cru', kcal: 23, protein_g: 2.9, carbs_g: 3.6, fat_g: 0.4, fiber_g: 2.2 },
        { id: 'f2', name: 'Castanha do Pará', kcal: 656, protein_g: 14, carbs_g: 12, fat_g: 66, fiber_g: 7.5 },
      ],
      food_logs: [{ food_name: 'Peito de frango', quantity_g: 200, kcal: 330, protein_g: 62, carbs_g: 0, fat_g: 7, fiber_g: 0 }],
      fasting_sessions: [{ id: 'fs-open', protocol: '16:8', target_hours: 16, started_at: '2026-11-18T01:00:00.000Z', notes: null }],
    });
    const oracleChecked = checkArgs('consultar_oraculo_nutrientes', { nutriente: 'potassio', modo: 'por_100kcal', limite: 2 });
    expect(oracleChecked.ok).toBe(true);
    if (oracleChecked.ok) {
      const r = await runTool(db, UID, 'consultar_oraculo_nutrientes', oracleChecked.args, NOW, 'America/Sao_Paulo');
      expect((r.ranking as { alimento: string }[])[0].alimento).toBe('Espinafre cru');
    }

    const sugChecked = checkArgs('sugerir_alimentos_dia', { refeicao: 'jantar' });
    expect(sugChecked.ok).toBe(true);
    if (sugChecked.ok) {
      const s = await runTool(db, UID, 'sugerir_alimentos_dia', sugChecked.args, NOW, 'America/Sao_Paulo');
      expect((s.restante as { kcal: number }).kcal).toBeGreaterThan(1000);
      expect(Array.isArray(s.principais_lacunas_micronutrientes)).toBe(true);
    }

    const startChecked = checkArgs('iniciar_jejum', { protocolo: '16:8', inicio_data: '2026-11-18', inicio_hora: '20:00' });
    expect(startChecked.ok).toBe(true);
    if (startChecked.ok) {
      const f = await runTool(db, UID, 'iniciar_jejum', startChecked.args, NOW, 'America/Sao_Paulo');
      expect(f.previsao_termino).toBe('19/11/2026 às 12:00');
      expect(f.link).toBe('/saude?aba=Jejum');
    }

    const endChecked = checkArgs('encerrar_jejum', { fim_data: '2026-11-18', fim_hora: '15:00' });
    expect(endChecked.ok).toBe(true);
    if (endChecked.ok) {
      const e = await runTool(db, UID, 'encerrar_jejum', endChecked.args, NOW, 'America/Sao_Paulo');
      expect(e.meta_atingida).toBe(true);
      expect(e.undo).toMatchObject({ table: 'fasting_sessions', op: 'update', id: 'fs-open' });
    }
  });

  it('logs workouts with calorie burn & habit sync, builds routines with supersets, and analyzes Hevy 1RM & muscle split', async () => {
    const { db, queries } = fakeDb({
      workouts: [{ id: 'w-new', date: '2026-11-18', title: 'Push A', duration_min: 60, notes: null }],
      workout_sets: [
        { workout_id: 'w-new', exercise_id: 'ex-bench', load_kg: 81, reps: 8, effort: 8.5, notes: '[ss:A]' },
      ],
      exercises: [{ id: 'ex-bench', name: 'Supino reto com barra', muscle_group: 'peito', secondary_muscles: ['triceps', 'ombros'] }],
      set_types: [{ id: 'st-work', name: 'Working set', drives_progression: true }],
      body_measurements: [{ value: 80, measured_at: '2026-11-18T08:00:00Z' }],
      habits: [{ id: 'h-gym', name: 'Ir para a academia', target_value: 1 }],
      workout_plans: [{ id: 'wp-1', name: 'Minha ficha', is_active: true }],
      workout_plan_sessions: [{ id: 'wps-new', plan_id: 'wp-1', order_index: 0 }],
      food_logs: [{ date: '2026-11-18', kcal: 2100, protein_g: 175 }],
    });

    const logChecked = checkArgs('registrar_treino', {
      titulo: 'Push A',
      duracao_min: 60,
      exercicios: [{ nome: 'Supino reto com barra', series: 2, reps: 8, carga_kg: 80, superset: 'A' }],
    });
    expect(logChecked.ok).toBe(true);
    if (logChecked.ok) {
      const wRes = await runTool(db, UID, 'registrar_treino', logChecked.args, NOW, 'America/Sao_Paulo');
      expect(Number(wRes.kcal_estimadas)).toBeGreaterThanOrEqual(400);
      expect(String(wRes.feito)).toContain('Ir para a academia');
      expect(queries.some((q) => q.table === 'habit_completions' && q.calls.some(([m]) => m === 'upsert'))).toBe(true);
    }

    const routineChecked = checkArgs('gerar_rotina_treino', {
      nome_rotina: 'Upper Força',
      pasta: 'Upper Lower',
      exercicios: [{ nome: 'Supino reto com barra', series: 4, reps: '6-8', descanso_s: 150, superset: 'A' }],
    });
    expect(routineChecked.ok).toBe(true);
    if (routineChecked.ok) {
      const rRes = await runTool(db, UID, 'gerar_rotina_treino', routineChecked.args, NOW, 'America/Sao_Paulo');
      expect(rRes.link).toBe('/saude?aba=Treino');
      expect(rRes.undo).toMatchObject({ table: 'workout_plan_sessions', op: 'delete', id: 'wps-new' });
    }

    const anaChecked = checkArgs('analisar_evolucao_treino', { dias: 28 });
    expect(anaChecked.ok).toBe(true);
    if (anaChecked.ok) {
      const aRes = await runTool(db, UID, 'analisar_evolucao_treino', anaChecked.args, NOW, 'America/Sao_Paulo');
      expect(aRes.kcal_ativas_totais).toBe(400);
      expect((aRes.melhores_exercicios as { melhor_1rm_kg: number }[])[0].melhor_1rm_kg).toBe(100); // 81 / 0.81 = 100
      const dist = aRes.distribuicao_muscular_ponderada as { musculo: string; series_ponderadas: number }[];
      expect(dist.find((d) => d.musculo === 'peito')?.series_ponderadas).toBe(1);
      expect(dist.find((d) => d.musculo === 'triceps')?.series_ponderadas).toBe(0.5);
    }
  });
});

