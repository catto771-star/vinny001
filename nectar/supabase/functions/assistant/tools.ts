// The assistant's tools over a user's data. Every query is limited to that
// user explicitly (selects, updates and deletes filtered by user_id, inserts
// carrying it), so the same code is safe under row level security (chat) and
// with the service role (the autopilot's AI requests, where RLS does not apply).
import { addDays, localNow, textToBlocks, zonedToUtc, matchByName, type LocalNow, type ToolArgs, type UndoSpec } from './lib.ts';

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export type Db = SupabaseClient;

/** Table access for one user. */
export function scoped(db: Db, uid: string) {
  return {
    select: <C extends string>(table: string, cols: C) => db.from(table).select(cols).eq('user_id', uid),
    insert: (table: string, row: Record<string, unknown>) => db.from(table).insert({ ...row, user_id: uid }),
    update: (table: string, patch: Record<string, unknown>) => db.from(table).update(patch).eq('user_id', uid),
    upsert: (table: string, row: Record<string, unknown>, opts?: { onConflict?: string }) => db.from(table).upsert({ ...row, user_id: uid }, opts),
    delete: (table: string) => db.from(table).delete().eq('user_id', uid),
  };
}

/** A rich picture of the day + learned memories for the system prompt. */
export async function snapshot(db: Db, uid: string, now: LocalNow, tz: string) {
  const own = scoped(db, uid);
  const endToday = zonedToUtc(now.date, '23:59', tz);
  const startToday = zonedToUtc(now.date, '00:00', tz);
  const [
    { data: tasks },
    { data: habits },
    { data: goals },
    { data: events },
    { data: projects },
    { data: banks },
    { data: memories },
  ] = await Promise.all([
    own.select('tasks', 'title,due_date').eq('completed', false).eq('is_archived', false).not('due_date', 'is', null).lte('due_date', endToday).limit(40),
    own.select('habits', 'name,schedule_days,frequency').eq('is_archived', false),
    own.select('goals', 'title').eq('status', 'active').limit(10),
    own.select('events', 'title,start_at,all_day').gte('start_at', startToday).lte('start_at', endToday).order('start_at').limit(10),
    own.select('projects', 'name').eq('is_template', false).is('archived_at', null).in('status', ['active', 'planning']).limit(12),
    own.select('banks', 'name,currency').order('name').limit(10),
    own.select('assistant_memories', 'category,content').order('updated_at', { ascending: false }).limit(30),
  ]);
  const today = (tasks ?? []).filter((t) => t.due_date >= startToday);
  return {
    tasksToday: today.slice(0, 10).map((t) => t.title),
    tasksLate: (tasks ?? []).length - today.length,
    habitsToday: (habits ?? []).filter((h) => dueToday(h, now)).map((h) => h.name).slice(0, 15),
    goals: (goals ?? []).map((g) => g.title),
    eventsToday: (events ?? []).map((e) => e.all_day ? e.title : `${localNow(tz, new Date(e.start_at)).time} ${e.title}`),
    projects: (projects ?? []).map((p) => p.name),
    accounts: (banks ?? []).map((b) => ({ name: b.name, currency: b.currency ?? 'BRL' })),
    memories: (memories ?? []).map((m) => ({ category: m.category, content: m.content })),
  };
}

export function dueToday(h: { schedule_days: number[] | null; frequency?: string | null }, now: LocalNow) {
  return h.frequency === 'weekly' || !h.schedule_days?.length || h.schedule_days.includes(now.weekday);
}

const localDay = (iso: string, tz: string) => localNow(tz, new Date(iso)).date;
const PRIORITY_PT: Record<string, string> = { high: 'alta', medium: 'média', low: 'baixa' };
const CURRENCY_SYM: Record<string, string> = { BRL: 'R$', EUR: '€', USD: 'US$' };

