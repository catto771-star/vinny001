import { describe, expect, it } from 'vitest';
import {
  AUTOMATIONS_THREAD_ID,
  DEFAULT_THREAD_ID,
  actionLinkOf,
  expandSlashCommand,
  filterThreadMessages,
  groupThreads,
  matchSlashCommands,
  playbooksForRoute,
  screenContextFromLocation,
  titleFromMessage,
  type ChatMessageRow,
} from './assistant';

describe('screenContextFromLocation', () => {
  it('identifies the active section and extracts an open project id', () => {
    expect(screenContextFromLocation('/financas')).toMatchObject({ route: '/financas', label: 'Finanças' });
    const proj = screenContextFromLocation('/projetos', '?p=abc-123');
    expect(proj.route).toBe('/projetos');
    expect(proj.projectId).toBe('abc-123');
    expect(proj.hint).toContain('abc-123');
  });
});

describe('threads', () => {
  const msgs: ChatMessageRow[] = [
    { id: '1', content: 'Oi', is_user: true, created_at: '2026-11-23T10:00:00Z', metadata: {} },
    { id: '2', content: 'Olá!', is_user: false, created_at: '2026-11-23T10:00:01Z', metadata: {} },
    { id: '3', content: 'Resumo matinal', is_user: false, created_at: '2026-11-23T08:00:00Z', metadata: { kind: 'briefing' } },
    { id: '4', content: 'Quebre o projeto QQI em etapas', is_user: true, created_at: '2026-11-23T12:00:00Z', metadata: { thread_id: 't-qqi', thread_title: 'Planejamento QQI' } },
    { id: '5', content: 'Pronto, 4 etapas criadas.', is_user: false, created_at: '2026-11-23T12:00:05Z', metadata: { thread_id: 't-qqi', thread_title: 'Planejamento QQI' } },
  ];

  it('groups messages into chat threads first (newest first) and autopilot briefings separately', () => {
    const threads = groupThreads(msgs);
    expect(threads.map((t) => [t.id, t.title, t.count])).toEqual([
      ['t-qqi', 'Planejamento QQI', 2],
      [DEFAULT_THREAD_ID, 'Conversa geral', 2],
      [AUTOMATIONS_THREAD_ID, 'Piloto automático', 1],
    ]);
  });

  it('filters messages by selected thread id', () => {
    expect(filterThreadMessages(msgs, 't-qqi').map((m) => m.id)).toEqual(['4', '5']);
    expect(filterThreadMessages(msgs, AUTOMATIONS_THREAD_ID).map((m) => m.id)).toEqual(['3']);
  });

  it('builds a clean trimmed title from the first message', () => {
    expect(titleFromMessage('  Planejar   estudos do NED College  ', 20)).toBe('Planejar estudos do…');
    expect(titleFromMessage('   ')).toBe('Nova conversa');
  });
});

describe('slash commands', () => {
  it('matches commands only while typing the command token', () => {
    expect(matchSlashCommands('/g').map((c) => c.cmd)).toEqual(['/gasto']);
    expect(matchSlashCommands('/').length).toBeGreaterThanOrEqual(6);
    expect(matchSlashCommands('/gasto 15 euro')).toEqual([]);
    expect(matchSlashCommands('normal text')).toEqual([]);
  });

  it('expands slash commands with or without extra arguments', () => {
    expect(expandSlashCommand('/dia')).toContain('Organize meu dia de hoje');
    expect(expandSlashCommand('/oraculo')).toContain('sugerir_alimentos_dia');
    expect(expandSlashCommand('/jejum 18:6 agora')).toBe('Gerencie meu jejum intermitente: 18:6 agora');
    expect(expandSlashCommand('/gasto € 14,50 no Tesco')).toBe('Registre o gasto: € 14,50 no Tesco');
    expect(expandSlashCommand('/etapas QQI Level 5')).toBe('Crie um plano prático de etapas e subetapas para o projeto QQI Level 5');
    expect(expandSlashCommand('/desconhecido foo')).toBe('/desconhecido foo');
  });
});

describe('action links & contextual playbooks', () => {
  it('resolves explicit links first and falls back by tool name', () => {
    expect(actionLinkOf({ tool: 'criar_plano_projeto', link: '/projetos?p=p1' })).toBe('/projetos?p=p1');
    expect(actionLinkOf({ tool: 'registrar_transferencia' })).toBe('/financas');
    expect(actionLinkOf({ tool: 'registrar_treino' })).toBe('/saude');
    expect(actionLinkOf({ tool: 'registrar_agua' })).toBe('/saude');
    expect(actionLinkOf({ tool: 'iniciar_jejum' })).toBe('/saude?aba=Jejum');
    expect(actionLinkOf({ tool: 'salvar_memoria' })).toBeNull();
  });

  it('returns route-specific playbooks for Projetos, Finanças, Saúde and default', () => {
    expect(playbooksForRoute('/projetos')[0].id).toBe('proj-plan');
    expect(playbooksForRoute('/financas')[0].id).toBe('fin-sum');
    expect(playbooksForRoute('/saude').map((p) => p.id)).toContain('hlth-oracle');
    expect(playbooksForRoute('/saude').map((p) => p.id)).toContain('hlth-fast');
    expect(screenContextFromLocation('/saude', '?aba=Oráculo').hint).toContain('Aba ativa em Saúde: Oráculo');
    expect(playbooksForRoute('/inicio').length).toBe(4);
  });
});

