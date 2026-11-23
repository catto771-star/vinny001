// Pure helpers for the Assistant workspace, global drawer, threads, slash commands,
// contextual playbooks, screen awareness, and deep-link navigation from AI actions.

export interface ScreenContext {
  route: string;
  label: string;
  hint: string;
  projectId?: string;
}

export interface ChatActionItem {
  tool: string;
  summary: string;
  link?: string;
  undo?: {
    table: string;
    op: 'delete' | 'update';
    id: string;
    patch?: Record<string, unknown>;
  };
}

export interface ChatMetadata {
  kind?: string;
  title?: string;
  thread_id?: string;
  thread_title?: string;
  actions?: ChatActionItem[];
  model?: string;
}

export interface ChatMessageRow {
  id: string;
  content: string;
  is_user: boolean;
  created_at: string;
  metadata: ChatMetadata | null;
}

export interface ThreadSummary {
  id: string;
  title: string;
  lastMessage: string;
  updatedAt: string;
  count: number;
  kind: 'chat' | 'automation';
}

export interface SlashCommand {
  cmd: string;
  label: string;
  description: string;
  template: string;
  immediate?: boolean;
}

export interface Playbook {
  id: string;
  label: string;
  prompt: string;
}

const SCREEN_META: Record<string, { label: string; hint: string }> = {
  inicio: { label: 'Início', hint: 'Painel geral do dia (tarefas, hábitos, previsão financeira e projetos).' },
  assistente: { label: 'Assistente', hint: 'Tela dedicada do assistente.' },
  agenda: { label: 'Agenda', hint: 'Calendário de compromissos, tarefas e lembretes.' },
  tarefas: { label: 'Tarefas', hint: 'Lista de tarefas pendentes, atrasadas e concluídas.' },
  habitos: { label: 'Hábitos', hint: 'Rotina diária, streaks e constância.' },
  lembretes: { label: 'Lembretes', hint: 'Lembretes programados com data e hora.' },
  saude: { label: 'Saúde', hint: 'Treinos, cardio, alimentação, calorias, macros e evolução de peso.' },
  financas: { label: 'Finanças', hint: 'Contas (Revolut/Wise), lançamentos multimoeda, transferências, orçamentos e previsão 30d.' },
  projetos: { label: 'Projetos', hint: 'Projetos ativos, marcos (etapas), subetapas e prazos.' },
  metas: { label: 'Metas', hint: 'Metas financeiras, de projetos, hábitos e pessoais.' },
  conhecimento: { label: 'Conhecimento', hint: 'Notas, segundo cérebro e diário.' },
  'piloto-automatico': { label: 'Piloto automático', hint: 'Automações agendadas e briefings da IA.' },
  configuracoes: { label: 'Configurações', hint: 'Preferências, tema, moeda e modelo do assistente.' },
};

/** Derives structured screen context from React Router's pathname + search query. */
export function screenContextFromLocation(pathname: string, search = ''): ScreenContext {
  const seg = pathname.replace(/^\/+/, '').split('/')[0] || 'inicio';
  const meta = SCREEN_META[seg] ?? SCREEN_META.inicio;
  const params = new URLSearchParams(search);
  const projectId = seg === 'projetos' ? (params.get('p') || undefined) : undefined;
  return {
    route: `/${seg}`,
    label: meta.label,
    hint: projectId ? `${meta.hint} Projeto aberto atualmente (id: ${projectId}).` : meta.hint,
    ...(projectId ? { projectId } : {}),
  };
}

export const DEFAULT_THREAD_ID = 'default';
export const AUTOMATIONS_THREAD_ID = '__automations__';

