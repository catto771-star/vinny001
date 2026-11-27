// Pure parts of the assistant: dates in the user's time zone, the tools the
// model may call and the checks on their arguments, the system prompt, memory
// formatting and the history sent along. No Deno or network here, so Vitest covers it.

export interface LocalNow { date: string; time: string; weekday: number }

export interface UndoSpec {
  table: string;
  op: 'delete' | 'update';
  id: string;
  patch?: Record<string, unknown>;
}

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

export const MEMORY_CATEGORIES = ['rotina', 'financas', 'saude', 'projetos', 'preferencia', 'aprendizado'] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

/** What the model may do, in the OpenAI tool format OpenRouter takes. */
export const TOOLS = [
  fn('listar_tarefas', 'Lista tarefas abertas do usuário.', { periodo: { type: 'string', enum: ['hoje', 'atrasadas', 'semana', 'todas'], description: 'hoje inclui as atrasadas' } }, ['periodo']),
  fn('criar_tarefa', 'Cria uma tarefa (opcionalmente vinculada a um projeto e com horário).', {
    titulo: str('Título curto'),
    data: str('YYYY-MM-DD, opcional'),
    hora: str('HH:MM, 24h, opcional'),
    prioridade: { type: 'string', enum: ['alta', 'media', 'baixa'] },
    projeto: str('Nome do projeto para vincular, opcional'),
  }, ['titulo']),
  fn('concluir_tarefa', 'Marca uma tarefa aberta como concluída, pelo id (de listar_tarefas) ou pelo título.', { id: str('id da tarefa, se souber'), titulo: str('título ou parte dele') }),
  fn('reagendar_tarefa', 'Move uma tarefa aberta para outra data/horário, pelo id ou título.', {
    id: str('id da tarefa, se souber'),
    titulo: str('título ou parte dele'),
    data: str('Nova data YYYY-MM-DD'),
    hora: str('Novo horário HH:MM, opcional'),
  }, ['data']),
  fn('criar_lembrete', 'Cria um lembrete num dia e hora.', { titulo: str('O que lembrar'), data: str('YYYY-MM-DD'), hora: str('HH:MM, 24 h') }, ['titulo', 'data', 'hora']),
  fn('listar_agenda', 'Lista compromissos, tarefas e lembretes num intervalo de datas.', {
    inicio: str('Data inicial YYYY-MM-DD'),
    fim: str('Data final YYYY-MM-DD'),
  }, ['inicio', 'fim']),
  fn('criar_compromisso', 'Agenda um compromisso (evento) na Agenda.', {
    titulo: str('Título do compromisso'),
    data: str('YYYY-MM-DD'),
    inicio: str('Hora de início HH:MM, opcional se dia inteiro'),
    fim: str('Hora de término HH:MM, opcional'),
    local: str('Local, opcional'),
    observacoes: str('Observações, opcional'),
  }, ['titulo', 'data']),
  fn('listar_habitos', 'Lista os hábitos de hoje e se já foram feitos.'),
  fn('marcar_habito', 'Registra um hábito como feito hoje (ou com um valor, para quantidade e medição), pelo id ou pelo nome.', { id: str('id do hábito, se souber'), nome: str('nome do hábito'), valor: { type: 'number', description: 'opcional' } }),
  fn('listar_contas', 'Lista as contas bancárias cadastradas e a moeda de cada uma.'),
  fn('resumo_financeiro', 'Receitas, despesas e principais categorias de um mês.', { ano: { type: 'integer' }, mes: { type: 'integer', description: '1 a 12' } }, ['ano', 'mes']),
  fn('registrar_transacao', 'Registra um gasto ou receita em BRL, EUR ou USD, opcionalmente numa conta específica (ex.: Revolut, Wise).', {
    descricao: str('Descrição'),
    valor: { type: 'number', description: 'Valor positivo na moeda informada' },
    tipo: { type: 'string', enum: ['despesa', 'receita'] },
    moeda: { type: 'string', enum: ['BRL', 'EUR', 'USD'], description: 'Padrão BRL (ou moeda da conta)' },
    conta: str('Nome da conta bancária (ex.: Revolut, Wise), opcional'),
    categoria: str('Categoria, opcional'),
    data: str('YYYY-MM-DD, opcional (hoje)'),
    cotacao: { type: 'number', description: 'Cotação em reais por unidade se moeda estrangeira, opcional' },
  }, ['descricao', 'valor', 'tipo']),
  fn('buscar_notas', 'Procura nas notas do usuário por um texto.', { texto: str('Palavras a procurar') }, ['texto']),
  fn('criar_nota', 'Cria uma nota de conhecimento.', { titulo: str('Título'), texto: str('Conteúdo; uma linha por parágrafo') }, ['titulo']),
  fn('listar_metas', 'Lista as metas ativas com o valor atual e o alvo.'),
  fn('registrar_progresso_meta', 'Registra um novo valor/aporte numa meta pelo nome ou id.', {
    id: str('id da meta, se souber'),
    titulo: str('título ou parte dele'),
    valor: { type: 'number', description: 'Valor do registro' },
    nota: str('Observação opcional'),
    data: str('YYYY-MM-DD, opcional (hoje)'),
  }, ['valor']),
  fn('listar_projetos', 'Lista os projetos em andamento com tarefas abertas.'),
  fn('criar_marco_projeto', 'Adiciona um marco (etapa) a um projeto em andamento.', {
    projeto: str('Nome do projeto'),
    titulo: str('Título do marco'),
    prazo: str('Data prevista YYYY-MM-DD, opcional'),
  }, ['projeto', 'titulo']),
  fn('criar_plano_projeto', 'Cria várias etapas (marcos) e suas subetapas (tarefas) dentro de um projeto de uma só vez.', {
    projeto: str('Nome ou id do projeto'),
    etapas: {
      type: 'array',
      description: 'Lista de etapas em ordem, cada uma com título, prazo opcional (YYYY-MM-DD) e lista opcional de subetapas',
      items: {
        type: 'object',
        properties: {
          titulo: str('Título da etapa'),
          prazo: str('Data prevista YYYY-MM-DD, opcional'),
          subetapas: { type: 'array', items: str('Título de subetapa'), description: 'Tarefas vinculadas a esta etapa' },
        },
        required: ['titulo'],
      },
    },
  }, ['projeto', 'etapas']),
  fn('concluir_marco_projeto', 'Marca uma etapa (marco) de um projeto como concluída.', {
    projeto: str('Nome do projeto'),
    titulo: str('Título ou parte do título da etapa'),
  }, ['projeto', 'titulo']),
  fn('registrar_refeicao', 'Registra um alimento ou refeição no diário alimentar de Saúde.', {
    alimento: str('Nome do alimento ou refeição'),
    refeicao: { type: 'string', enum: ['cafe', 'almoco', 'jantar', 'lanche'], description: 'Qual refeição do dia' },
    kcal: { type: 'number', description: 'Calorias (kcal)' },
    proteina_g: { type: 'number', description: 'Proteína em gramas, opcional' },
    carbo_g: { type: 'number', description: 'Carboidrato em gramas, opcional' },
    gordura_g: { type: 'number', description: 'Gordura em gramas, opcional' },
    quantidade_g: { type: 'number', description: 'Peso aproximado em gramas, opcional (padrão 100)' },
    data: str('YYYY-MM-DD, opcional (hoje)'),
  }, ['alimento', 'kcal']),
  fn('registrar_peso', 'Registra o peso corporal (kg) em Saúde.', {
    peso_kg: { type: 'number', description: 'Peso em quilogramas (ex.: 78.4)' },
    observacoes: str('Observação opcional'),
  }, ['peso_kg']),
  fn('registrar_treino', 'Registra uma sessão de treino (musculação, calistenia, funcional/HIIT, mobilidade, esporte ou outro) com séries opcionais, cálculo automático de calorias gastas e sincronização com hábitos.', {
    titulo: str('Nome do treino (ex.: Push A, Pernas, Funcional)'),
    modalidade: { type: 'string', enum: ['musculacao', 'calistenia', 'funcional', 'mobilidade', 'esporte', 'outro'], description: 'Modalidade da sessão (padrão musculacao)' },
    duracao_min: { type: 'integer', description: 'Duração em minutos, opcional (estimada pelas séries se omitida)' },
    kcal: { type: 'number', description: 'Calorias gastas (opcional; calculadas automaticamente se omitido)' },
    notas: str('Observações da sessão, opcional'),
    data: str('YYYY-MM-DD, opcional (hoje)'),
    exercicios: {
      type: 'array',
      description: 'Exercícios realizados com séries, opcional',
      items: {
        type: 'object',
        properties: {
          nome: str('Nome do exercício (ex.: Supino reto com barra)'),
          series: { type: 'integer', description: 'Quantidade de séries (padrão 3)' },
          reps: { type: 'integer', description: 'Repetições por série (padrão 10)' },
          carga_kg: { type: 'number', description: 'Carga em kg (padrão 0)' },
          rpe: { type: 'number', description: 'Esforço RPE 6 a 10, opcional' },
          superset: str('Grupo de superset A, B, C…, opcional'),
        },
        required: ['nome'],
      },
    },
  }, ['titulo']),
  fn('gerar_rotina_treino', 'Cria uma rotina estruturada na Ficha de Treino do usuário (estilo Hevy Trainer) com pasta opcional, dias da semana, supersets, séries, faixa de repetições e descanso.', {
    nome_rotina: str('Nome da rotina/divisão (ex.: Upper A · Força, Push Hipertrofia)'),
    pasta: str('Nome da pasta de rotinas (ex.: Upper Lower 4x, PPL), opcional'),
    dias_semana: {
      type: 'array',
      description: 'Dias da semana (0=domingo .. 6=sábado), opcional',
      items: { type: 'integer' },
    },
    observacoes: str('Nota estratégica da rotina, opcional'),
    exercicios: {
      type: 'array',
      description: 'Lista ordenada de exercícios da rotina (1 a 15)',
      items: {
        type: 'object',
        properties: {
          nome: str('Nome do exercício (ex.: Agachamento livre, Supino inclinado com halteres)'),
          series: { type: 'integer', description: 'Número de séries (1 a 10, padrão 3)' },
          reps: str('Repetições ou faixa (ex.: "8-12", "6-8", "12")'),
          carga_kg: { type: 'number', description: 'Carga inicial sugerida em kg, opcional' },
          descanso_s: { type: 'integer', description: 'Descanso em segundos (ex.: 90, 120, 150)' },
          superset: str('Letra do Superset (A, B, C…), opcional'),
          nota: str('Observação técnica, opcional'),
        },
        required: ['nome'],
      },
    },
  }, ['nome_rotina', 'exercicios']),
  fn('analisar_evolucao_treino', 'Analisa histórico de treinos e cardio do período: recordes pessoais (1RM Hevy 1–30 reps, maior carga), distribuição muscular ponderada (1,0× primário + 0,5× secundário), calorias ativas gastas e sinergia cruzada com dieta, hidratação e hábitos.', {
    dias: { type: 'integer', description: 'Janela de análise em dias (7 a 180, padrão 28)' },
  }),
  fn('registrar_cardio', 'Registra uma sessão de cardio em Saúde com cálculo de gasto calórico e sincronização de hábitos.', {
    tipo: str('Modalidade (ex.: corrida, caminhada, bike, elíptico)'),
    duracao_min: { type: 'integer', description: 'Duração em minutos' },
    distancia_km: { type: 'number', description: 'Distância em km, opcional' },
    kcal: { type: 'number', description: 'Calorias gastas, opcional' },
    notas: str('Observações, opcional'),
    data: str('YYYY-MM-DD, opcional (hoje)'),
  }, ['tipo', 'duracao_min']),
  fn('resumo_saude_hoje', 'Consulta peso mais recente, calorias/macros consumidos, gasto calórico de treinos/cardio, meta de água ajustada, jejum ativo e treinos/cardio de uma data (padrão hoje).', {
    data: str('YYYY-MM-DD, opcional (hoje)'),
  }),
  fn('consultar_oraculo_nutrientes', 'Consulta o Oráculo de Nutrientes: ranqueia alimentos mais ricos em um macro ou micronutriente (por densidade combinada, por 100 kcal ou por 100 g).', {
    nutriente: str('Nutriente alvo (ex.: proteina, fibra, ferro, potassio, magnesio, calcio, zinco, selenio, vitamina_c, vitamina_d, vitamina_a, b12, folato, colina, omega3, sodio)'),
    modo: { type: 'string', enum: ['oraculo', 'por_100kcal', 'por_100g'], description: 'Critério de ranking (padrão oraculo)' },
    limite: { type: 'integer', description: 'Quantidade de alimentos no ranking (1 a 20, padrão 8)' },
  }, ['nutriente']),
  fn('sugerir_alimentos_dia', 'Analisa calorias/macros restantes e lacunas de micronutrientes do dia no diário de Saúde e retorna alimentos candidatos ideais para fechar as metas.', {
    data: str('YYYY-MM-DD, opcional (hoje)'),
    refeicao: { type: 'string', enum: ['cafe', 'almoco', 'jantar', 'lanche'], description: 'Refeição alvo, opcional' },
    restricoes: str('Preferência alimentar ou exclusões (ex.: vegetariana, sem lactose), opcional'),
  }),
  fn('registrar_agua', 'Registra ingestão de água (mL) no diário de Saúde.', {
    ml: { type: 'integer', description: 'Volume em mililitros (ex.: 250, 300, 500)' },
    data: str('YYYY-MM-DD, opcional (hoje)'),
    hora: str('HH:MM, opcional'),
  }, ['ml']),
  fn('iniciar_jejum', 'Inicia um timer de jejum intermitente com protocolo pré-definido (14:10, 16:8, 18:6, 20:4, 23:1, 24h, 36h) ou horas customizadas.', {
    protocolo: str('Protocolo (ex.: 16:8, 18:6, 20:4, 14:10, 23:1, 24h, 36h ou custom)'),
    horas_alvo: { type: 'number', description: 'Meta de horas de jejum (opcional se protocolo padrão)' },
    inicio_data: str('Data de início YYYY-MM-DD, opcional (hoje)'),
    inicio_hora: str('Hora de início HH:MM, opcional (agora)'),
    notas: str('Observação opcional'),
  }),
  fn('encerrar_jejum', 'Encerra o jejum intermitente ativo no momento e calcula o tempo total jejuado.', {
    fim_data: str('Data de término YYYY-MM-DD, opcional (hoje)'),
    fim_hora: str('Hora de término HH:MM, opcional (agora)'),
    notas: str('Observação opcional'),
  }),
  fn('registrar_transferencia', 'Transfere saldo entre duas contas bancárias do usuário (ex.: Revolut para Wise).', {
    origem: str('Nome da conta de origem'),
    destino: str('Nome da conta de destino'),
    valor: { type: 'number', description: 'Valor positivo transferido' },
    moeda: { type: 'string', enum: ['BRL', 'EUR', 'USD'], description: 'Opcional (usa moeda da conta de origem)' },
    cotacao: { type: 'number', description: 'Cotação em BRL se moeda estrangeira, opcional' },
    descricao: str('Descrição opcional'),
    data: str('YYYY-MM-DD, opcional (hoje)'),
  }, ['origem', 'destino', 'valor']),
  fn('definir_orcamento', 'Define ou atualiza o teto mensal de gasto para uma categoria em Finanças.', {
    categoria: str('Nome da categoria (ex.: Mercado, Alimentação, Transporte)'),
    limite: { type: 'number', description: 'Valor mensal limite positivo' },
    moeda: { type: 'string', enum: ['BRL', 'EUR', 'USD'], description: 'Opcional (padrão BRL)' },
  }, ['categoria', 'limite']),
  fn('concluir_lembrete', 'Marca um lembrete aberto como concluído pelo título.', {
    titulo: str('Título ou parte do título do lembrete'),
  }, ['titulo']),
  fn('reagendar_compromisso', 'Reagenda um compromisso da Agenda para outra data e/ou horário.', {
    titulo: str('Título ou parte do título do compromisso'),
    data: str('Nova data YYYY-MM-DD'),
    inicio: str('Novo horário HH:MM, opcional'),
    fim: str('Novo horário de término HH:MM, opcional'),
  }, ['titulo', 'data']),
  fn('listar_memorias', 'Lista o que você já aprendeu e guardou sobre o usuário.'),
  fn('salvar_memoria', 'Guarda uma preferência, regra, rotina ou correção aprendida com o usuário para lembrar em futuras conversas.', {
    categoria: { type: 'string', enum: [...MEMORY_CATEGORIES] },
    conteudo: str('Fato claro e conciso (ex.: "Gastos em euro padrão vão na conta Revolut")'),
  }, ['conteudo']),
  fn('esquecer_memoria', 'Remove uma memória desatualizada ou corrigida pelo usuário.', {
    id: str('id da memória, se souber'),
    trecho: str('trecho do texto da memória'),
  }),
];

