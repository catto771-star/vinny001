// Pure parts of the assistant: dates in the user's time zone, the tools the
// model may call and the checks on their arguments, the system prompt and the
// history sent along. No Deno or network here, so Vitest covers it.

export interface LocalNow { date: string; time: string; weekday: number }

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/** Today's date, time and weekday in a time zone. */
export function localNow(tz: string, now = new Date()): LocalNow {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(now).map((p) => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const [y, m, d] = date.split('-').map(Number);
  return { date, time: `${parts.hour}:${parts.minute}`, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** A local date and time in a time zone as a UTC instant (ISO). */
export function zonedToUtc(date: string, time: string, tz: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // The zone's offset at that moment: how far its wall clock is from UTC.
  const wall = localNow(tz, new Date(guess));
  const [wy, wm, wd] = wall.date.split('-').map(Number);
  const [wh, wmin] = wall.time.split(':').map(Number);
  const offset = Date.UTC(wy, wm - 1, wd, wh, wmin) - guess;
  return new Date(guess - offset).toISOString();
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const str = (description: string) => ({ type: 'string', description });
const fn = (name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []) => ({
  type: 'function', function: { name, description, parameters: { type: 'object', properties, required } },
});

/** What the model may do, in the OpenAI tool format OpenRouter takes. */
export const TOOLS = [
  fn('listar_tarefas', 'Lista tarefas abertas do usuário.', { periodo: { type: 'string', enum: ['hoje', 'atrasadas', 'semana', 'todas'], description: 'hoje inclui as atrasadas' } }, ['periodo']),
  fn('criar_tarefa', 'Cria uma tarefa.', { titulo: str('Título curto'), data: str('YYYY-MM-DD, opcional'), prioridade: { type: 'string', enum: ['alta', 'media', 'baixa'] } }, ['titulo']),
  fn('concluir_tarefa', 'Marca uma tarefa como concluída. Use o id vindo de listar_tarefas.', { id: str('id da tarefa') }, ['id']),
  fn('criar_lembrete', 'Cria um lembrete num dia e hora.', { titulo: str('O que lembrar'), data: str('YYYY-MM-DD'), hora: str('HH:MM, 24 h') }, ['titulo', 'data', 'hora']),
  fn('listar_habitos', 'Lista os hábitos de hoje e se já foram feitos.'),
  fn('marcar_habito', 'Registra um hábito como feito hoje (ou com um valor, para quantidade e medição).', { id: str('id do hábito'), valor: { type: 'number', description: 'opcional' } }, ['id']),
  fn('resumo_financeiro', 'Receitas, despesas e principais categorias de um mês.', { ano: { type: 'integer' }, mes: { type: 'integer', description: '1 a 12' } }, ['ano', 'mes']),
  fn('registrar_transacao', 'Registra um gasto ou uma receita.', {
    descricao: str('Descrição'), valor: { type: 'number', description: 'Em reais, positivo' }, tipo: { type: 'string', enum: ['despesa', 'receita'] },
    categoria: str('opcional'), data: str('YYYY-MM-DD, opcional (hoje)'),
  }, ['descricao', 'valor', 'tipo']),
  fn('buscar_notas', 'Procura nas notas do usuário por um texto.', { texto: str('Palavras a procurar') }, ['texto']),
  fn('criar_nota', 'Cria uma nota de conhecimento.', { titulo: str('Título'), texto: str('Conteúdo; uma linha por parágrafo') }, ['titulo']),
  fn('listar_metas', 'Lista as metas ativas com o valor atual e o alvo.'),
  fn('listar_projetos', 'Lista os projetos em andamento com tarefas abertas.'),
];

export type ToolArgs = Record<string, unknown>;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const PRIORITY: Record<string, 'high' | 'medium' | 'low'> = { alta: 'high', media: 'medium', média: 'medium', baixa: 'low' };

/**
 * Checks and normalizes a tool call's arguments. Returns the clean arguments
 * or an error in Portuguese that goes back to the model so it can fix the call.
 */
export function checkArgs(name: string, raw: unknown): { ok: true; args: ToolArgs } | { ok: false; error: string } {
  const a = (raw && typeof raw === 'object' ? raw : {}) as ToolArgs;
  const text = (k: string, max = 200) => (typeof a[k] === 'string' ? (a[k] as string).trim().slice(0, max) : '');
  const fail = (error: string) => ({ ok: false as const, error });
  switch (name) {
    case 'listar_tarefas': {
      const periodo = ['hoje', 'atrasadas', 'semana', 'todas'].includes(String(a.periodo)) ? String(a.periodo) : 'hoje';
      return { ok: true, args: { periodo } };
    }
    case 'criar_tarefa': {
      const titulo = text('titulo');
      if (!titulo) return fail('titulo é obrigatório');
      const data = text('data');
      if (data && !DATE.test(data)) return fail('data deve ser YYYY-MM-DD');
      return { ok: true, args: { titulo, data: data || null, prioridade: PRIORITY[text('prioridade').toLowerCase()] ?? 'medium' } };
    }
    case 'concluir_tarefa':
    case 'marcar_habito': {
      const id = text('id', 64);
      if (!/^[0-9a-f-]{36}$/i.test(id)) return fail('id inválido: use o id que veio da listagem');
      const valor = a.valor === undefined || a.valor === null ? null : Number(a.valor);
      if (valor !== null && !(Number.isFinite(valor) && valor >= 0)) return fail('valor deve ser um número positivo');
      return { ok: true, args: name === 'marcar_habito' ? { id, valor } : { id } };
    }
    case 'criar_lembrete': {
      const titulo = text('titulo');
      const data = text('data');
      const hora = text('hora');
      if (!titulo) return fail('titulo é obrigatório');
      if (!DATE.test(data)) return fail('data deve ser YYYY-MM-DD');
      if (!TIME.test(hora)) return fail('hora deve ser HH:MM');
      return { ok: true, args: { titulo, data, hora } };
    }
    case 'resumo_financeiro': {
      const ano = Number(a.ano);
      const mes = Number(a.mes);
      if (!Number.isInteger(ano) || ano < 2000 || ano > 2100 || !Number.isInteger(mes) || mes < 1 || mes > 12) return fail('ano e mes inválidos');
      return { ok: true, args: { ano, mes } };
    }
    case 'registrar_transacao': {
      const descricao = text('descricao');
      const valor = Math.round(Number(a.valor) * 100) / 100;
      const tipo = text('tipo');
      const data = text('data');
      if (!descricao) return fail('descricao é obrigatória');
      if (!(valor > 0) || valor > 10_000_000) return fail('valor deve ser positivo, em reais');
      if (tipo !== 'despesa' && tipo !== 'receita') return fail('tipo deve ser despesa ou receita');
      if (data && !DATE.test(data)) return fail('data deve ser YYYY-MM-DD');
      return { ok: true, args: { descricao, valor, tipo, categoria: text('categoria', 60) || null, data: data || null } };
    }
    case 'buscar_notas': {
      const texto = text('texto', 100);
      if (!texto) return fail('texto é obrigatório');
      return { ok: true, args: { texto } };
    }
    case 'criar_nota': {
      const titulo = text('titulo', 120);
      if (!titulo) return fail('titulo é obrigatório');
      return { ok: true, args: { titulo, texto: text('texto', 8000) } };
    }
    case 'listar_habitos':
    case 'listar_metas':
    case 'listar_projetos':
      return { ok: true, args: {} };
    default:
      return fail(`ferramenta desconhecida: ${name}`);
  }
}

/** Tool calls that change data; the reply lists them so the user sees what was done. */
export const WRITES = new Set(['criar_tarefa', 'concluir_tarefa', 'criar_lembrete', 'marcar_habito', 'registrar_transacao', 'criar_nota']);

/** A note's text as blocks in the BlockNote shape the app reads. */
export function textToBlocks(text: string): unknown[] {
  return text.split('\n').map((line, i) => {
    const bullet = /^\s*[-*•] /.test(line);
    const clean = bullet ? line.replace(/^\s*[-*•] /, '') : line;
    return {
      id: `ai${i}${Math.random().toString(36).slice(2, 7)}`,
      type: bullet ? 'bulletListItem' : 'paragraph',
      props: {},
      content: clean ? [{ type: 'text', text: clean, styles: {} }] : [],
      children: [],
    };
  });
}

// ---------------------------------------------------------------------------
// Prompt and history
// ---------------------------------------------------------------------------

export interface Snapshot { name?: string | null; tasksToday: string[]; tasksLate: number; habitsToday: string[]; goals: string[] }

export function systemPrompt(now: LocalNow, tz: string, s: Snapshot): string {
  const lines = [
    'Você é o assistente do Painel, o app pessoal de organização do usuário: tarefas, hábitos, lembretes, saúde, finanças, projetos, metas e notas.',
    `Hoje é ${WEEKDAYS[now.weekday]}, ${now.date.split('-').reverse().join('/')}, ${now.time} (${tz}).${s.name ? ` O usuário se chama ${s.name}.` : ''}`,
    'Responda em português do Brasil, curto e direto, sem enrolação. Use listas só quando ajudarem.',
    'Use as ferramentas para consultar e alterar os dados; nunca invente dados nem ids. Para concluir tarefas ou marcar hábitos, liste antes para pegar o id.',
    'Datas relativas (amanhã, sexta) você converte para YYYY-MM-DD a partir de hoje. Valores em reais.',
    'Se faltar algo essencial para uma ação (ex.: valor de um gasto), pergunte antes de agir. Depois de alterar algo, confirme em uma frase o que foi feito.',
    'Você não dá diagnóstico médico nem recomendação de investimento específica; pode organizar informações e sugerir hábitos razoáveis.',
    '',
    'Resumo de hoje:',
    `- Tarefas para hoje: ${s.tasksToday.length ? s.tasksToday.join('; ') : 'nenhuma'}${s.tasksLate ? ` (mais ${s.tasksLate} atrasadas)` : ''}`,
    `- Hábitos de hoje: ${s.habitsToday.length ? s.habitsToday.join('; ') : 'nenhum'}`,
    `- Metas ativas: ${s.goals.length ? s.goals.join('; ') : 'nenhuma'}`,
  ];
  return lines.join('\n');
}

export interface StoredMessage { content: string; is_user: boolean; created_at: string; metadata?: { kind?: string } | null }

/**
 * The recent conversation for the model, oldest first, within a size budget.
 * Daily summaries from the autopilot go in as assistant messages.
 */
export function history(messages: StoredMessage[], maxChars = 12000, maxMessages = 20): { role: 'user' | 'assistant'; content: string }[] {
  const recent = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-maxMessages);
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  let used = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    const content = m.content.slice(0, 4000);
    if (used + content.length > maxChars) break;
    used += content.length;
    out.unshift({ role: m.is_user ? 'user' : 'assistant', content });
  }
  // A conversation sent to the model starts with the user.
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

// ---------------------------------------------------------------------------
// The OpenRouter key as saved in the Supabase secrets
// ---------------------------------------------------------------------------

/** The key without what tends to come along when pasting: spaces, quotes, "Bearer ", "NAME=". */
export function cleanKey(raw: string): string {
  const once = raw.trim().replace(/^[A-Z_]+=/, '').replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '');
  // A key has no spaces; drop any blank or invisible character that came along.
  return once.replace(/[\s\u00a0\u200b-\u200d\u2060\ufeff]/g, '');
}

/** "sk-or-v1-…a1b2 (73 caracteres)": enough to compare with the key list, not enough to use. */
export function maskKey(key: string): string {
  return `${key.slice(0, 9)}…${key.slice(-4)} (${key.length} caracteres)`;
}

/** What looks wrong with a key, to explain a refusal; never echoes the key. Null when it looks fine. */
export function keyHint(key: string): string | null {
  if (!key.startsWith('sk-or-')) return 'o valor salvo não parece uma chave do OpenRouter (deveria começar com sk-or-)';
  if (key.length < 40) return 'a chave salva parece incompleta';
  return null;
}