/** Generates a clean client-side thread identifier. */
export function createThreadId(now = Date.now()): string {
  return `t-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Shortens the first user message into a readable thread title. */
export function titleFromMessage(text: string, maxLen = 44): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return 'Nova conversa';
  return clean.length <= maxLen ? clean : `${clean.slice(0, maxLen - 1).trimEnd()}…`;
}

/** Returns the thread bucket ID a stored message belongs to. */
export function threadIdOf(m: Pick<ChatMessageRow, 'metadata'>): string {
  if (m.metadata?.kind === 'briefing' || m.metadata?.kind === 'automation') return AUTOMATIONS_THREAD_ID;
  return m.metadata?.thread_id || DEFAULT_THREAD_ID;
}

/** Groups chat messages into ordered threads (most recently active first). */
export function groupThreads(messages: readonly ChatMessageRow[]): ThreadSummary[] {
  const map = new Map<string, ThreadSummary>();
  for (const m of messages) {
    const id = threadIdOf(m);
    const isAuto = id === AUTOMATIONS_THREAD_ID;
    const prev = map.get(id);
    const snippet = m.content.replace(/\s+/g, ' ').trim().slice(0, 72);
    if (!prev) {
      const explicitTitle = m.metadata?.thread_title?.trim();
      const title = isAuto
        ? 'Piloto automático'
        : id === DEFAULT_THREAD_ID
          ? (explicitTitle || 'Conversa geral')
          : (explicitTitle || (m.is_user ? titleFromMessage(m.content) : 'Conversa'));
      map.set(id, {
        id,
        title,
        lastMessage: snippet,
        updatedAt: m.created_at,
        count: 1,
        kind: isAuto ? 'automation' : 'chat',
      });
    } else {
      prev.count += 1;
      if (m.metadata?.thread_title && prev.title === 'Conversa') {
        prev.title = m.metadata.thread_title;
      } else if (!isAuto && id !== DEFAULT_THREAD_ID && prev.title === 'Conversa' && m.is_user) {
        prev.title = titleFromMessage(m.content);
      }
      if (m.created_at >= prev.updatedAt) {
        prev.updatedAt = m.created_at;
        prev.lastMessage = snippet;
      }
    }
  }
  return [...map.values()].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'chat' ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

/** Filters messages belonging to one selected thread (chronological order). */
export function filterThreadMessages(messages: readonly ChatMessageRow[], threadId: string): ChatMessageRow[] {
  return messages.filter((m) => threadIdOf(m) === threadId);
}

/** Slash commands available right inside the Assistant composer. */
export const ASSISTANT_SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    cmd: '/dia',
    label: 'Planejar o dia',
    description: 'Cruza tarefas, hábitos e agenda e monta prioridades de hoje',
    template: 'Organize meu dia de hoje: liste o que está atrasado, os compromissos, os hábitos pendentes e sugira a melhor ordem de foco.',
    immediate: true,
  },
  {
    cmd: '/etapas',
    label: 'Quebrar projeto em etapas',
    description: 'Cria marcos e subetapas dentro de um projeto ativo',
    template: 'Crie um plano prático de etapas e subetapas para o projeto ',
  },
  {
    cmd: '/gasto',
    label: 'Lançar gasto',
    description: 'Registra despesa ou receita em EUR, BRL ou USD',
    template: 'Registre o gasto: ',
  },
  {
    cmd: '/transferir',
    label: 'Transferir entre contas',
    description: 'Move saldo entre suas contas (ex.: Revolut ↔ Wise)',
    template: 'Transfira ',
  },
  {
    cmd: '/treino',
    label: 'Registrar treino ou cardio',
    description: 'Salva sessão de musculação ou cardio em Saúde',
    template: 'Registre meu treino de hoje: ',
  },
  {
    cmd: '/financas',
    label: 'Analisar finanças',
    description: 'Resumo do mês, categorias e contas ativas',
    template: 'Faça um resumo financeiro deste mês, confira minhas contas e aponte os principais pontos de atenção.',
    immediate: true,
  },
  {
    cmd: '/revisao',
    label: 'Fechar o dia',
    description: 'Revisa pendentes de hoje e prepara amanhã',
    template: 'Faça um fechamento rápido do meu dia: o que ainda falta de tarefas e hábitos hoje e o que devo priorizar amanhã?',
    immediate: true,
  },
  {
    cmd: '/memoria',
    label: 'Salvar regra na memória',
    description: 'Ensina uma preferência permanente ao Assistente',
    template: 'Lembre sempre desta regra: ',
  },
];

/** Matches slash commands when the composer starts with `/`. */
export function matchSlashCommands(input: string): SlashCommand[] {
  const trimmed = input.trimStart();
  if (!trimmed.startsWith('/')) return [];
  const token = trimmed.split(/\s+/)[0].toLowerCase();
  if (trimmed.includes(' ')) return [];
  return ASSISTANT_SLASH_COMMANDS.filter((c) => c.cmd.startsWith(token));
}

/** Expands a submitted `/command ...` message into a clear natural instruction for the model. */
export function expandSlashCommand(input: string): string {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return trimmed;
  const [first, ...restParts] = trimmed.split(/\s+/);
  const found = ASSISTANT_SLASH_COMMANDS.find((c) => c.cmd === first.toLowerCase());
  if (!found) return trimmed;
  const rest = restParts.join(' ').trim();
  if (!rest) return found.template.trim();
  return found.immediate ? `${found.template} ${rest}` : `${found.template}${rest}`;
}

/** Maps an Assistant write tool to the destination screen in Painel. */
export function actionLinkOf(action: Pick<ChatActionItem, 'tool' | 'link'>): string | null {
  if (action.link) return action.link;
  switch (action.tool) {
    case 'criar_tarefa':
    case 'concluir_tarefa':
    case 'reagendar_tarefa':
      return '/tarefas';
    case 'criar_lembrete':
    case 'concluir_lembrete':
      return '/lembretes';
    case 'criar_compromisso':
    case 'reagendar_compromisso':
      return '/agenda';
    case 'marcar_habito':
      return '/habitos';
    case 'registrar_transacao':
    case 'registrar_transferencia':
    case 'definir_orcamento':
      return '/financas';
    case 'criar_nota':
      return '/conhecimento';
    case 'registrar_progresso_meta':
      return '/metas';
    case 'criar_marco_projeto':
    case 'criar_plano_projeto':
    case 'concluir_marco_projeto':
      return '/projetos';
    case 'registrar_refeicao':
    case 'registrar_peso':
    case 'registrar_treino':
    case 'registrar_cardio':
      return '/saude';
    default:
      return null;
  }
}

/** Contextual 1-click operational playbooks tailored to the user's current screen. */
export function playbooksForRoute(pathname: string): Playbook[] {
  const seg = pathname.replace(/^\/+/, '').split('/')[0] || 'inicio';
  if (seg === 'projetos') {
    return [
      { id: 'proj-plan', label: 'Quebrar projeto em etapas', prompt: 'Liste meus projetos sem etapas e proponha (e crie) um plano prático de etapas e subetapas para o mais urgente.' },
      { id: 'proj-risk', label: 'Ver projetos em risco', prompt: 'Analise meus projetos em andamento, seus prazos e me diga qual precisa de foco imediato esta semana.' },
      { id: 'proj-next', label: 'Próximas subetapas', prompt: 'Quais são as 3 próximas ações concretas mais importantes nos meus projetos agora?' },
    ];
  }
  if (seg === 'financas') {
    return [
      { id: 'fin-sum', label: 'Resumo do mês', prompt: 'Faça um resumo financeiro deste mês, liste minhas contas e destaque onde posso melhorar.' },
      { id: 'fin-exp', label: 'Lançar gasto rápido', prompt: 'Quero registrar um gasto em euro na Revolut. Pergunte apenas descrição e valor se não informei.' },
      { id: 'fin-budget', label: 'Definir limites', prompt: 'Sugira tetos mensais de orçamento por categoria com base no meu perfil e pergunte se quero cadastrá-los.' },
    ];
  }
  if (seg === 'saude') {
    return [
      { id: 'hlth-today', label: 'Resumo de saúde hoje', prompt: 'Consulte meu resumo de saúde hoje (peso, calorias, treinos e cardio) e me diga o que falta registrar.' },
      { id: 'hlth-cardio', label: 'Registrar cardio 30m', prompt: 'Registre uma sessão de cardio hoje: caminhada/corrida de 30 minutos.' },
      { id: 'hlth-meal', label: 'Registrar refeição', prompt: 'Quero registrar uma refeição de hoje. Me ajude estimando calorias e macros.' },
    ];
  }
  return [
    { id: 'day', label: 'Planejar meu dia', prompt: 'Organize meu dia de hoje: tarefas pendentes e atrasadas, compromissos e hábitos que ainda faltam.' },
    { id: 'proj', label: 'Montar etapas de projeto', prompt: 'Liste meus projetos em andamento e me ajude a criar etapas e subetapas práticas para o próximo prazo.' },
    { id: 'fin', label: 'Analisar finanças', prompt: 'Faça um resumo financeiro deste mês e das minhas contas bancárias ativas.' },
    { id: 'hlth', label: 'Checar saúde hoje', prompt: 'Consulte meu resumo de saúde de hoje (peso, alimentação e treinos) e sugira o próximo passo.' },
  ];
}