export type ToolArgs = Record<string, unknown>;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID = /^[0-9a-f-]{36}$/i;
const PRIORITY: Record<string, 'high' | 'medium' | 'low'> = { alta: 'high', media: 'medium', média: 'medium', baixa: 'low' };
const MEAL_MAP: Record<string, string> = { cafe: 'breakfast', almoco: 'lunch', jantar: 'dinner', lanche: 'snack' };

export const ORACLE_NUTRIENT_ALIASES: Record<string, { key: string; label: string; unit: string; rda: number }> = {
  proteina: { key: 'protein_g', label: 'Proteína', unit: 'g', rda: 140 },
  protein_g: { key: 'protein_g', label: 'Proteína', unit: 'g', rda: 140 },
  fibra: { key: 'fiber_g', label: 'Fibra', unit: 'g', rda: 30 },
  fiber_g: { key: 'fiber_g', label: 'Fibra', unit: 'g', rda: 30 },
  potassio: { key: 'potassium_mg', label: 'Potássio', unit: 'mg', rda: 3400 },
  potassium_mg: { key: 'potassium_mg', label: 'Potássio', unit: 'mg', rda: 3400 },
  ferro: { key: 'iron_mg', label: 'Ferro', unit: 'mg', rda: 14 },
  iron_mg: { key: 'iron_mg', label: 'Ferro', unit: 'mg', rda: 14 },
  magnesio: { key: 'magnesium_mg', label: 'Magnésio', unit: 'mg', rda: 400 },
  magnesium_mg: { key: 'magnesium_mg', label: 'Magnésio', unit: 'mg', rda: 400 },
  calcio: { key: 'calcium_mg', label: 'Cálcio', unit: 'mg', rda: 1000 },
  calcium_mg: { key: 'calcium_mg', label: 'Cálcio', unit: 'mg', rda: 1000 },
  zinco: { key: 'zinc_mg', label: 'Zinco', unit: 'mg', rda: 11 },
  zinc_mg: { key: 'zinc_mg', label: 'Zinco', unit: 'mg', rda: 11 },
  selenio: { key: 'selenium_ug', label: 'Selênio', unit: 'µg', rda: 55 },
  selenium_ug: { key: 'selenium_ug', label: 'Selênio', unit: 'µg', rda: 55 },
  cobre: { key: 'copper_mg', label: 'Cobre', unit: 'mg', rda: 0.9 },
  fosforo: { key: 'phosphorus_mg', label: 'Fósforo', unit: 'mg', rda: 700 },
  vitamina_c: { key: 'vit_c_mg', label: 'Vitamina C', unit: 'mg', rda: 90 },
  vit_c_mg: { key: 'vit_c_mg', label: 'Vitamina C', unit: 'mg', rda: 90 },
  vitamina_d: { key: 'vit_d_ug', label: 'Vitamina D', unit: 'µg', rda: 15 },
  vit_d_ug: { key: 'vit_d_ug', label: 'Vitamina D', unit: 'µg', rda: 15 },
  vitamina_a: { key: 'vit_a_ug', label: 'Vitamina A', unit: 'µg', rda: 900 },
  vit_a_ug: { key: 'vit_a_ug', label: 'Vitamina A', unit: 'µg', rda: 900 },
  vitamina_e: { key: 'vit_e_mg', label: 'Vitamina E', unit: 'mg', rda: 15 },
  vitamina_k: { key: 'vit_k_ug', label: 'Vitamina K', unit: 'µg', rda: 120 },
  b12: { key: 'vit_b12_ug', label: 'Vitamina B12', unit: 'µg', rda: 2.4 },
  vitamina_b12: { key: 'vit_b12_ug', label: 'Vitamina B12', unit: 'µg', rda: 2.4 },
  vit_b12_ug: { key: 'vit_b12_ug', label: 'Vitamina B12', unit: 'µg', rda: 2.4 },
  b6: { key: 'vit_b6_mg', label: 'Vitamina B6', unit: 'mg', rda: 1.3 },
  folato: { key: 'folate_ug', label: 'Folato (B9)', unit: 'µg', rda: 400 },
  b9: { key: 'folate_ug', label: 'Folato (B9)', unit: 'µg', rda: 400 },
  folate_ug: { key: 'folate_ug', label: 'Folato (B9)', unit: 'µg', rda: 400 },
  colina: { key: 'choline_mg', label: 'Colina', unit: 'mg', rda: 550 },
  omega3: { key: 'omega3_g', label: 'Ômega-3', unit: 'g', rda: 1.6 },
  omega_3: { key: 'omega3_g', label: 'Ômega-3', unit: 'g', rda: 1.6 },
  omega3_g: { key: 'omega3_g', label: 'Ômega-3', unit: 'g', rda: 1.6 },
  sodio: { key: 'sodium_mg', label: 'Sódio', unit: 'mg', rda: 2300 },
  sodium_mg: { key: 'sodium_mg', label: 'Sódio', unit: 'mg', rda: 2300 },
};

