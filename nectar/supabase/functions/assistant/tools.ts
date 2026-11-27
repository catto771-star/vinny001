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

import { ORACLE_NUTRIENT_ALIASES } from './lib.ts';

interface RawFoodRow {
  id?: string;
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number | null;
  default_serving_g?: number | null;
  nutrients?: Record<string, number> | null;
}

const REF_PROFILES: { test: RegExp; vals: Record<string, number> }[] = [
  { test: /\b(ovo|ovos|gema)\b/i, vals: { vit_a_ug: 160, vit_d_ug: 2.0, vit_b12_ug: 1.1, folate_ug: 47, choline_mg: 294, calcium_mg: 56, iron_mg: 1.75, magnesium_mg: 12, phosphorus_mg: 198, potassium_mg: 138, sodium_mg: 142, zinc_mg: 1.29, selenium_ug: 30.7, omega3_g: 0.1 } },
  { test: /\b(frango|peito de frango|peru)\b/i, vals: { vit_b6_mg: 0.6, vit_b12_ug: 0.34, choline_mg: 85, iron_mg: 1.0, magnesium_mg: 29, phosphorus_mg: 228, potassium_mg: 256, sodium_mg: 74, zinc_mg: 1.0, selenium_ug: 27.6 } },
  { test: /\b(patinho|acem|alcatra|carne|bife|file mignon|figado|costela)\b/i, vals: { vit_b6_mg: 0.5, vit_b12_ug: 2.6, choline_mg: 95, iron_mg: 2.7, magnesium_mg: 24, phosphorus_mg: 215, potassium_mg: 340, sodium_mg: 65, zinc_mg: 5.3, copper_mg: 0.1, selenium_ug: 26 } },
  { test: /\b(salmao|sardinha|atum|tilapia|peixe|bacalhau)\b/i, vals: { vit_d_ug: 11, vit_b12_ug: 3.2, choline_mg: 90, calcium_mg: 60, iron_mg: 1.1, magnesium_mg: 30, phosphorus_mg: 250, potassium_mg: 380, sodium_mg: 90, zinc_mg: 0.8, selenium_ug: 40, omega3_g: 2.1 } },
  { test: /\b(leite|iogurte|kefir|queijo|requeijao|cottage|ricota)\b/i, vals: { vit_a_ug: 95, vit_d_ug: 1.0, vit_b12_ug: 0.9, choline_mg: 28, calcium_mg: 280, magnesium_mg: 18, phosphorus_mg: 210, potassium_mg: 165, sodium_mg: 180, zinc_mg: 1.2, selenium_ug: 8 } },
  { test: /\b(espinafre|couve|brocolis|rucula|agriao)\b/i, vals: { vit_a_ug: 380, vit_c_mg: 65, vit_k_ug: 280, folate_ug: 140, calcium_mg: 105, iron_mg: 2.4, magnesium_mg: 55, potassium_mg: 460, sodium_mg: 45, zinc_mg: 0.5 } },
  { test: /\b(banana|abacate|mamao|laranja|morango|kiwi|manga|maca)\b/i, vals: { vit_a_ug: 45, vit_c_mg: 42, folate_ug: 28, calcium_mg: 16, iron_mg: 0.35, magnesium_mg: 26, potassium_mg: 340, sodium_mg: 3 } },
  { test: /\b(feijao|lentilha|grao de bico|soja|ervilha)\b/i, vals: { folate_ug: 160, calcium_mg: 45, iron_mg: 2.9, magnesium_mg: 52, phosphorus_mg: 145, potassium_mg: 380, sodium_mg: 12, zinc_mg: 1.3, copper_mg: 0.3 } },
  { test: /\b(aveia|quinoa|arroz integral|pao integral|granola)\b/i, vals: { vit_b6_mg: 0.15, folate_ug: 45, iron_mg: 3.4, magnesium_mg: 125, phosphorus_mg: 330, potassium_mg: 310, zinc_mg: 2.6, copper_mg: 0.4, selenium_ug: 24 } },
  { test: /\b(castanha|amendoa|nozes|amendoim|chia|linhaca|gergelim)\b/i, vals: { vit_e_mg: 12, folate_ug: 65, calcium_mg: 180, iron_mg: 4.2, magnesium_mg: 260, phosphorus_mg: 460, potassium_mg: 650, zinc_mg: 3.5, copper_mg: 1.1, selenium_ug: 95, omega3_g: 3.5 } },
  { test: /\b(batata|mandioca|inhame|abobora)\b/i, vals: { vit_a_ug: 220, vit_c_mg: 16, vit_b6_mg: 0.25, folate_ug: 18, magnesium_mg: 24, potassium_mg: 410, sodium_mg: 20 } },
];

