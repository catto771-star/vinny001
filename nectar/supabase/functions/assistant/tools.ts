// The assistant's tools over a user's data. Every query is limited to that
// user explicitly (selects and updates filtered by user_id, inserts carrying
// it), so the same code is safe under row level security (chat) and with the
// service role (the autopilot's AI requests, where RLS does not apply).
import { addDays, localNow, textToBlocks, zonedToUtc, matchByName, type LocalNow, type ToolArgs } from './lib.ts';

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export type Db = SupabaseClient;

/** Table access for one user. */
export function scoped(db: Db, uid: string) {
  return {
    // Generic, so the column list stays a literal and rows keep their field types.
    select: <C extends string>(table: string, cols: C) => db.from(table).select(cols).eq('user_id', uid),
    insert: (table: string, row: Record<string, unknown>) => db.from(table).insert({ ...row, user_id: uid }),
    update: (table: string, patch: Record<string, unknown>) => db.from(table).update(patch).eq('user_id', uid),
    upsert: (table: string, row: Record<string, unknown>, opts?: { onConflict?: string }) => db.from(table).upsert({ ...row, user_id: uid }, opts),
  };
}

/** A short picture of the day for the system prompt. */
export async function snapshot(db: Db, uid: string, now: LocalNow, tz: string) {
  const own = scoped(db, uid);
  const endToday = zonedToUtc(now.date, '23:59', tz);
  const startToday = zonedToUtc(now.date, '00:00', tz);
  const [{ data: tasks }, { data: habits }, { data: goals }] = await Promise.all([
    own.select('tasks', 'title,due_date').eq('completed', false).eq('is_archived', false).not('due_date', 'is', null).lte('due_date', endToday).limit(40),
    own.select('habits', 'name,schedule_days,frequency').eq('is_archived', false),
    own.select('goals', 'title').eq('status', 'active').limit(10),
  ]);
  const today = (tasks ?? []).filter((t) => t.due_date >= startToday);
  return {
    tasksToday: today.slice(0, 10).map((t) => t.title),
    tasksLate: (tasks ?? []).length - today.length,
    habitsToday: (habits ?? []).filter((h) => dueToday(h, now)).map((h) => h.name).slice(0, 15),
    goals: (goals ?? []).map((g) => g.title),
  };
}

export function dueToday(h: { schedule_days: number[] | null; frequency?: string | null }, now: LocalNow) {
  return h.frequency === 'weekly' || !h.schedule_days?.length || h.schedule_days.includes(now.weekday);
}

const localDay = (iso: string, tz: string) => localNow(tz, new Date(iso)).date;
const PRIORITY_PT: Record<string, string> = { high: 'alta', medium: 'média', low: 'baixa' };