const FASTING_HOURS_BY_PROTOCOL: Record<string, number> = {
  '12:12': 12,
  '14:10': 14,
  '16:8': 16,
  '18:6': 18,
  '20:4': 20,
  '23:1': 23,
  omad: 23,
  '24h': 24,
  '36h': 36,
};

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
      const hora = text('hora');
      if (hora && !TIME.test(hora)) return fail('hora deve ser HH:MM');
      const projeto = text('projeto', 120);
      const out: ToolArgs = { titulo, data: data || null, prioridade: PRIORITY[text('prioridade').toLowerCase()] ?? 'medium' };
      if (hora) out.hora = hora;
      if (projeto) out.projeto = projeto;
      return { ok: true, args: out };
    }
    case 'concluir_tarefa':
    case 'marcar_habito': {
      const id = text('id', 64);
      const label = text(name === 'concluir_tarefa' ? 'titulo' : 'nome', 200);
      const validId = UUID.test(id);
      const valor = a.valor === undefined || a.valor === null ? null : Number(a.valor);
      if (valor !== null && !(Number.isFinite(valor) && valor >= 0)) return fail('valor deve ser um número positivo');
      if (validId) return { ok: true, args: name === 'marcar_habito' ? { id, valor } : { id } };
      if (!label) return fail(id ? 'id inválido: use o id que veio da listagem' : `informe o id ou o ${name === 'concluir_tarefa' ? 'título' : 'nome'}`);
      return { ok: true, args: name === 'marcar_habito' ? { id: null, nome: label, valor } : { id: null, titulo: label } };
    }
    case 'reagendar_tarefa': {
      const id = text('id', 64);
      const titulo = text('titulo', 200);
      const data = text('data');
      const hora = text('hora');
      if (!DATE.test(data)) return fail('data deve ser YYYY-MM-DD');
      if (hora && !TIME.test(hora)) return fail('hora deve ser HH:MM');
      if (UUID.test(id)) return { ok: true, args: { id, titulo: null, data, hora: hora || null } };
      if (!titulo) return fail('informe o id ou o título da tarefa');
      return { ok: true, args: { id: null, titulo, data, hora: hora || null } };
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
    case 'listar_agenda': {
      const inicio = text('inicio');
      const fim = text('fim');
      if (!DATE.test(inicio) || !DATE.test(fim)) return fail('inicio e fim devem ser YYYY-MM-DD');
      if (fim < inicio) return fail('fim deve ser igual ou posterior a inicio');
      return { ok: true, args: { inicio, fim } };
    }
    case 'criar_compromisso': {
      const titulo = text('titulo');
      const data = text('data');
      const inicio = text('inicio');
      const fim = text('fim');
      if (!titulo) return fail('titulo é obrigatório');
      if (!DATE.test(data)) return fail('data deve ser YYYY-MM-DD');
      if (inicio && !TIME.test(inicio)) return fail('inicio deve ser HH:MM');
      if (fim && !TIME.test(fim)) return fail('fim deve ser HH:MM');
      if (inicio && fim && fim <= inicio) return fail('fim deve ser depois de inicio');
      return {
        ok: true,
        args: { titulo, data, inicio: inicio || null, fim: fim || null, local: text('local', 140) || null, observacoes: text('observacoes', 500) || null },
      };
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
      const moedaRaw = text('moeda').toUpperCase();
      const moeda = moedaRaw ? (['BRL', 'EUR', 'USD'].includes(moedaRaw) ? moedaRaw : '') : null;
      const conta = text('conta', 80);
      const cotacao = a.cotacao === undefined || a.cotacao === null ? null : Number(a.cotacao);
      if (!descricao) return fail('descricao é obrigatória');
      if (!(valor > 0) || valor > 10_000_000) return fail('valor deve ser positivo');
      if (tipo !== 'despesa' && tipo !== 'receita') return fail('tipo deve ser despesa ou receita');
      if (moeda === '') return fail('moeda deve ser BRL, EUR ou USD');
      if (data && !DATE.test(data)) return fail('data deve ser YYYY-MM-DD');
      if (cotacao !== null && !(Number.isFinite(cotacao) && cotacao > 0)) return fail('cotacao deve ser positiva');
      const out: ToolArgs = { descricao, valor, tipo, categoria: text('categoria', 60) || null, data: data || null };
      if (moeda) out.moeda = moeda;
      if (conta) out.conta = conta;
      if (cotacao !== null) out.cotacao = cotacao;
      return { ok: true, args: out };
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
    case 'registrar_progresso_meta': {
      const id = text('id', 64);
      const titulo = text('titulo', 160);
      const valor = Number(a.valor);
      const data = text('data');
      if (!Number.isFinite(valor)) return fail('valor numérico é obrigatório');
      if (data && !DATE.test(data)) return fail('data deve ser YYYY-MM-DD');
      if (!UUID.test(id) && !titulo) return fail('informe o id ou o título da meta');
      return { ok: true, args: { id: UUID.test(id) ? id : null, titulo: titulo || null, valor, nota: text('nota', 200) || null, data: data || null } };
    }
    case 'criar_marco_projeto': {
      const projeto = text('projeto', 140);
      const titulo = text('titulo', 160);
      const prazo = text('prazo');
      if (!projeto) return fail('projeto é obrigatório');
      if (!titulo) return fail('titulo é obrigatório');
      if (prazo && !DATE.test(prazo)) return fail('prazo deve ser YYYY-MM-DD');
      return { ok: true, args: { projeto, titulo, prazo: prazo || null } };
    }
    case 'criar_plano_projeto': {
      const projeto = text('projeto', 140);
      if (!projeto) return fail('projeto é obrigatório');
      if (!Array.isArray(a.etapas) || !a.etapas.length) return fail('etapas deve ter ao menos 1 item');
      const etapas: { titulo: string; prazo: string | null; subetapas: string[] }[] = [];
      for (const rawStep of a.etapas.slice(0, 12)) {
        const s = (rawStep && typeof rawStep === 'object' ? rawStep : {}) as Record<string, unknown>;
        const titulo = typeof s.titulo === 'string' ? s.titulo.trim().slice(0, 160) : '';
        if (!titulo) return fail('cada etapa precisa de titulo');
        const prazo = typeof s.prazo === 'string' ? s.prazo.trim() : '';
        if (prazo && !DATE.test(prazo)) return fail('prazo da etapa deve ser YYYY-MM-DD');
        const subs = Array.isArray(s.subetapas)
          ? s.subetapas.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim().slice(0, 160)).slice(0, 8)
          : [];
        etapas.push({ titulo, prazo: prazo || null, subetapas: subs });
      }
      return { ok: true, args: { projeto, etapas } };
    }
    case 'concluir_marco_projeto': {
      const projeto = text('projeto', 140);
      const titulo = text('titulo', 160);
      if (!projeto) return fail('projeto é obrigatório');
      if (!titulo) return fail('titulo da etapa é obrigatório');
      return { ok: true, args: { projeto, titulo } };
    }
    case 'registrar_refeicao': {
      const alimento = text('alimento', 160);
      const kcal = Math.round(Number(a.kcal));
      const refRaw = text('refeicao').toLowerCase() || 'lanche';
      const meal = MEAL_MAP[refRaw] ?? 'snack';
      const data = text('data');
      if (!alimento) return fail('alimento é obrigatório');
      if (!(kcal >= 0 && kcal <= 10000)) return fail('kcal inválido');
      if (data && !DATE.test(data)) return fail('data deve ser YYYY-MM-DD');
      const numOr0 = (k: string) => { const n = Number(a[k]); return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : 0; };
      const q = Number(a.quantidade_g);
      return {
        ok: true,
        args: {
          alimento, meal, kcal,
          proteina_g: numOr0('proteina_g'), carbo_g: numOr0('carbo_g'), gordura_g: numOr0('gordura_g'),
          quantidade_g: Number.isFinite(q) && q > 0 ? Math.round(q) : 100,
          data: data || null,
        },
      };
    }
    case 'registrar_peso': {
      const peso = Math.round(Number(a.peso_kg) * 10) / 10;
      if (!(peso >= 25 && peso <= 350)) return fail('peso_kg deve estar entre 25 e 350');
      return { ok: true, args: { peso_kg: peso, observacoes: text('observacoes', 200) || null } };
    }
    case 'registrar_treino': {
      const titulo = text('titulo', 140);
      const data = text('data');
      const dur = a.duracao_min == null ? null : Math.round(Number(a.duracao_min));
      const kcal = a.kcal == null ? null : Math.round(Number(a.kcal));
      const modRaw = text('modalidade', 30).toLowerCase();
      const validMods = ['musculacao', 'calistenia', 'funcional', 'mobilidade', 'esporte', 'outro'];
      const modalidade = validMods.includes(modRaw) ? modRaw : 'musculacao';
      if (!titulo) return fail('titulo do treino é obrigatório');
      if (data && !DATE.test(data)) return fail('data deve ser YYYY-MM-DD');
      if (dur !== null && !(dur > 0 && dur <= 600)) return fail('duracao_min deve estar entre 1 e 600');
      if (kcal !== null && !(kcal >= 0 && kcal <= 10000)) return fail('kcal inválido');

      const exercicios: { nome: string; series: number; reps: number; carga_kg: number; rpe: number | null; superset: string | null }[] = [];
      if (Array.isArray(a.exercicios)) {
        for (const rawEx of a.exercicios.slice(0, 20)) {
          const ex = (rawEx && typeof rawEx === 'object' ? rawEx : {}) as Record<string, unknown>;
          const nome = typeof ex.nome === 'string' ? ex.nome.trim().slice(0, 120) : '';
          if (!nome) continue;
          const series = ex.series == null ? 3 : Math.max(1, Math.min(15, Math.round(Number(ex.series) || 3)));
          const reps = ex.reps == null ? 10 : Math.max(1, Math.min(100, Math.round(Number(ex.reps) || 10)));
          const carga = ex.carga_kg == null ? 0 : Math.max(0, Math.round(Number(ex.carga_kg) * 100) / 100 || 0);
          const rpeNum = ex.rpe == null ? NaN : Number(ex.rpe);
          const rpe = Number.isFinite(rpeNum) && rpeNum >= 1 && rpeNum <= 10 ? rpeNum : null;
          const ss = typeof ex.superset === 'string' && ex.superset.trim() ? ex.superset.trim().slice(0, 2).toUpperCase() : null;
          exercicios.push({ nome, series, reps, carga_kg: carga, rpe, superset: ss });
        }
      }
      const out: ToolArgs = { titulo, modalidade, duracao_min: dur, kcal, notas: text('notas', 400) || null, data: data || null };
      if (exercicios.length) out.exercicios = exercicios;
      return { ok: true, args: out };
    }
    case 'gerar_rotina_treino': {
      const nome_rotina = text('nome_rotina', 120);
      if (!nome_rotina) return fail('nome_rotina é obrigatório');
      if (!Array.isArray(a.exercicios) || !a.exercicios.length) return fail('exercicios deve ter ao menos 1 item');
      const exercicios: { nome: string; series: number; reps: string; carga_kg: number | null; descanso_s: number; superset: string | null; nota: string | null }[] = [];
      for (const rawEx of a.exercicios.slice(0, 15)) {
        const ex = (rawEx && typeof rawEx === 'object' ? rawEx : {}) as Record<string, unknown>;
        const nome = typeof ex.nome === 'string' ? ex.nome.trim().slice(0, 120) : '';
        if (!nome) return fail('cada exercício precisa de nome');
        const series = ex.series == null ? 3 : Math.max(1, Math.min(10, Math.round(Number(ex.series) || 3)));
        const reps = typeof ex.reps === 'string' && ex.reps.trim() ? ex.reps.trim().slice(0, 16) : '8-12';
        const cargaNum = ex.carga_kg == null ? NaN : Number(ex.carga_kg);
        const carga_kg = Number.isFinite(cargaNum) && cargaNum > 0 ? Math.round(cargaNum * 100) / 100 : null;
        const descanso_s = ex.descanso_s == null ? 90 : Math.max(15, Math.min(600, Math.round(Number(ex.descanso_s) || 90)));
        const superset = typeof ex.superset === 'string' && ex.superset.trim() ? ex.superset.trim().slice(0, 2).toUpperCase() : null;
        const nota = typeof ex.nota === 'string' && ex.nota.trim() ? ex.nota.trim().slice(0, 160) : null;
        exercicios.push({ nome, series, reps, carga_kg, descanso_s, superset, nota });
      }
      const dias_semana = Array.isArray(a.dias_semana)
        ? [...new Set(a.dias_semana.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
        : [];
      return {
        ok: true,
        args: {
          nome_rotina,
          pasta: text('pasta', 80) || null,
          dias_semana,
          observacoes: text('observacoes', 240) || null,
          exercicios,
        },
      };
    }
    case 'analisar_evolucao_treino': {
      const dias = a.dias == null ? 28 : Math.round(Number(a.dias));
      if (!(Number.isFinite(dias) && dias >= 7 && dias <= 180)) return fail('dias deve estar entre 7 e 180');
      return { ok: true, args: { dias } };
    }
    case 'registrar_cardio': {
      const tipo = text('tipo', 80);
      const dur = Math.round(Number(a.duracao_min));
      const dist = a.distancia_km == null ? null : Math.round(Number(a.distancia_km) * 100) / 100;
      const kcal = a.kcal == null ? null : Math.round(Number(a.kcal));
      const data = text('data');
      if (!tipo) return fail('tipo de cardio é obrigatório');
      if (!(dur > 0 && dur <= 600)) return fail('duracao_min deve estar entre 1 e 600');
      if (dist !== null && !(dist >= 0 && dist <= 300)) return fail('distancia_km inválido');
      if (kcal !== null && !(kcal >= 0 && kcal <= 10000)) return fail('kcal inválido');
      if (data && !DATE.test(data)) return fail('data deve ser YYYY-MM-DD');
      return { ok: true, args: { tipo, duracao_min: dur, distancia_km: dist, kcal, notas: text('notas', 300) || null, data: data || null } };
    }
    case 'resumo_saude_hoje': {
      const data = text('data');
      if (data && !DATE.test(data)) return fail('data deve ser YYYY-MM-DD');
      return { ok: true, args: { data: data || null } };
    }
    case 'consultar_oraculo_nutrientes': {
      const rawNut = text('nutriente', 60)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[\s-]+/g, '_');
      const spec = ORACLE_NUTRIENT_ALIASES[rawNut];
      if (!spec) {
        return fail(`nutriente desconhecido: informe um de ${Object.keys(ORACLE_NUTRIENT_ALIASES).filter((k) => !k.includes('_g') && !k.includes('_mg') && !k.includes('_ug')).join(', ')}`);
      }
      const modoRaw = text('modo').toLowerCase();
      const modo = ['oraculo', 'por_100kcal', 'por_100g'].includes(modoRaw) ? modoRaw : 'oraculo';
      const lim = a.limite == null ? 8 : Math.round(Number(a.limite));
      if (!(lim >= 1 && lim <= 20)) return fail('limite deve estar entre 1 e 20');
      return { ok: true, args: { key: spec.key, label: spec.label, unit: spec.unit, rda: spec.rda, modo, limite: lim } };
    }
    case 'sugerir_alimentos_dia': {
      const data = text('data');
      if (data && !DATE.test(data)) return fail('data deve ser YYYY-MM-DD');
      const refRaw = text('refeicao').toLowerCase();
      const refeicao = refRaw && MEAL_MAP[refRaw] ? refRaw : null;
      const restricoes = text('restricoes', 240) || null;
      return { ok: true, args: { data: data || null, refeicao, restricoes } };
    }
    case 'registrar_agua': {
      const ml = Math.round(Number(a.ml));
      const data = text('data');
      const hora = text('hora');
      if (!(Number.isFinite(ml) && ml >= 10 && ml <= 5000)) return fail('ml deve estar entre 10 e 5000');
      if (data && !DATE.test(data)) return fail('data deve ser YYYY-MM-DD');
      if (hora && !TIME.test(hora)) return fail('hora deve ser HH:MM');
      return { ok: true, args: { ml, data: data || null, hora: hora || null } };
    }
    case 'iniciar_jejum': {
      const explicitProt = text('protocolo', 30).toLowerCase();
      const presetHours = explicitProt ? FASTING_HOURS_BY_PROTOCOL[explicitProt] : undefined;
      const horas = a.horas_alvo != null ? Math.round(Number(a.horas_alvo) * 10) / 10 : (presetHours ?? 16);
      if (!(Number.isFinite(horas) && horas >= 1 && horas <= 168)) return fail('horas_alvo deve estar entre 1 e 168');
      const inicio_data = text('inicio_data');
      const inicio_hora = text('inicio_hora');
      if (inicio_data && !DATE.test(inicio_data)) return fail('inicio_data deve ser YYYY-MM-DD');
      if (inicio_hora && !TIME.test(inicio_hora)) return fail('inicio_hora deve ser HH:MM');
      const protocolo = presetHours ? (explicitProt === 'omad' ? '23:1' : explicitProt) : (a.horas_alvo != null ? 'custom' : '16:8');
      return {
        ok: true,
        args: {
          protocolo,
          horas_alvo: horas,
          inicio_data: inicio_data || null,
          inicio_hora: inicio_hora || null,
          notas: text('notas', 240) || null,
        },
      };
    }
    case 'encerrar_jejum': {
      const fim_data = text('fim_data');
      const fim_hora = text('fim_hora');
      if (fim_data && !DATE.test(fim_data)) return fail('fim_data deve ser YYYY-MM-DD');
      if (fim_hora && !TIME.test(fim_hora)) return fail('fim_hora deve ser HH:MM');
      return {
        ok: true,
        args: {
          fim_data: fim_data || null,
          fim_hora: fim_hora || null,
          notas: text('notas', 240) || null,
        },
      };
    }
    case 'registrar_transferencia': {
      const origem = text('origem', 100);
      const destino = text('destino', 100);
      const valor = Math.round(Number(a.valor) * 100) / 100;
      const moedaRaw = text('moeda').toUpperCase();
      const moeda = ['BRL', 'EUR', 'USD'].includes(moedaRaw) ? moedaRaw : null;
      const cotacao = a.cotacao == null ? null : Number(a.cotacao);
      const data = text('data');
      if (!origem || !destino) return fail('origem e destino são obrigatórios');
      if (!(valor > 0 && valor <= 1e9)) return fail('valor deve ser positivo');
      if (cotacao !== null && !(Number.isFinite(cotacao) && cotacao > 0)) return fail('cotacao inválida');
      if (data && !DATE.test(data)) return fail('data deve ser YYYY-MM-DD');
      return { ok: true, args: { origem, destino, valor, ...(moeda ? { moeda } : {}), ...(cotacao ? { cotacao } : {}), descricao: text('descricao', 200) || null, data: data || null } };
    }
    case 'definir_orcamento': {
      const categoria = text('categoria', 80);
      const limite = Math.round(Number(a.limite) * 100) / 100;
      const moedaRaw = text('moeda').toUpperCase();
      const moeda = ['BRL', 'EUR', 'USD'].includes(moedaRaw) ? moedaRaw : 'BRL';
      if (!categoria) return fail('categoria é obrigatória');
      if (!(limite > 0 && limite <= 1e9)) return fail('limite deve ser positivo');
      return { ok: true, args: { categoria, limite, moeda } };
    }
    case 'concluir_lembrete': {
      const titulo = text('titulo', 160);
      if (!titulo) return fail('titulo do lembrete é obrigatório');
      return { ok: true, args: { titulo } };
    }
    case 'reagendar_compromisso': {
      const titulo = text('titulo', 160);
      const data = text('data');
      const inicio = text('inicio');
      const fim = text('fim');
      if (!titulo) return fail('titulo do compromisso é obrigatório');
      if (!DATE.test(data)) return fail('data deve ser YYYY-MM-DD');
      if (inicio && !TIME.test(inicio)) return fail('inicio deve ser HH:MM');
      if (fim && !TIME.test(fim)) return fail('fim deve ser HH:MM');
      return { ok: true, args: { titulo, data, inicio: inicio || null, fim: fim || null } };
    }
    case 'salvar_memoria': {
      const conteudo = text('conteudo', 400);
      const catRaw = text('categoria').toLowerCase();
      const categoria = (MEMORY_CATEGORIES as readonly string[]).includes(catRaw) ? catRaw : 'preferencia';
      if (!conteudo) return fail('conteudo é obrigatório');
      return { ok: true, args: { categoria, conteudo } };
    }
    case 'esquecer_memoria': {
      const id = text('id', 64);
      const trecho = text('trecho', 160);
      if (!UUID.test(id) && !trecho) return fail('informe id ou trecho da memória');
      return { ok: true, args: { id: UUID.test(id) ? id : null, trecho: trecho || null } };
    }
    case 'listar_habitos':
    case 'listar_contas':
    case 'listar_metas':
    case 'listar_projetos':
    case 'listar_memorias':
      return { ok: true, args: {} };
    default:
      return fail(`ferramenta desconhecida: ${name}`);
  }
}