function foodMicronutrientsPer100g(food: RawFoodRow): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of REF_PROFILES) {
    if (p.test.test(food.name)) {
      Object.assign(out, p.vals);
      break;
    }
  }
  if (food.nutrients && typeof food.nutrients === 'object') {
    for (const [k, v] of Object.entries(food.nutrients)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    }
  }
  return out;
}

function foodNutrientPer100g(food: RawFoodRow, key: string): number {
  if (key === 'protein_g') return Number(food.protein_g ?? 0);
  if (key === 'fiber_g') return Number(food.fiber_g ?? 0);
  return Number(foodMicronutrientsPer100g(food)[key] ?? 0);
}

function rankOracleFoods(foods: RawFoodRow[], key: string, mode: string, limit: number) {
  return foods
    .map((food) => {
      const per100g = Math.round(foodNutrientPer100g(food, key) * 100) / 100;
      const kcal = Math.max(Number(food.kcal ?? 0), 1);
      const per100kcal = Math.round(((per100g / kcal) * 100) * 100) / 100;
      const score = mode === 'por_100g' ? per100g : mode === 'por_100kcal' ? per100kcal : Math.sqrt(per100g * Math.max(per100kcal, 0.01));
      return { food, per100g, per100kcal, score };
    })
    .filter((x) => x.per100g > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
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
      const day = String(a.data ?? now.date);
      const modalidade = String(a.modalidade ?? 'musculacao');
      const modMet: Record<string, number> = { musculacao: 5.0, calistenia: 5.5, funcional: 7.4, mobilidade: 3.0, esporte: 6.8, outro: 4.8 };
      const exercicios = Array.isArray(a.exercicios)
        ? (a.exercicios as { nome: string; series: number; reps: number; carga_kg: number; rpe: number | null; superset: string | null }[])
        : [];

      const totalSetsCount = exercicios.reduce((sum, ex) => sum + ex.series, 0);
      const inferredDur = a.duracao_min != null ? Number(a.duracao_min) : (totalSetsCount > 0 ? Math.max(15, Math.round((totalSetsCount * 135) / 60)) : 45);
      const { data: weights } = await own.select('body_measurements', 'value').eq('metric', 'weight_kg').order('measured_at', { ascending: false }).limit(1);
      const weightKg = Number(weights?.[0]?.value ?? 75);
      const tonnage = exercicios.reduce((sum, ex) => sum + ex.series * ex.reps * ex.carga_kg, 0);
      const estKcal = a.kcal != null
        ? Number(a.kcal)
        : Math.round((modMet[modalidade] ?? 5.0) * weightKg * (inferredDur / 60) + Math.min(90, tonnage * 0.004));

      const noteTags: string[] = [];
      if (modalidade !== 'musculacao') noteTags.push(`[mod:${modalidade}]`);
      if (a.kcal != null) noteTags.push(`[kcal:${Math.round(Number(a.kcal))}]`);
      if (a.notas) noteTags.push(String(a.notas));

      const { data, error } = await own.insert('workouts', {
        date: day,
        title: a.titulo,
        duration_min: a.duracao_min ?? (totalSetsCount > 0 ? inferredDur : null),
        notes: noteTags.join(' ').trim() || null,
      }).select('id');
      if (error) return fail(error);
      const id = data?.[0]?.id as string | undefined;

      // Insert detailed sets if exercicios were provided
      if (id && exercicios.length > 0) {
        const [{ data: catalogEx }, { data: setTypes }] = await Promise.all([
          db.from('exercises').select('id,name').or(`user_id.is.null,user_id.eq.${uid}`).limit(300),
          db.from('set_types').select('id,name,drives_progression').or(`user_id.is.null,user_id.eq.${uid}`).limit(20),
        ]);
        const workTypeId = ((setTypes ?? []) as { id: string; drives_progression?: boolean }[]).find((t) => t.drives_progression)?.id ?? (setTypes?.[0] as { id?: string } | undefined)?.id;
        let pos = 0;
        if (workTypeId) {
          for (const ex of exercicios) {
            const matched = matchByName((catalogEx ?? []) as { id: string; name: string }[], ex.nome);
            let exId = matched[0]?.id;
            if (!exId) {
              const { data: created } = await own.insert('exercises', { name: ex.nome, muscle_group: 'corpo_inteiro' }).select('id');
              exId = created?.[0]?.id as string | undefined;
            }
            if (!exId) continue;
            for (let sIdx = 0; sIdx < ex.series; sIdx++) {
              await own.insert('workout_sets', {
                workout_id: id,
                exercise_id: exId,
                set_type_id: workTypeId,
                position: pos++,
                load_kg: ex.carga_kg,
                reps: ex.reps,
                rest_s: 90,
                effort: ex.rpe,
                notes: ex.superset ? `[ss:${ex.superset}]` : null,
              });
            }
          }
        }
      }

      // Cross-module: auto-mark matching training habit on `day`
      const { data: habits } = await own.select('habits', 'id,name,target_value').eq('is_archived', false);
      const habitKw = ['treino', 'treinar', 'academia', 'musculacao', 'exercicio', 'calistenia', 'funcional'];
      const matchedHabit = (habits ?? []).find((hb: { name: string }) => {
        const norm = hb.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        return habitKw.some((k) => norm.includes(k));
      });
      if (matchedHabit) {
        await own.upsert(
          'habit_completions',
          { habit_id: matchedHabit.id, completed_date: day, value: matchedHabit.target_value ?? 1 },
          { onConflict: 'habit_id,completed_date' },
        );
      }

      return {
        feito: `Treino registrado: ${a.titulo} (~${estKcal} kcal${totalSetsCount ? ` · ${totalSetsCount} séries` : ''}${matchedHabit ? ` · hábito "${matchedHabit.name}" sincronizado` : ''})`,
        kcal_estimadas: estKcal,
        link: '/saude?aba=Treino',
        ...(id ? { undo: { table: 'workouts', op: 'delete', id } } : {}),
      };
    }

    case 'gerar_rotina_treino': {
      const { data: activePlans } = await own.select('workout_plans', 'id,name').eq('is_active', true).limit(1);
      let planId = activePlans?.[0]?.id as string | undefined;
      if (!planId) {
        const { data: createdPlan, error: pErr } = await own.insert('workout_plans', { name: 'Minha ficha', is_active: true }).select('id');
        if (pErr) return fail(pErr);
        planId = createdPlan?.[0]?.id as string | undefined;
      }
      if (!planId) return { erro: 'não foi possível localizar ou criar a ficha ativa' };

      const { data: existingSessions } = await own.select('workout_plan_sessions', 'id,order_index').eq('plan_id', planId);
      const nextOrder = (existingSessions ?? []).reduce((m: number, s: { order_index?: number }) => Math.max(m, Number(s.order_index ?? 0)), -1) + 1;

      const noteParts: string[] = [];
      if (a.pasta) noteParts.push(`[pasta:${String(a.pasta).trim()}]`);
      if (a.observacoes) noteParts.push(String(a.observacoes).trim());

      const { data: sessRows, error: sErr } = await own.insert('workout_plan_sessions', {
        plan_id: planId,
        label: a.nome_rotina,
        weekdays: a.dias_semana ?? [],
        order_index: nextOrder,
        notes: noteParts.join(' ').trim() || null,
      }).select('id');
      if (sErr) return fail(sErr);
      const sessionId = sessRows?.[0]?.id as string | undefined;
      if (!sessionId) return { erro: 'falha ao criar rotina na ficha' };

      const { data: catalogEx } = await db.from('exercises').select('id,name,muscle_group').or(`user_id.is.null,user_id.eq.${uid}`).limit(300);
      const specs = a.exercicios as { nome: string; series: number; reps: string; carga_kg: number | null; descanso_s: number; superset: string | null; nota: string | null }[];
      let addedCount = 0;
      let estTotalSec = 0;

      for (let idx = 0; idx < specs.length; idx++) {
        const sp = specs[idx];
        const matched = matchByName((catalogEx ?? []) as { id: string; name: string; muscle_group?: string }[], sp.nome);
        let exId = matched[0]?.id;
        let exName = matched[0]?.name ?? sp.nome;
        if (!exId) {
          const { data: created } = await own.insert('exercises', { name: sp.nome, muscle_group: 'corpo_inteiro' }).select('id');
          exId = created?.[0]?.id as string | undefined;
        }
        const exNotes = [sp.superset ? `[ss:${sp.superset}]` : '', sp.nota ?? ''].filter(Boolean).join(' ').trim() || null;
        await own.insert('workout_plan_exercises', {
          session_id: sessionId,
          exercise_id: exId ?? null,
          name: exName,
          sets: sp.series,
          reps: sp.reps,
          load_kg: sp.carga_kg,
          rest_s: sp.descanso_s,
          notes: exNotes,
          order_index: idx,
        });
        addedCount += 1;
        estTotalSec += sp.series * (45 + sp.descanso_s);
      }

      const estMin = Math.max(10, Math.round(estTotalSec / 60));
      return {
        feito: `Rotina "${a.nome_rotina}" criada${a.pasta ? ` na pasta "${a.pasta}"` : ''}: ${addedCount} exercícios (~${estMin} min estimados)`,
        duracao_estimada_min: estMin,
        link: '/saude?aba=Treino',
        undo: { table: 'workout_plan_sessions', op: 'delete', id: sessionId },
      };
    }

    case 'analisar_evolucao_treino': {
      const dias = Number(a.dias ?? 28);
      const since = addDays(now.date, -(dias - 1));
      const [
        { data: workouts, error },
        { data: sets },
        { data: cardio },
        { data: weights },
        { data: foodLogs },
        { data: waterLogs },
        { data: catalogEx },
      ] = await Promise.all([
        own.select('workouts', 'id,date,title,duration_min,notes').gte('date', since).lte('date', now.date).order('date', { ascending: false }),
        own.select('workout_sets', 'workout_id,exercise_id,load_kg,reps,effort,notes').limit(2000),
        own.select('cardio_sessions', 'date,cardio_type,duration_s,distance_km,kcal').gte('date', since).lte('date', now.date),
        own.select('body_measurements', 'value,measured_at').eq('metric', 'weight_kg').order('measured_at', { ascending: false }).limit(10),
        own.select('food_logs', 'date,kcal,protein_g').gte('date', since).lte('date', now.date),
        own.select('water_logs', 'date,ml').gte('date', since).lte('date', now.date),
        db.from('exercises').select('id,name,muscle_group,secondary_muscles').or(`user_id.is.null,user_id.eq.${uid}`).limit(300),
      ]);
      if (error) return fail(error);

      const weightKg = Number(weights?.[0]?.value ?? 75);
      const wList = workouts ?? [];
      const wIds = new Set(wList.map((w: { id: string }) => w.id));
      const periodSets = (sets ?? []).filter((s: { workout_id: string }) => wIds.has(s.workout_id));
      const exById = new Map(((catalogEx ?? []) as { id: string; name: string; muscle_group: string; secondary_muscles?: string[] }[]).map((e) => [e.id, e]));

      // Hevy 1..30 1RM coefficient table
      const coeff: Record<number, number> = {
        1: 1, 2: 0.97, 3: 0.94, 4: 0.92, 5: 0.89, 6: 0.86, 7: 0.83, 8: 0.81, 9: 0.78, 10: 0.75,
        11: 0.73, 12: 0.71, 13: 0.7, 14: 0.68, 15: 0.67, 20: 0.6, 25: 0.55, 30: 0.5,
      };
      const oneRm = (kg: number, r: number) => {
        if (kg <= 0 || r < 1) return 0;
        const c = coeff[r] ?? (r > 30 ? 0.5 : Math.max(0.5, 1 - r * 0.017));
        return Math.round((kg / c) * 10) / 10;
      };

      let totalTonnage = 0;
      const muscleWeighted = new Map<string, number>();
      const bestByEx = new Map<string, { nome: string; melhor_1rm_kg: number; maior_carga_kg: number; series: number }>();

      for (const s of periodSets) {
        const kg = Number(s.load_kg ?? 0);
        const reps = Number(s.reps ?? 0);
        if (reps <= 0) continue;
        totalTonnage += kg * reps;
        const ex = exById.get(s.exercise_id);
        if (ex) {
          muscleWeighted.set(ex.muscle_group, (muscleWeighted.get(ex.muscle_group) ?? 0) + 1);
          for (const sm of ex.secondary_muscles ?? []) {
            muscleWeighted.set(sm, (muscleWeighted.get(sm) ?? 0) + 0.5);
          }
          const e1 = oneRm(kg, reps);
          const prev = bestByEx.get(ex.id) ?? { nome: ex.name, melhor_1rm_kg: 0, maior_carga_kg: 0, series: 0 };
          prev.series += 1;
          if (e1 > prev.melhor_1rm_kg) prev.melhor_1rm_kg = e1;
          if (kg > prev.maior_carga_kg) prev.maior_carga_kg = kg;
          bestByEx.set(ex.id, prev);
        }
      }

      const workoutBurnTotal = wList.reduce((acc: number, w: { duration_min?: number | null }) => {
        const mins = Number(w.duration_min ?? 50);
        return acc + Math.round(5.0 * weightKg * (mins / 60));
      }, 0);
      const cardioBurnTotal = (cardio ?? []).reduce((acc: number, c: { kcal?: number | null; duration_s?: number }) => {
        return acc + (c.kcal != null ? Number(c.kcal) : Math.round(7.0 * weightKg * (Number(c.duration_s ?? 0) / 3600)));
      }, 0);

      const trainedDates = new Set<string>([
        ...wList.map((w: { date: string }) => w.date),
        ...(cardio ?? []).map((c: { date: string }) => c.date),
      ]);
      const proteinByDay = new Map<string, number>();
      for (const fl of foodLogs ?? []) {
        proteinByDay.set(fl.date, (proteinByDay.get(fl.date) ?? 0) + Number(fl.protein_g ?? 0));
      }
      const waterByDay = new Map<string, number>();
      for (const wl of waterLogs ?? []) {
        waterByDay.set(wl.date, (waterByDay.get(wl.date) ?? 0) + Number(wl.ml ?? 0));
      }
      const trainedProtVals = [...trainedDates].map((d) => proteinByDay.get(d)).filter((v): v is number => v != null && v > 0);
      const avgProtOnTrainingDays = trainedProtVals.length ? Math.round(trainedProtVals.reduce((a, b) => a + b, 0) / trainedProtVals.length) : null;

      const pushSets = (muscleWeighted.get('peito') ?? 0) + (muscleWeighted.get('ombros') ?? 0) + (muscleWeighted.get('triceps') ?? 0);
      const pullSets = (muscleWeighted.get('costas') ?? 0) + (muscleWeighted.get('biceps') ?? 0) + (muscleWeighted.get('antebraco') ?? 0);

      return {
        periodo_dias: dias,
        sessoes_treino: wList.length,
        sessoes_cardio: (cardio ?? []).length,
        volume_total_kg: Math.round(totalTonnage),
        kcal_ativas_totais: workoutBurnTotal + cardioBurnTotal,
        distribuicao_muscular_ponderada: [...muscleWeighted.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([musculo, series_ponderadas]) => ({ musculo, series_ponderadas })),
        simetria_empurrar_puxar: pullSets > 0 ? Math.round((pushSets / pullSets) * 100) / 100 : null,
        melhores_exercicios: [...bestByEx.values()].sort((a, b) => b.melhor_1rm_kg - a.melhor_1rm_kg).slice(0, 8),
        sinergia_nutricao: {
          peso_atual_kg: weightKg,
          proteina_media_dias_treino_g: avgProtOnTrainingDays,
          dias_ativos_no_periodo: trainedDates.size,
        },
      };
    }

    case 'registrar_cardio': {
      const day = String(a.data ?? now.date);
      const durMin = Number(a.duracao_min);
      const { data: weights } = await own.select('body_measurements', 'value').eq('metric', 'weight_kg').order('measured_at', { ascending: false }).limit(1);
      const weightKg = Number(weights?.[0]?.value ?? 75);
      const estKcal = a.kcal != null ? Number(a.kcal) : Math.round(7.0 * weightKg * (durMin / 60));

      const { data, error } = await own.insert('cardio_sessions', {
        date: day,
        cardio_type: a.tipo,
        duration_s: durMin * 60,
        distance_km: a.distancia_km,
        kcal: a.kcal,
        notes: a.notas,
      }).select('id');
      if (error) return fail(error);
      const id = data?.[0]?.id as string | undefined;

      // Auto-sync matching cardio/exercise habit
      const { data: habits } = await own.select('habits', 'id,name,target_value').eq('is_archived', false);
      const cardioKw = ['cardio', 'corrida', 'correr', 'caminhada', 'exercicio', 'treino', 'treinar'];
      const matchedHabit = (habits ?? []).find((hb: { name: string }) => {
        const norm = hb.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        return cardioKw.some((k) => norm.includes(k));
      });
      if (matchedHabit) {
        await own.upsert(
          'habit_completions',
          { habit_id: matchedHabit.id, completed_date: day, value: matchedHabit.target_value ?? 1 },
          { onConflict: 'habit_id,completed_date' },
        );
      }

      return {
        feito: `Cardio registrado: ${a.tipo}, ${durMin} min (~${estKcal} kcal)${a.distancia_km ? ` · ${String(a.distancia_km).replace('.', ',')} km` : ''}`,
        kcal_estimadas: estKcal,
        link: '/saude?aba=Treino',
        ...(id ? { undo: { table: 'cardio_sessions', op: 'delete', id } } : {}),
      };
    }

    case 'resumo_saude_hoje': {
      const day = String(a.data ?? now.date);
      const [{ data: logs, error }, { data: workouts }, { data: cardio }, { data: weights }, { data: water }, { data: fasts }] = await Promise.all([
        own.select('food_logs', 'meal,food_name,kcal,protein_g,carbs_g,fat_g').eq('date', day),
        own.select('workouts', 'title,duration_min,notes').eq('date', day),
        own.select('cardio_sessions', 'cardio_type,duration_s,distance_km,kcal').eq('date', day),
        own.select('body_measurements', 'value,measured_at').eq('metric', 'weight_kg').order('measured_at', { ascending: false }).limit(1),
        own.select('water_logs', 'ml').eq('date', day),
        own.select('fasting_sessions', 'protocol,target_hours,started_at').is('ended_at', null).order('started_at', { ascending: false }).limit(1),
      ]);
      if (error) return fail(error);
      const weightKg = Number(weights?.[0]?.value ?? 75);
      const rows = logs ?? [];
      const sum = (k: 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g') => Math.round(rows.reduce((s, r) => s + Number(r[k] ?? 0), 0) * 10) / 10;
      const waterMl = (water ?? []).reduce((s, w) => s + Number(w.ml ?? 0), 0);

      let activeBurnKcal = 0;
      let activeMinutes = 0;
      for (const w of workouts ?? []) {
        const mins = Number(w.duration_min ?? 45);
        activeMinutes += mins;
        const kcalTag = String(w.notes ?? '').match(/\[kcal:(\d+)\]/i);
        activeBurnKcal += kcalTag ? Number(kcalTag[1]) : Math.round(5.0 * weightKg * (mins / 60));
      }
      for (const c of cardio ?? []) {
        const mins = Math.round(Number(c.duration_s ?? 0) / 60);
        activeMinutes += mins;
        activeBurnKcal += c.kcal != null ? Number(c.kcal) : Math.round(7.0 * weightKg * (mins / 60));
      }
      const sweatBonusMl = activeMinutes > 0 ? Math.min(1500, Math.round(((activeMinutes / 60) * 500) / 50) * 50) : 0;

      const activeFast = fasts?.[0] ?? null;
      const fastInfo = activeFast
        ? {
            protocolo: activeFast.protocol,
            horas_alvo: Number(activeFast.target_hours),
            inicio_iso: activeFast.started_at,
            horas_decorridas: Math.max(0, Math.round(((Date.now() - new Date(activeFast.started_at).getTime()) / 3_600_000) * 10) / 10),
          }
        : null;
      return {
        data: day,
        peso_atual_kg: weights?.[0]?.value ?? null,
        agua_ml: waterMl,
        meta_agua_ajustada_ml: 2500 + sweatBonusMl,
        kcal_gastas_atividades: activeBurnKcal,
        jejum_ativo: fastInfo,
        alimentacao: {
          registros: rows.length,
          kcal: Math.round(sum('kcal')),
          proteina_g: sum('protein_g'),
          carbo_g: sum('carbs_g'),
          gordura_g: sum('fat_g'),
        },
        treinos: (workouts ?? []).map((w) => ({ titulo: w.title ?? 'Treino', duracao_min: w.duration_min })),
        cardio: (cardio ?? []).map((c) => ({ tipo: c.cardio_type, duracao_min: Math.round(Number(c.duration_s) / 60), distancia_km: c.distance_km, kcal: c.kcal })),
      };
    }

    case 'consultar_oraculo_nutrientes': {
      const key = String(a.key);
      const label = String(a.label);
      const unit = String(a.unit);
      const rda = Number(a.rda);
      const modo = String(a.modo ?? 'oraculo');
      const limite = Number(a.limite ?? 8);
      const { data: foods, error } = await db
        .from('foods')
        .select('id,name,kcal,protein_g,carbs_g,fat_g,fiber_g,default_serving_g,nutrients')
        .or(`user_id.is.null,user_id.eq.${uid}`)
        .limit(400);
      if (error) return fail(error);
      const hits = rankOracleFoods((foods ?? []) as RawFoodRow[], key, modo, limite);
      return {
        nutriente: label,
        unidade: unit,
        meta_diaria_ref: rda,
        modo,
        ranking: hits.map((h, idx) => ({
          posicao: idx + 1,
          alimento: h.food.name,
          por_100g: h.per100g,
          por_100kcal: h.per100kcal,
          kcal_100g: Math.round(Number(h.food.kcal ?? 0)),
          proteina_100g: Number(h.food.protein_g ?? 0),
          porcao_padrao_g: Number(h.food.default_serving_g ?? 100),
        })),
      };
    }

    case 'sugerir_alimentos_dia': {
      const day = String(a.data ?? now.date);
      const [
        { data: logs, error },
        { data: water },
        { data: settings },
        { data: plans },
        { data: templates },
        { data: fasts },
        { data: foods },
      ] = await Promise.all([
        own.select('food_logs', 'food_name,quantity_g,kcal,protein_g,carbs_g,fat_g,fiber_g,nutrients').eq('date', day),
        own.select('water_logs', 'ml').eq('date', day),
        own.select('user_settings', 'water_goal_ml').maybeSingle(),
        own.select('diet_plans', 'id,name').eq('is_active', true).limit(1),
        own.select('macro_templates', 'name,weekdays,kcal,protein_g,carbs_g,fat_g'),
        own.select('fasting_sessions', 'protocol,target_hours,started_at').is('ended_at', null).limit(1),
        db.from('foods').select('id,name,kcal,protein_g,carbs_g,fat_g,fiber_g,default_serving_g,nutrients').or(`user_id.is.null,user_id.eq.${uid}`).limit(350),
      ]);
      if (error) return fail(error);

      const [yy, mm, dd] = day.split('-').map(Number);
      const weekday = new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay();
      const tpl = (templates ?? []).find((t) => Array.isArray(t.weekdays) && t.weekdays.includes(weekday));
      let target = tpl
        ? { kcal: Number(tpl.kcal), protein_g: Number(tpl.protein_g), carbs_g: Number(tpl.carbs_g), fat_g: Number(tpl.fat_g) }
        : { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 65 };

      const activePlanId = plans?.[0]?.id as string | undefined;
      if (!tpl && activePlanId) {
        const { data: planTargets } = await db.from('diet_day_targets').select('day_type,kcal,protein_g,carbs_g,fat_g').in('plan_id', [activePlanId]);
        const picked = (planTargets ?? [])[0];
        if (picked) {
          target = { kcal: Number(picked.kcal), protein_g: Number(picked.protein_g), carbs_g: Number(picked.carbs_g), fat_g: Number(picked.fat_g) };
        }
      }

      const rows = logs ?? [];
      const consumed = {
        kcal: Math.round(rows.reduce((s, r) => s + Number(r.kcal ?? 0), 0)),
        protein_g: Math.round(rows.reduce((s, r) => s + Number(r.protein_g ?? 0), 0) * 10) / 10,
        carbs_g: Math.round(rows.reduce((s, r) => s + Number(r.carbs_g ?? 0), 0) * 10) / 10,
        fat_g: Math.round(rows.reduce((s, r) => s + Number(r.fat_g ?? 0), 0) * 10) / 10,
      };
      const remaining = {
        kcal: Math.max(0, target.kcal - consumed.kcal),
        protein_g: Math.max(0, Math.round((target.protein_g - consumed.protein_g) * 10) / 10),
        carbs_g: Math.max(0, Math.round((target.carbs_g - consumed.carbs_g) * 10) / 10),
        fat_g: Math.max(0, Math.round((target.fat_g - consumed.fat_g) * 10) / 10),
      };

      // Sum micronutrients from today's logged foods
      const microTotals: Record<string, number> = {};
      for (const r of rows) {
        const factor = Number(r.quantity_g ?? 100) / 100;
        const explicit = r.nutrients && typeof r.nutrients === 'object' ? (r.nutrients as Record<string, number>) : null;
        if (explicit && Object.keys(explicit).length > 0) {
          for (const [k, v] of Object.entries(explicit)) {
            if (typeof v === 'number') microTotals[k] = (microTotals[k] ?? 0) + v;
          }
        } else {
          const est = foodMicronutrientsPer100g({ name: String(r.food_name ?? ''), kcal: Number(r.kcal ?? 0), protein_g: Number(r.protein_g ?? 0), carbs_g: Number(r.carbs_g ?? 0), fat_g: Number(r.fat_g ?? 0) });
          for (const [k, v] of Object.entries(est)) microTotals[k] = (microTotals[k] ?? 0) + v * factor;
        }
      }

      const trackedSpecs = Object.values(ORACLE_NUTRIENT_ALIASES)
        .filter((s, i, arr) => arr.findIndex((x) => x.key === s.key) === i && !['protein_g', 'fiber_g', 'sodium_mg'].includes(s.key));
      const gaps = trackedSpecs
        .map((s) => {
          const cur = Math.round((microTotals[s.key] ?? 0) * 10) / 10;
          const pct = Math.round((cur / s.rda) * 100);
          return { key: s.key, nutriente: s.label, consumido: cur, meta: s.rda, unidade: s.unit, percentual: pct };
        })
        .sort((x, y) => x.percentual - y.percentual)
        .slice(0, 4);

      const catalog = (foods ?? []) as RawFoodRow[];
      const topGapKey = gaps[0]?.key ?? 'potassium_mg';
      const microCandidates = rankOracleFoods(catalog, topGapKey, 'oraculo', 5).map((h) => ({
        alimento: h.food.name,
        foco: gaps[0]?.nutriente ?? 'Micronutrientes',
        valor_100g: `${h.per100g} ${gaps[0]?.unidade ?? ''}`.trim(),
        kcal_100g: Math.round(Number(h.food.kcal ?? 0)),
        proteina_100g: Number(h.food.protein_g ?? 0),
      }));
      const proteinCandidates = remaining.protein_g >= 15
        ? rankOracleFoods(catalog, 'protein_g', 'oraculo', 5).map((h) => ({
            alimento: h.food.name,
            proteina_100g: h.per100g,
            kcal_100g: Math.round(Number(h.food.kcal ?? 0)),
          }))
        : [];

      const waterMl = (water ?? []).reduce((s, w) => s + Number(w.ml ?? 0), 0);
      const waterGoal = Number((settings as { water_goal_ml?: number } | null)?.water_goal_ml ?? 2500);

      return {
        data: day,
        refeicao_alvo: a.refeicao ?? 'livre',
        restricoes_informadas: a.restricoes ?? null,
        consumido: consumed,
        meta: target,
        restante: remaining,
        hidratacao: { consumido_ml: waterMl, meta_ml: waterGoal },
        jejum_ativo: fasts?.[0] ? { protocolo: fasts[0].protocol, inicio: fasts[0].started_at } : null,
        principais_lacunas_micronutrientes: gaps,
        candidatos_para_lacunas: microCandidates,
        candidatos_proteicos: proteinCandidates,
        dica_acao: 'Monte 2 a 3 sugestões práticas com porções exatas em gramas/medidas caseiras respeitando as calorias restantes e pergunte se o usuário quer registrar a escolhida com registrar_refeicao.',
      };
    }

    case 'registrar_agua': {
      const day = String(a.data ?? now.date);
      const ml = Number(a.ml);
      const hora = typeof a.hora === 'string' ? a.hora : now.time;
      const { data, error } = await own.insert('water_logs', {
        date: day,
        ml,
        logged_time: hora,
      }).select('id');
      if (error) return fail(error);
      const id = data?.[0]?.id as string | undefined;
      const { data: todayWater } = await own.select('water_logs', 'ml').eq('date', day);
      const totalMl = (todayWater ?? []).reduce((s, w) => s + Number(w.ml ?? 0), 0) || ml;
      return {
        feito: `Água registrada: +${ml} mL (total em ${day.split('-').reverse().join('/')}: ${totalMl} mL)`,
        link: '/saude?aba=Dieta',
        ...(id ? { undo: { table: 'water_logs', op: 'delete', id } } : {}),
      };
    }

    case 'iniciar_jejum': {
      const protocolo = String(a.protocolo ?? '16:8');
      const horasAlvo = Number(a.horas_alvo ?? 16);
      const startDay = typeof a.inicio_data === 'string' ? a.inicio_data : now.date;
      const startTime = typeof a.inicio_hora === 'string' ? a.inicio_hora : now.time;
      const startedAtIso = (a.inicio_data || a.inicio_hora)
        ? zonedToUtc(startDay, startTime, tz)
        : new Date().toISOString();
      const endDateObj = new Date(new Date(startedAtIso).getTime() + horasAlvo * 3_600_000);
      const endLocal = localNow(tz, endDateObj);
      const endFmt = `${endLocal.date.split('-').reverse().join('/')} às ${endLocal.time}`;

      const { data, error } = await own.insert('fasting_sessions', {
        protocol: protocolo,
        target_hours: horasAlvo,
        started_at: startedAtIso,
        ended_at: null,
        notes: a.notas ?? null,
      }).select('id');
      if (error) return fail(error);
      const id = data?.[0]?.id as string | undefined;
      return {
        feito: `Jejum ${protocolo} iniciado (meta ${horasAlvo}h · término previsto em ${endFmt})`,
        previsao_termino: endFmt,
        link: '/saude?aba=Jejum',
        ...(id ? { undo: { table: 'fasting_sessions', op: 'delete', id } } : {}),
      };
    }

    case 'encerrar_jejum': {
      const { data: open, error: selErr } = await own
        .select('fasting_sessions', 'id,protocol,target_hours,started_at,notes')
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1);
      if (selErr) return fail(selErr);
      const current = open?.[0];
      if (!current) return { erro: 'nenhum jejum ativo encontrado no momento' };

      const endDay = typeof a.fim_data === 'string' ? a.fim_data : now.date;
      const endTime = typeof a.fim_hora === 'string' ? a.fim_hora : now.time;
      const endedAtIso = (a.fim_data || a.fim_hora)
        ? zonedToUtc(endDay, endTime, tz)
        : new Date().toISOString();
      const elapsedHours = Math.max(0, Math.round(((new Date(endedAtIso).getTime() - new Date(current.started_at).getTime()) / 3_600_000) * 10) / 10);
      const patch: Record<string, unknown> = { ended_at: endedAtIso };
      if (a.notas) patch.notes = a.notas;

      const { error } = await own.update('fasting_sessions', patch).eq('id', current.id);
      if (error) return fail(error);
      const hitGoal = elapsedHours >= Number(current.target_hours);
      return {
        feito: `Jejum ${current.protocol} encerrado após ${String(elapsedHours).replace('.', ',')}h${hitGoal ? ' (meta atingida)' : ''}`,
        horas_jejuadas: elapsedHours,
        meta_atingida: hitGoal,
        link: '/saude?aba=Jejum',
        undo: { table: 'fasting_sessions', op: 'update', id: current.id, patch: { ended_at: null } },
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