/** Runs one checked tool call for one user. Results are short and in Portuguese. */
export async function runTool(db: Db, uid: string, name: string, a: ToolArgs, now: LocalNow, tz: string): Promise<Record<string, unknown>> {
  const own = scoped(db, uid);
  const fail = (e: { message: string } | null) => ({ erro: e?.message ?? 'falhou' });
  switch (name) {
    case 'listar_tarefas': {
      let q = own.select('tasks', 'id,title,priority,due_date').eq('completed', false).eq('is_archived', false).order('due_date', { ascending: true, nullsFirst: false }).limit(50);
      if (a.periodo === 'hoje') q = q.not('due_date', 'is', null).lte('due_date', zonedToUtc(now.date, '23:59', tz));
      if (a.periodo === 'atrasadas') q = q.lt('due_date', zonedToUtc(now.date, '00:00', tz));
      if (a.periodo === 'semana') q = q.not('due_date', 'is', null).lte('due_date', zonedToUtc(addDays(now.date, 7), '23:59', tz));
      const { data, error } = await q;
      if (error) return fail(error);
      return { tarefas: (data ?? []).map((t) => ({ id: t.id, titulo: t.title, prioridade: PRIORITY_PT[t.priority], data: t.due_date ? localDay(t.due_date, tz) : null })) };
    }
    case 'criar_tarefa': {
      const due = a.data ? zonedToUtc(String(a.data), '23:59', tz) : null;
      const { error } = await own.insert('tasks', { title: a.titulo, priority: a.prioridade, due_date: due, due_all_day: !!due });
      return error ? fail(error) : { feito: `Tarefa criada: ${a.titulo}${a.data ? ` (${String(a.data).split('-').reverse().join('/')})` : ''}` };
    }
    case 'concluir_tarefa': {
      if (!a.id) {
        const { data: open } = await own.select('tasks', 'id,title').eq('completed', false).eq('is_archived', false).limit(500);
        const found = matchByName((open ?? []).map((t) => ({ id: t.id, name: t.title })), String(a.titulo));
        if (!found.length) return { erro: `nenhuma tarefa aberta com "${a.titulo}"` };
        if (found.length > 1) return { erro: 'mais de uma tarefa combina; pergunte qual', opcoes: found.slice(0, 8).map((t) => t.name) };
        a = { ...a, id: found[0].id };
      }
      const { data, error } = await own.update('tasks', { completed: true, status: 'completed', completed_at: new Date().toISOString() }).eq('id', a.id).select('title');
      if (error) return fail(error);
      return data?.length ? { feito: `Tarefa concluída: ${data[0].title}` } : { erro: 'tarefa não encontrada' };
    }
    case 'criar_lembrete': {
      const { error } = await own.insert('reminders', { title: a.titulo, datetime: zonedToUtc(String(a.data), String(a.hora), tz) });
      return error ? fail(error) : { feito: `Lembrete: ${a.titulo}, ${String(a.data).split('-').reverse().join('/')} às ${a.hora}` };
    }
    case 'listar_habitos': {
      const [{ data: habits, error }, { data: done }] = await Promise.all([
        own.select('habits', 'id,name,habit_type,unit,target_value,schedule_days,frequency,times_per_week').eq('is_archived', false),
        own.select('habit_completions', 'habit_id,value').eq('completed_date', now.date),
      ]);
      if (error) return fail(error);
      return {
        habitos: (habits ?? []).filter((h) => dueToday(h, now)).map((h) => {
          const c = (done ?? []).find((x) => x.habit_id === h.id);
          return { id: h.id, nome: h.name, tipo: h.habit_type, meta: h.target_value, unidade: h.unit, feito_hoje: !!c && (h.target_value == null ? c.value > 0 : c.value >= h.target_value), valor_hoje: c?.value ?? 0 };
        }),
      };
    }
    case 'marcar_habito': {
      if (!a.id) {
        const { data: all } = await own.select('habits', 'id,name').eq('is_archived', false);
        const found = matchByName(all ?? [], String(a.nome));
        if (!found.length) return { erro: `nenhum hábito com "${a.nome}"` };
        if (found.length > 1) return { erro: 'mais de um hábito combina; pergunte qual', opcoes: found.slice(0, 8).map((h) => h.name) };
        a = { ...a, id: found[0].id };
      }
      const { data: h } = await own.select('habits', 'name,target_value').eq('id', a.id).maybeSingle();
      if (!h) return { erro: 'hábito não encontrado' };
      const value = a.valor ?? h.target_value ?? 1;
      const { error } = await own.upsert('habit_completions', { habit_id: a.id, completed_date: now.date, value }, { onConflict: 'habit_id,completed_date' });
      return error ? fail(error) : { feito: `Hábito marcado: ${h.name}` };
    }
    case 'resumo_financeiro': {
      const from = `${a.ano}-${String(a.mes).padStart(2, '0')}-01`;
      const to = addDays(Number(a.mes) === 12 ? `${Number(a.ano) + 1}-01-01` : `${a.ano}-${String(Number(a.mes) + 1).padStart(2, '0')}-01`, -1);
      const { data, error } = await own.select('transactions', 'type,amount,category,is_pending').gte('date', from).lte('date', to);
      if (error) return fail(error);
      const rows = data ?? [];
      const sum = (t: string) => Math.round(rows.filter((r) => r.type === t).reduce((s, r) => s + Number(r.amount), 0) * 100) / 100;
      const byCat = new Map<string, number>();
      for (const r of rows.filter((x) => x.type === 'expense')) byCat.set(r.category ?? 'Sem categoria', (byCat.get(r.category ?? 'Sem categoria') ?? 0) + Number(r.amount));
      return {
        mes: `${String(a.mes).padStart(2, '0')}/${a.ano}`, receitas: sum('income'), despesas: sum('expense'), saldo: Math.round((sum('income') - sum('expense')) * 100) / 100,
        pendentes: rows.filter((r) => r.is_pending).length,
        maiores_categorias: [...byCat].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([categoria, valor]) => ({ categoria, valor: Math.round(valor * 100) / 100 })),
        observacao: 'Regime de competência: conta pela data do lançamento.',
      };
    }
    case 'registrar_transacao': {
      const { error } = await own.insert('transactions', {
        description: a.descricao, amount: a.valor, type: a.tipo === 'receita' ? 'income' : 'expense', category: a.categoria, date: a.data ?? now.date,
      });
      const money = `R$ ${Number(a.valor).toFixed(2).replace('.', ',')}`;
      return error ? fail(error) : { feito: `${a.tipo === 'receita' ? 'Receita' : 'Gasto'} registrado: ${a.descricao}, ${money}` };
    }
    case 'buscar_notas': {
      const like = `%${String(a.texto).replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      const { data, error } = await own.select('knowledge_blocks', 'id,title,content_text').or(`title.ilike.${like},content_text.ilike.${like}`).limit(8);
      if (error) return fail(error);
      return { notas: (data ?? []).map((n) => ({ titulo: n.title, trecho: n.content_text.slice(0, 400) })) };
    }
    case 'criar_nota': {
      const texto = String(a.texto ?? '');
      const { error } = await own.insert('knowledge_blocks', { title: a.titulo, content: textToBlocks(texto), content_text: texto, source_type: 'assistant' });
      return error ? fail(error) : { feito: `Nota criada: ${a.titulo}` };
    }
    case 'listar_metas': {
      const [{ data: goals, error }, { data: entries }] = await Promise.all([
        own.select('goals', 'id,title,goal_type,unit,start_value,target_value,measure,target_date,linked_bank_id').eq('status', 'active'),
        own.select('goal_entries', 'goal_id,date,value').order('date'),
      ]);
      if (error) return fail(error);
      return {
        metas: (goals ?? []).map((g) => {
          const mine = (entries ?? []).filter((e) => e.goal_id === g.id);
          const manual = g.goal_type === 'custom' || (g.goal_type === 'financial' && !g.linked_bank_id);
          const atual = !manual ? null : g.measure === 'last' ? Number(mine.at(-1)?.value ?? g.start_value) : Number(g.start_value) + mine.reduce((s, e) => s + Number(e.value), 0);
          return { titulo: g.title, tipo: g.goal_type, atual, alvo: g.target_value, unidade: g.goal_type === 'financial' ? 'R$' : g.unit, prazo: g.target_date, observacao: manual ? undefined : 'valor calculado no app' };
        }),
      };
    }
    case 'listar_projetos': {
      const [{ data: projects, error }, { data: open }] = await Promise.all([
        own.select('projects', 'id,name,status,due_date').eq('is_template', false).is('archived_at', null).in('status', ['active', 'planning']),
        own.select('tasks', 'id').eq('completed', false),
      ]);
      if (error) return fail(error);
      const ids = (projects ?? []).map((p: { id: string }) => p.id);
      const { data: links } = ids.length ? await db.from('project_tasks').select('project_id,task_id').in('project_id', ids) : { data: [] };
      const openIds = new Set((open ?? []).map((t) => t.id));
      return {
        projetos: (projects ?? []).map((p) => ({
          nome: p.name, prazo: p.due_date, tarefas_abertas: (links ?? []).filter((l) => l.project_id === p.id && openIds.has(l.task_id)).length,
        })),
      };
    }
  }
  return { erro: 'ferramenta desconhecida' };
}