/** Tool calls that change data; the reply lists them so the user sees what was done (and can undo). */
export const WRITES = new Set([
  'criar_tarefa', 'concluir_tarefa', 'reagendar_tarefa', 'criar_lembrete', 'concluir_lembrete',
  'criar_compromisso', 'reagendar_compromisso', 'marcar_habito', 'registrar_transacao',
  'registrar_transferencia', 'definir_orcamento', 'criar_nota', 'registrar_progresso_meta',
  'criar_marco_projeto', 'criar_plano_projeto', 'concluir_marco_projeto',
  'registrar_refeicao', 'registrar_peso', 'registrar_treino', 'gerar_rotina_treino', 'registrar_cardio',
  'registrar_agua', 'iniciar_jejum', 'encerrar_jejum',
  'salvar_memoria', 'esquecer_memoria',
]);

/** Validates an optional base64 image data URL sent from the browser for multimodal prompts. */
export function validImageDataUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s)) return null;
  if (s.length > 4_000_000) return null;
  return s;
}

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

export interface Snapshot {
  name?: string | null;
  displayCurrency?: string | null;
  screenContext?: { route?: string; label?: string; hint?: string } | null;
  tasksToday: string[];
  tasksLate: number;
  habitsToday: string[];
  goals: string[];
  eventsToday?: string[];
  projects?: string[];
  accounts?: { name: string; currency: string }[];
  memories?: { category: string; content: string }[];
}