async function fetchBrlRate(currency: 'EUR' | 'USD'): Promise<number | null> {
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${currency}&to=BRL`);
    if (!res.ok) return null;
    const data = await res.json();
    const rate = Number(data?.rates?.BRL);
    return Number.isFinite(rate) && rate > 0 ? Math.round(rate * 10000) / 10000 : null;
  } catch {
    return null;
  }
}

export interface ToolResult extends Record<string, unknown> {
  feito?: string;
  undo?: UndoSpec;
  erro?: string;
}

/** Runs one checked tool call for one user. Results are short and in Portuguese. */
export async function runTool(db: Db, uid: string, name: string, a: ToolArgs, now: LocalNow, tz: string): Promise<ToolResult> {
  const own = scoped(db, uid);
  const fail = (e: { message: string } | null): ToolResult => ({ erro: e?.message ?? 'falhou' });

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
      const hora = typeof a.hora === 'string' ? a.hora : null;
      const due = a.data ? zonedToUtc(String(a.data), hora ?? '23:59', tz) : null;
      const { data, error } = await own.insert('tasks', { title: a.titulo, priority: a.prioridade, due_date: due, due_all_day: !!due && !hora }).select('id');
      if (error) return fail(error);
      const id = data?.[0]?.id as string | undefined;
      let linked = '';
      if (id && typeof a.projeto === 'string') {
        const { data: projs } = await own.select('projects', 'id,name').eq('is_template', false).is('archived_at', null);
        const found = matchByName(projs ?? [], a.projeto);
        if (found.length === 1) {
          await db.from('project_tasks').insert({ project_id: found[0].id, task_id: id });
          linked = ` no projeto ${found[0].name}`;
        }
      }
      return {
        feito: `Tarefa criada: ${a.titulo}${a.data ? ` (${String(a.data).split('-').reverse().join('/')}${hora ? ` às ${hora}` : ''})` : ''}${linked}`,
        ...(id ? { undo: { table: 'tasks', op: 'delete', id } } : {}),
      };
    }

    case 'concluir_tarefa': {
      if (!a.id) {
        const { data: open } = await own.select('tasks', 'id,title').eq('completed', false).eq('is_archived', false).limit(500);
        const found = matchByName((open ?? []).map((t) => ({ id: t.id, name: t.title })), String(a.titulo));
        if (!found.length) return { erro: `nenhuma tarefa aberta com "${a.titulo}"` };
        if (found.length > 1) return { erro: 'mais de uma tarefa combina; pergunte qual', opcoes: found.slice(0, 8).map((t) => t.name) };
        a = { ...a, id: found[0].id };
      }
      const { data, error } = await own.update('tasks', { completed: true, status: 'completed', completed_at: new Date().toISOString() }).eq('id', a.id).select('id,title');
      if (error) return fail(error);
      return data?.length
        ? { feito: `Tarefa concluída: ${data[0].title}`, undo: { table: 'tasks', op: 'update', id: String(a.id), patch: { completed: false, status: 'pending', completed_at: null } } }
        : { erro: 'tarefa não encontrada' };
    }

    case 'reagendar_tarefa': {
      let id = a.id as string | null;
      let prevDue: string | null = null;
      let prevAllDay = true;
      let title = '';
      if (!id) {
        const { data: open } = await own.select('tasks', 'id,title,due_date,due_all_day').eq('completed', false).eq('is_archived', false).limit(500);
        const found = matchByName((open ?? []).map((t) => ({ id: t.id, name: t.title, due_date: t.due_date, due_all_day: t.due_all_day })), String(a.titulo));
        if (!found.length) return { erro: `nenhuma tarefa aberta com "${a.titulo}"` };
        if (found.length > 1) return { erro: 'mais de uma tarefa combina; pergunte qual', opcoes: found.slice(0, 8).map((t) => t.name) };
        id = found[0].id;
        prevDue = found[0].due_date;
        prevAllDay = found[0].due_all_day ?? true;
        title = found[0].name;
      } else {
        const { data: cur } = await own.select('tasks', 'title,due_date,due_all_day').eq('id', id).maybeSingle();
        if (!cur) return { erro: 'tarefa não encontrada' };
        prevDue = cur.due_date;
        prevAllDay = cur.due_all_day ?? true;
        title = cur.title;
      }
      const hora = typeof a.hora === 'string' ? a.hora : null;
      const due_date = zonedToUtc(String(a.data), hora ?? '23:59', tz);
      const { error } = await own.update('tasks', { due_date, due_all_day: !hora }).eq('id', id);
      if (error) return fail(error);
      return {
        feito: `Tarefa reagendada: ${title} → ${String(a.data).split('-').reverse().join('/')}${hora ? ` às ${hora}` : ''}`,
        undo: { table: 'tasks', op: 'update', id, patch: { due_date: prevDue, due_all_day: prevAllDay } },
      };
    }

    case 'criar_lembrete': {
      const { data, error } = await own.insert('reminders', { title: a.titulo, datetime: zonedToUtc(String(a.data), String(a.hora), tz) }).select('id');
      if (error) return fail(error);
      const id = data?.[0]?.id as string | undefined;
      return {
        feito: `Lembrete: ${a.titulo}, ${String(a.data).split('-').reverse().join('/')} às ${a.hora}`,
        ...(id ? { undo: { table: 'reminders', op: 'delete', id } } : {}),
      };
    }

    case 'listar_agenda': {
      const startIso = zonedToUtc(String(a.inicio), '00:00', tz);
      const endIso = zonedToUtc(String(a.fim), '23:59', tz);
      const [{ data: events, error }, { data: tasks }, { data: reminders }] = await Promise.all([
        own.select('events', 'id,title,start_at,end_at,all_day,location').gte('start_at', startIso).lte('start_at', endIso).order('start_at').limit(50),
        own.select('tasks', 'id,title,due_date,due_all_day').eq('completed', false).eq('is_archived', false).gte('due_date', startIso).lte('due_date', endIso).limit(50),
        own.select('reminders', 'id,title,datetime').eq('completed', false).gte('datetime', startIso).lte('datetime', endIso).limit(50),
      ]);
      if (error) return fail(error);
      return {
        compromissos: (events ?? []).map((e) => ({ id: e.id, titulo: e.title, dia: localDay(e.start_at, tz), hora: e.all_day ? null : localNow(tz, new Date(e.start_at)).time, local: e.location })),
        tarefas: (tasks ?? []).map((t) => ({ id: t.id, titulo: t.title, dia: localDay(t.due_date, tz), hora: t.due_all_day ? null : localNow(tz, new Date(t.due_date)).time })),
        lembretes: (reminders ?? []).map((r) => ({ id: r.id, titulo: r.title, dia: localDay(r.datetime, tz), hora: localNow(tz, new Date(r.datetime)).time })),
      };
    }

    case 'criar_compromisso': {
      const inicio = a.inicio ? String(a.inicio) : null;
      const fim = a.fim ? String(a.fim) : null;
      const all_day = !inicio;
      const start_at = zonedToUtc(String(a.data), inicio ?? '00:00', tz);
      const end_at = all_day ? null : fim ? zonedToUtc(String(a.data), fim, tz) : new Date(new Date(start_at).getTime() + 3600_000).toISOString();
      const { data, error } = await own.insert('events', {
        title: a.titulo, start_at, end_at, all_day, location: a.local, notes: a.observacoes,
      }).select('id');
      if (error) return fail(error);
      const id = data?.[0]?.id as string | undefined;
      return {
        feito: `Compromisso agendado: ${a.titulo} em ${String(a.data).split('-').reverse().join('/')}${inicio ? ` às ${inicio}` : ''}`,
        ...(id ? { undo: { table: 'events', op: 'delete', id } } : {}),
      };
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
      const [{ data: h }, { data: prev }] = await Promise.all([
        own.select('habits', 'name,target_value').eq('id', a.id).maybeSingle(),
        own.select('habit_completions', 'id,value').eq('habit_id', a.id).eq('completed_date', now.date).maybeSingle(),
      ]);
      if (!h) return { erro: 'hábito não encontrado' };
      const value = a.valor ?? h.target_value ?? 1;
      const { data, error } = await own.upsert('habit_completions', { habit_id: a.id, completed_date: now.date, value }, { onConflict: 'habit_id,completed_date' }).select('id');
      if (error) return fail(error);
      const cid = (data?.[0]?.id ?? prev?.id) as string | undefined;
      return {
        feito: `Hábito marcado: ${h.name}`,
        ...(cid ? {
          undo: prev
            ? { table: 'habit_completions', op: 'update', id: cid, patch: { value: prev.value } }
            : { table: 'habit_completions', op: 'delete', id: cid },
        } : {}),
      };
    }

    case 'listar_contas': {
      const { data, error } = await own.select('banks', 'id,name,currency,initial_balance').order('name');
      if (error) return fail(error);
      return { contas: (data ?? []).map((b) => ({ id: b.id, nome: b.name, moeda: b.currency ?? 'BRL', saldo_inicial: b.initial_balance })) };
    }

    case 'resumo_financeiro': {
      const from = `${a.ano}-${String(a.mes).padStart(2, '0')}-01`;
      const to = addDays(Number(a.mes) === 12 ? `${Number(a.ano) + 1}-01-01` : `${a.ano}-${String(Number(a.mes) + 1).padStart(2, '0')}-01`, -1);
      const { data, error } = await own.select('transactions', 'type,amount,currency,original_amount,category,is_pending').gte('date', from).lte('date', to);
      if (error) return fail(error);
      const rows = data ?? [];
      const sum = (t: string) => Math.round(rows.filter((r) => r.type === t).reduce((s, r) => s + Number(r.amount), 0) * 100) / 100;
      const byCat = new Map<string, number>();
      for (const r of rows.filter((x) => x.type === 'expense')) byCat.set(r.category ?? 'Sem categoria', (byCat.get(r.category ?? 'Sem categoria') ?? 0) + Number(r.amount));
      return {
        mes: `${String(a.mes).padStart(2, '0')}/${a.ano}`, receitas_brl: sum('income'), despesas_brl: sum('expense'), saldo_brl: Math.round((sum('income') - sum('expense')) * 100) / 100,
        pendentes: rows.filter((r) => r.is_pending).length,
        maiores_categorias: [...byCat].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([categoria, valor]) => ({ categoria, valor_brl: Math.round(valor * 100) / 100 })),
        observacao: 'Valores totais consolidados em BRL (regime de competência).',
      };
    }

    case 'registrar_transacao': {
      let bankId: string | null = null;
      let bankName = '';
      let currency = typeof a.moeda === 'string' ? a.moeda : 'BRL';
      if (typeof a.conta === 'string') {
        const { data: banks } = await own.select('banks', 'id,name,currency');
        const found = matchByName(banks ?? [], a.conta);
        if (found.length === 1) {
          bankId = found[0].id;
          bankName = found[0].name;
          if (!a.moeda && found[0].currency) currency = found[0].currency;
        }
      }
      const rawVal = Number(a.valor);
      let fxRate: number | null = null;
      let amountBrl = rawVal;
      if (currency !== 'BRL') {
        fxRate = typeof a.cotacao === 'number' ? a.cotacao : await fetchBrlRate(currency as 'EUR' | 'USD');
        if (!fxRate) return { erro: `não consegui obter a cotação de ${currency} agora; informe o parâmetro cotacao` };
        amountBrl = Math.round(rawVal * fxRate * 100) / 100;
      }
      const { data, error } = await own.insert('transactions', {
        description: a.descricao,
        amount: amountBrl,
        currency,
        original_amount: currency === 'BRL' ? null : rawVal,
        fx_rate: fxRate,
        type: a.tipo === 'receita' ? 'income' : 'expense',
        category: a.categoria,
        date: a.data ?? now.date,
        bank_id: bankId,
        payment_method: 'debito',
      }).select('id');
      if (error) return fail(error);
      const id = data?.[0]?.id as string | undefined;
      const money = `${CURRENCY_SYM[currency] ?? currency} ${rawVal.toFixed(2).replace('.', ',')}`;
      return {
        feito: `${a.tipo === 'receita' ? 'Receita' : 'Gasto'} registrado: ${a.descricao}, ${money}${bankName ? ` (${bankName})` : ''}`,
        ...(id ? { undo: { table: 'transactions', op: 'delete', id } } : {}),
      };
    }

    case 'buscar_notas': {
      const like = `%${String(a.texto).replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      const { data, error } = await own.select('knowledge_blocks', 'id,title,content_text').or(`title.ilike.${like},content_text.ilike.${like}`).limit(8);
      if (error) return fail(error);
      return { notas: (data ?? []).map((n) => ({ titulo: n.title, trecho: n.content_text.slice(0, 400) })) };
    }

    case 'criar_nota': {
      const texto = String(a.texto ?? '');
      const { data, error } = await own.insert('knowledge_blocks', { title: a.titulo, content: textToBlocks(texto), content_text: texto, source_type: 'assistant' }).select('id');
      if (error) return fail(error);
      const id = data?.[0]?.id as string | undefined;
      return {
        feito: `Nota criada: ${a.titulo}`,
        ...(id ? { undo: { table: 'knowledge_blocks', op: 'delete', id } } : {}),
      };
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
          return { id: g.id, titulo: g.title, tipo: g.goal_type, atual, alvo: g.target_value, unidade: g.goal_type === 'financial' ? 'R$' : g.unit, prazo: g.target_date, observacao: manual ? undefined : 'valor calculado no app' };
        }),
      };
    }

    case 'registrar_progresso_meta': {
      let goalId = a.id as string | null;
      let goalTitle = '';
      if (!goalId) {
        const { data: goals } = await own.select('goals', 'id,title').eq('status', 'active');
        const found = matchByName((goals ?? []).map((g) => ({ id: g.id, name: g.title })), String(a.titulo));
        if (!found.length) return { erro: `nenhuma meta ativa com "${a.titulo}"` };
        if (found.length > 1) return { erro: 'mais de uma meta combina; pergunte qual', opcoes: found.slice(0, 8).map((g) => g.name) };
        goalId = found[0].id;
        goalTitle = found[0].name;
      } else {
        const { data: g } = await own.select('goals', 'title').eq('id', goalId).maybeSingle();
        if (!g) return { erro: 'meta não encontrada' };
        goalTitle = g.title;
      }
      const { data, error } = await own.insert('goal_entries', { goal_id: goalId, value: a.valor, date: a.data ?? now.date, note: a.nota }).select('id');
      if (error) return fail(error);
      const id = data?.[0]?.id as string | undefined;
      return {
        feito: `Progresso registrado em ${goalTitle}: ${a.valor}`,
        ...(id ? { undo: { table: 'goal_entries', op: 'delete', id } } : {}),
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
          id: p.id, nome: p.name, prazo: p.due_date, tarefas_abertas: (links ?? []).filter((l) => l.project_id === p.id && openIds.has(l.task_id)).length,
        })),
      };
    }

    case 'criar_marco_projeto': {
      const { data: projs } = await own.select('projects', 'id,name').eq('is_template', false).is('archived_at', null);
      const found = matchByName(projs ?? [], String(a.projeto));
      if (!found.length) return { erro: `nenhum projeto com "${a.projeto}"` };
      if (found.length > 1) return { erro: 'mais de um projeto combina; pergunte qual', opcoes: found.slice(0, 8).map((p) => p.name) };
      const { data, error } = await own.insert('project_steps', {
        project_id: found[0].id, title: a.titulo, due_date: a.prazo, completed: false,
      }).select('id');
      if (error) return fail(error);
      const id = data?.[0]?.id as string | undefined;
      return {
        feito: `Etapa adicionada em ${found[0].name}: ${a.titulo}`,
        link: `/projetos?p=${found[0].id}`,
        ...(id ? { undo: { table: 'project_steps', op: 'delete', id } } : {}),
      };
    }

    case 'criar_plano_projeto': {
      const { data: projs } = await own.select('projects', 'id,name').eq('is_template', false).is('archived_at', null);
      const list = projs ?? [];
      const byId = list.find((p) => p.id === String(a.projeto));
      const found = byId ? [byId] : matchByName(list, String(a.projeto));
      if (!found.length) return { erro: `nenhum projeto com "${a.projeto}"` };
      if (found.length > 1) return { erro: 'mais de um projeto combina; pergunte qual', opcoes: found.slice(0, 8).map((p) => p.name) };
      const proj = found[0];
      const { data: existingSteps } = await own.select('project_steps', 'order_index').eq('project_id', proj.id);
      let order = (existingSteps ?? []).reduce((m, s) => Math.max(m, Number(s.order_index ?? 0)), -1) + 1;
      const etapas = a.etapas as { titulo: string; prazo: string | null; subetapas: string[] }[];
      let createdSteps = 0;
      let createdSubsteps = 0;
      for (const et of etapas) {
        const { data: stepRows, error: stepErr } = await own.insert('project_steps', {
          project_id: proj.id, title: et.titulo, due_date: et.prazo, completed: false, order_index: order++,
        }).select('id');
        if (stepErr) return fail(stepErr);
        const stepId = stepRows?.[0]?.id as string | undefined;
        createdSteps += 1;
        for (const subTitle of et.subetapas) {
          const { data: taskRows, error: taskErr } = await own.insert('tasks', {
            title: subTitle,
            priority: 'medium',
            due_date: et.prazo ? zonedToUtc(et.prazo, '23:59', tz) : null,
            due_all_day: !!et.prazo,
            project_step_id: stepId ?? null,
          }).select('id');
          if (taskErr) return fail(taskErr);
          const taskId = taskRows?.[0]?.id as string | undefined;
          if (taskId) {
            await db.from('project_tasks').insert({ project_id: proj.id, task_id: taskId });
            createdSubsteps += 1;
          }
        }
      }
      return {
        feito: `Plano criado em ${proj.name}: ${createdSteps} ${createdSteps === 1 ? 'etapa' : 'etapas'}${createdSubsteps ? ` e ${createdSubsteps} ${createdSubsteps === 1 ? 'subetapa' : 'subetapas'}` : ''}`,
        link: `/projetos?p=${proj.id}`,
      };
    }

    case 'concluir_marco_projeto': {
      const { data: projs } = await own.select('projects', 'id,name').eq('is_template', false).is('archived_at', null);
      const foundProj = matchByName(projs ?? [], String(a.projeto));
      if (!foundProj.length) return { erro: `nenhum projeto com "${a.projeto}"` };
      if (foundProj.length > 1) return { erro: 'mais de um projeto combina; pergunte qual', opcoes: foundProj.slice(0, 8).map((p) => p.name) };
      const proj = foundProj[0];
      const { data: steps } = await own.select('project_steps', 'id,title').eq('project_id', proj.id).eq('completed', false);
      const foundStep = matchByName((steps ?? []).map((s) => ({ id: s.id, name: s.title })), String(a.titulo));
      if (!foundStep.length) return { erro: `nenhuma etapa aberta com "${a.titulo}" em ${proj.name}` };
      if (foundStep.length > 1) return { erro: 'mais de uma etapa combina; pergunte qual', opcoes: foundStep.slice(0, 8).map((s) => s.name) };
      const step = foundStep[0];
      const { error } = await own.update('project_steps', { completed: true, completed_at: new Date().toISOString() }).eq('id', step.id);
      if (error) return fail(error);
      return {
        feito: `Etapa concluída em ${proj.name}: ${step.name}`,
        link: `/projetos?p=${proj.id}`,
        undo: { table: 'project_steps', op: 'update', id: step.id, patch: { completed: false, completed_at: null } },
      };
    }

    case 'registrar_refeicao': {
      const { data, error } = await own.insert('food_logs', {
        date: a.data ?? now.date,
        meal: a.meal,
        food_name: a.alimento,
        quantity_g: a.quantidade_g,
        kcal: a.kcal,
        protein_g: a.proteina_g,
        carbs_g: a.carbo_g,
        fat_g: a.gordura_g,
        fiber_g: 0,
      }).select('id');
      if (error) return fail(error);
      const id = data?.[0]?.id as string | undefined;
      return {
        feito: `Refeição registrada: ${a.alimento} (${a.kcal} kcal)`,
        link: '/saude',
        ...(id ? { undo: { table: 'food_logs', op: 'delete', id } } : {}),
      };
    }

    case 'registrar_peso': {
      const { data, error } = await own.insert('body_measurements', {
        measured_at: new Date().toISOString(),
        metric: 'weight_kg',
        value: a.peso_kg,
        source: 'assistant',
        notes: a.observacoes,
      }).select('id');
      if (error) return fail(error);
      const id = data?.[0]?.id as string | undefined;
      return {
        feito: `Peso registrado: ${String(a.peso_kg).replace('.', ',')} kg`,
        link: '/saude',
        ...(id ? { undo: { table: 'body_measurements', op: 'delete', id } } : {}),
      };
    }

    case 'registrar_treino': {
      const { data, error } = await own.insert('workouts', {
        date: a.data ?? now.date,
        title: a.titulo,
        duration_min: a.duracao_min,
        notes: a.notas,
      }).select('id');
      if (error) return fail(error);
      const id = data?.[0]?.id as string | undefined;
      return {
        feito: `Treino registrado: ${a.titulo}${a.duracao_min ? ` (${a.duracao_min} min)` : ''}`,
        link: '/saude',
        ...(id ? { undo: { table: 'workouts', op: 'delete', id } } : {}),
      };
    }

    case 'registrar_cardio': {
      const durMin = Number(a.duracao_min);
      const { data, error } = await own.insert('cardio_sessions', {
        date: a.data ?? now.date,
        cardio_type: a.tipo,
        duration_s: durMin * 60,
        distance_km: a.distancia_km,
        kcal: a.kcal,
        notes: a.notas,
      }).select('id');
      if (error) return fail(error);
      const id = data?.[0]?.id as string | undefined;
      return {
        feito: `Cardio registrado: ${a.tipo}, ${durMin} min${a.distancia_km ? ` · ${String(a.distancia_km).replace('.', ',')} km` : ''}`,
        link: '/saude',
        ...(id ? { undo: { table: 'cardio_sessions', op: 'delete', id } } : {}),
      };
    }

    case 'resumo_saude_hoje': {
      const day = String(a.data ?? now.date);
      const [{ data: logs, error }, { data: workouts }, { data: cardio }, { data: weights }] = await Promise.all([
        own.select('food_logs', 'meal,food_name,kcal,protein_g,carbs_g,fat_g').eq('date', day),
        own.select('workouts', 'title,duration_min').eq('date', day),
        own.select('cardio_sessions', 'cardio_type,duration_s,distance_km,kcal').eq('date', day),
        own.select('body_measurements', 'value,measured_at').eq('metric', 'weight_kg').order('measured_at', { ascending: false }).limit(1),
      ]);
      if (error) return fail(error);
      const rows = logs ?? [];
      const sum = (k: 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g') => Math.round(rows.reduce((s, r) => s + Number(r[k] ?? 0), 0) * 10) / 10;
      return {
        data: day,
        peso_atual_kg: weights?.[0]?.value ?? null,
        alimentacao: {
          registros: rows.length,
          kcal: Math.round(sum('kcal')),
          proteina_g: sum('protein_g'),
          carbo_g: sum('carbo_g'),
          gordura_g: sum('fat_g'),
        },
        treinos: (workouts ?? []).map((w) => ({ titulo: w.title ?? 'Treino', duracao_min: w.duration_min })),
        cardio: (cardio ?? []).map((c) => ({ tipo: c.cardio_type, duracao_min: Math.round(Number(c.duration_s) / 60), distancia_km: c.distance_km, kcal: c.kcal })),
      };
    }

    case 'registrar_transferencia': {
      const { data: banks, error: bErr } = await own.select('banks', 'id,name,currency');
      if (bErr) return fail(bErr);
      const list = banks ?? [];
      const fromMatches = matchByName(list, String(a.origem));
      const toMatches = matchByName(list, String(a.destino));
      if (!fromMatches.length) return { erro: `conta de origem não encontrada: "${a.origem}"` };
      if (!toMatches.length) return { erro: `conta de destino não encontrada: "${a.destino}"` };
      if (fromMatches[0].id === toMatches[0].id) return { erro: 'as contas de origem e destino devem ser diferentes' };
      const currency = typeof a.moeda === 'string' ? a.moeda : (fromMatches[0].currency ?? 'BRL');
      const rawVal = Number(a.valor);
      let amountBrl = rawVal;
      if (currency !== 'BRL') {
        const rate = typeof a.cotacao === 'number' ? a.cotacao : await fetchBrlRate(currency as 'EUR' | 'USD');
        if (!rate) return { erro: `não consegui obter a cotação de ${currency} agora; informe cotacao` };
        amountBrl = Math.round(rawVal * rate * 100) / 100;
      }
      const { data, error } = await own.insert('transfers', {
        from_bank_id: fromMatches[0].id,
        to_bank_id: toMatches[0].id,
        amount: amountBrl,
        date: a.data ?? now.date,
        description: a.descricao ?? `Transferência ${fromMatches[0].name} → ${toMatches[0].name}`,
      }).select('id');
      if (error) return fail(error);
      const id = data?.[0]?.id as string | undefined;
      const moneyStr = `${CURRENCY_SYM[currency] ?? currency} ${rawVal.toFixed(2).replace('.', ',')}`;
      return {
        feito: `Transferência registrada: ${moneyStr} de ${fromMatches[0].name} para ${toMatches[0].name}`,
        link: '/financas',
        ...(id ? { undo: { table: 'transfers', op: 'delete', id } } : {}),
      };
    }

    case 'definir_orcamento': {
      const { data, error } = await own.upsert('category_budgets', {
        category: a.categoria,
        monthly_limit: a.limite,
        currency: a.moeda ?? 'BRL',
      }, { onConflict: 'user_id,category' }).select('id');
      if (error) return fail(error);
      const id = data?.[0]?.id as string | undefined;
      const sym = CURRENCY_SYM[String(a.moeda ?? 'BRL')] ?? 'R$';
      return {
        feito: `Limite definido para ${a.categoria}: ${sym} ${Number(a.limite).toFixed(2).replace('.', ',')}/mês`,
        link: '/financas',
        ...(id ? { undo: { table: 'category_budgets', op: 'delete', id } } : {}),
      };
    }

    case 'concluir_lembrete': {
      const { data: open } = await own.select('reminders', 'id,title').eq('completed', false).limit(200);
      const found = matchByName((open ?? []).map((r) => ({ id: r.id, name: r.title })), String(a.titulo));
      if (!found.length) return { erro: `nenhum lembrete aberto com "${a.titulo}"` };
      if (found.length > 1) return { erro: 'mais de um lembrete combina; pergunte qual', opcoes: found.slice(0, 8).map((r) => r.name) };
      const { error } = await own.update('reminders', { completed: true }).eq('id', found[0].id);
      if (error) return fail(error);
      return {
        feito: `Lembrete concluído: ${found[0].name}`,
        link: '/lembretes',
        undo: { table: 'reminders', op: 'update', id: found[0].id, patch: { completed: false } },
      };
    }

    case 'reagendar_compromisso': {
      const { data: evs } = await own.select('events', 'id,title,start_at,end_at,all_day').order('start_at', { ascending: false }).limit(200);
      const found = matchByName((evs ?? []).map((e) => ({ id: e.id, name: e.title, start_at: e.start_at, end_at: e.end_at, all_day: e.all_day })), String(a.titulo));
      if (!found.length) return { erro: `nenhum compromisso encontrado com "${a.titulo}"` };
      if (found.length > 1) return { erro: 'mais de um compromisso combina; pergunte qual', opcoes: found.slice(0, 8).map((e) => e.name) };
      const ev = found[0];
      const inicio = a.inicio ? String(a.inicio) : null;
      const fim = a.fim ? String(a.fim) : null;
      const all_day = !inicio;
      const start_at = zonedToUtc(String(a.data), inicio ?? '00:00', tz);
      const end_at = all_day ? null : fim ? zonedToUtc(String(a.data), fim, tz) : new Date(new Date(start_at).getTime() + 3600_000).toISOString();
      const { error } = await own.update('events', { start_at, end_at, all_day }).eq('id', ev.id);
      if (error) return fail(error);
      return {
        feito: `Compromisso reagendado: ${ev.name} → ${String(a.data).split('-').reverse().join('/')}${inicio ? ` às ${inicio}` : ''}`,
        link: '/agenda',
        undo: { table: 'events', op: 'update', id: ev.id, patch: { start_at: ev.start_at, end_at: ev.end_at, all_day: ev.all_day } },
      };
    }

    case 'listar_memorias': {
      const { data, error } = await own.select('assistant_memories', 'id,category,content,source,updated_at').order('updated_at', { ascending: false }).limit(50);
      if (error) return fail(error);
      return { memorias: (data ?? []).map((m) => ({ id: m.id, categoria: m.category, conteudo: m.content })) };
    }

    case 'salvar_memoria': {
      const content = String(a.conteudo);
      const { data: existing } = await own.select('assistant_memories', 'id,content').limit(60);
      const dup = matchByName((existing ?? []).map((m) => ({ id: m.id, name: m.content })), content);
      if (dup.length === 1 && dup[0].name.toLowerCase() === content.toLowerCase()) {
        return { feito: `Já estava na memória: ${content}` };
      }
      const { data, error } = await own.insert('assistant_memories', {
        category: a.categoria,
        content,
        source: 'assistant',
      }).select('id');
      if (error) return fail(error);
      const id = data?.[0]?.id as string | undefined;
      return {
        feito: `Aprendido: ${content}`,
        ...(id ? { undo: { table: 'assistant_memories', op: 'delete', id } } : {}),
      };
    }

    case 'esquecer_memoria': {
      let id = a.id as string | null;
      let removedText = '';
      if (!id) {
        const { data: all } = await own.select('assistant_memories', 'id,content').limit(60);
        const found = matchByName((all ?? []).map((m) => ({ id: m.id, name: m.content })), String(a.trecho));
        if (!found.length) return { erro: `nenhuma memória encontrada com "${a.trecho}"` };
        id = found[0].id;
        removedText = found[0].name;
      }
      const { error } = await own.delete('assistant_memories').eq('id', id);
      if (error) return fail(error);
      return { feito: `Memória removida${removedText ? `: ${removedText}` : ''}` };
    }
  }
  return { erro: 'ferramenta desconhecida' };
}