export function systemPrompt(now: LocalNow, tz: string, s: Snapshot): string {
  const lines = [
    'Você é o assistente autônomo do Painel, o sistema pessoal do usuário (tarefas, hábitos, agenda, lembretes, saúde/nutrição estilo Cronometer, treinos estilo Hevy, jejum intermitente, finanças multimoeda, projetos, metas e notas).',
    `Hoje é ${WEEKDAYS[now.weekday]}, ${now.date.split('-').reverse().join('/')}, ${now.time} (${tz}).${s.name ? ` O usuário se chama ${s.name}.` : ''}${s.displayCurrency ? ` Moeda principal de exibição: ${s.displayCurrency}.` : ''}`,
    'Responda em português do Brasil, direto, claro e prático. Use listas curtas só quando ajudarem.',
    'Autonomia e precisão:',
    '- Use as ferramentas para consultar e agir; nunca invente dados nem ids. Encadeie quantas ferramentas forem necessárias para resolver o pedido por completo numa única resposta.',
    '- Para criar várias etapas e subetapas de um projeto, use criar_plano_projeto em uma única chamada.',
    '- Em Treinos (estilo Hevy) e Sinergia entre Módulos: use analisar_evolucao_treino para diagnosticar recordes pessoais (1RM), simetria muscular (1,0× primário + 0,5× secundário), calorias gastas e sinergia com dieta/água/hábitos. Use gerar_rotina_treino para criar divisões completas com pastas e supersets na Ficha do usuário, e registrar_treino (passando exercicios quando informados) ou registrar_cardio para registrar sessões calculando calorias gastas e sincronizando hábitos automaticamente.',
    '- Em Saúde e Nutrição: para sugerir refeições que fechem macros e micronutrientes faltantes do dia (considerando também o gasto calórico dos treinos), chame sugerir_alimentos_dia (e consultar_oraculo_nutrientes se quiser focar num nutriente específico), monte 2 a 3 opções com gramatura/medidas caseiras exatas e ofereça registrar a escolhida com registrar_refeicao. Para hidratação use registrar_agua e para jejum intermitente use iniciar_jejum / encerrar_jejum.',
    '- Para concluir/reagendar tarefa ou marcar hábito, passe o título/nome. Nunca diga que algo não existe sem consultar antes (listar_tarefas com periodo "todas").',
    '- Converta datas relativas (hoje, amanhã, sexta) para YYYY-MM-DD a partir de hoje. Em finanças, respeite a moeda citada (EUR, USD ou BRL) e escolha a conta adequada conforme o que você sabe do usuário.',
    '- Se o usuário enviar uma foto de recibo/nota fiscal ou prato de comida, extraia os dados com cuidado e registre usando a ferramenta certa (ou confirme se algum valor estiver ilegível).',
    '- Aprendizado contínuo: sempre que o usuário revelar uma preferência duradoura, regra financeira (ex.: conta padrão por moeda), rotina de trabalho/estudo ou corrigir seu comportamento, chame salvar_memoria para lembrar nas próximas conversas. Se uma regra mudar, use esquecer_memoria e salve a nova.',
    '- Só pergunte antes quando faltar dado essencial (ex.: valor de um gasto) ou para exclusões permanentes. Depois de agir, confirme de forma objetiva o que foi feito.',
    '- Você não dá diagnóstico médico nem recomendação de investimento específica.',
    '',
    'Resumo de hoje:',
    `- Tarefas para hoje: ${s.tasksToday.length ? s.tasksToday.join('; ') : 'nenhuma'}${s.tasksLate ? ` (mais ${s.tasksLate} atrasadas)` : ''}`,
    `- Hábitos de hoje: ${s.habitsToday.length ? s.habitsToday.join('; ') : 'nenhum'}`,
    `- Metas ativas: ${s.goals.length ? s.goals.join('; ') : 'nenhuma'}`,
  ];
  if (s.screenContext?.label) {
    lines.push(`- Tela atual do usuário: ${s.screenContext.label} (${s.screenContext.route ?? ''})${s.screenContext.hint ? ` — ${s.screenContext.hint}` : ''}`);
  }
  if (s.eventsToday?.length) lines.push(`- Compromissos hoje: ${s.eventsToday.join('; ')}`);
  if (s.projects?.length) lines.push(`- Projetos ativos: ${s.projects.join('; ')}`);
  if (s.accounts?.length) lines.push(`- Contas bancárias: ${s.accounts.map((a) => `${a.name} (${a.currency})`).join(', ')}`);
  if (s.memories?.length) {
    lines.push('', 'O que você já aprendeu sobre o usuário (use automaticamente):');
    for (const m of s.memories) lines.push(`- [${m.category}] ${m.content}`);
  }
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

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

/** Default priority: Claude Sonnet 4 first for strong autonomous multi-step tool calling, with safe fallbacks. */
export const PAID_MODELS = [
  'anthropic/claude-sonnet-4',
  'anthropic/claude-3.7-sonnet',
  'google/gemini-2.5-pro',
  'openai/gpt-4.1-mini',
  'deepseek/deepseek-chat-v3.1',
];

/** Free variants: no credits needed, a daily message limit. */
export const FREE_MODELS = ['deepseek/deepseek-chat-v3.1:free', 'deepseek/deepseek-chat-v3-0324:free', 'deepseek/deepseek-chat:free'];

/** Order to try: env override alone; else user's chosen model first, then last working, then paid, then free. */
export function modelCandidates(preferred?: string, working?: string | null, userModel?: string | null): string[] {
  if (preferred) return [preferred];
  const base = [...PAID_MODELS, ...FREE_MODELS];
  const ordered: string[] = [];
  const push = (m?: string | null) => { if (m && !ordered.includes(m)) ordered.push(m); };
  push(userModel);
  if (working && base.includes(working)) push(working);
  for (const m of base) push(m);
  return ordered;
}

export interface CatalogModel { id: string; context_length?: number; supported_parameters?: string[] }

// Families that follow instructions and call tools well, best first.
const FAMILIES = ['deepseek/', 'qwen/', 'meta-llama/', 'mistralai/', 'google/', 'z-ai/', 'moonshotai/', 'openai/'];

/** From OpenRouter's catalog: free models that take tools, DeepSeek first, then good families, bigger context first. At most 8. */
export function pickFreeModels(catalog: CatalogModel[]): string[] {
  const rank = (id: string) => { const i = FAMILIES.findIndex((f) => id.startsWith(f)); return i < 0 ? FAMILIES.length : i; };
  return catalog
    .filter((m) => typeof m?.id === 'string' && m.id.endsWith(':free') && m.supported_parameters?.includes('tools'))
    .sort((a, b) => rank(a.id) - rank(b.id) || (b.context_length ?? 0) - (a.context_length ?? 0))
    .slice(0, 8)
    .map((m) => m.id);
}

/** How long to leave a model aside after a failure: no credits 10 min, gone, restricted or unsupported 1 h, busy 1 min. */
export function skipFor(status: number): number {
  if (status === 402) return 10 * 60_000;
  if (status === 404 || status === 400 || status === 403) return 60 * 60_000;
  if (status === 429) return 60_000;
  return 0;
}

/** Candidates whose wait is over; all of them if every one is waiting. */
export function withoutSkipped(candidates: string[], skip: Map<string, number>, now: number): string[] {
  const ready = candidates.filter((m) => (skip.get(m) ?? 0) <= now);
  return ready.length ? ready : candidates;
}

/**
 * The question and the answer as rows for chat_messages. Both carry the same
 * columns: in a bulk insert a column missing from one row is sent as null,
 * which the not-null metadata column refuses.
 */
export function exchangeRows(question: string, reply: string, metadata: Record<string, unknown>, at = new Date()) {
  const userMeta: Record<string, unknown> = {};
  if (typeof metadata.thread_id === 'string' && metadata.thread_id) userMeta.thread_id = metadata.thread_id;
  if (typeof metadata.thread_title === 'string' && metadata.thread_title) userMeta.thread_title = metadata.thread_title;
  return [
    { content: question, is_user: true, metadata: userMeta, created_at: at.toISOString() },
    { content: reply, is_user: false, metadata, created_at: new Date(at.getTime() + 1).toISOString() },
  ];
}

const fold = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Items whose name matches: an exact match alone; else names that start with it, then those that contain it. */
export function matchByName<T extends { name: string }>(rows: T[], query: string): T[] {
  const q = fold(query);
  if (!q) return [];
  const exact = rows.filter((r) => fold(r.name) === q);
  if (exact.length) return exact;
  const starts = rows.filter((r) => fold(r.name).startsWith(q));
  const contains = rows.filter((r) => !starts.includes(r) && fold(r.name).includes(q));
  return [...starts, ...contains];
}
