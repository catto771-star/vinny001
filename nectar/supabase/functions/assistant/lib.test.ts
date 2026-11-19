import { describe, expect, it } from 'vitest';
import { TOOLS, addDays, checkArgs, cleanKey, history, keyHint, maskKey, modelCandidates, localNow, systemPrompt, textToBlocks, zonedToUtc } from './lib';

const SP = 'America/Sao_Paulo';

describe('time zone', () => {
  it('gives the local date, time and weekday', () => {
    // 02:30 UTC on the 19th is still 23:30 on Wednesday the 18th in São Paulo.
    expect(localNow(SP, new Date('2026-11-19T02:30:00Z'))).toEqual({ date: '2026-11-18', time: '23:30', weekday: 3 });
  });
  it('turns a local time into the UTC instant', () => {
    expect(zonedToUtc('2026-11-18', '09:00', SP)).toBe('2026-11-18T12:00:00.000Z');
    expect(zonedToUtc('2026-07-01', '22:15', 'Europe/London')).toBe('2026-07-01T21:15:00.000Z');
  });
  it('adds days across months', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  });
});

describe('tool arguments', () => {
  it('every tool has a checker', () => {
    for (const t of TOOLS) expect(checkArgs(t.function.name, {}).error ?? '').not.toMatch(/desconhecida/);
  });
  it('normalizes a task', () => {
    expect(checkArgs('criar_tarefa', { titulo: '  Ligar pro banco ', data: '2026-11-20', prioridade: 'Alta' }))
      .toEqual({ ok: true, args: { titulo: 'Ligar pro banco', data: '2026-11-20', prioridade: 'high' } });
    expect(checkArgs('criar_tarefa', { titulo: 'x', data: 'amanhã' })).toEqual({ ok: false, error: 'data deve ser YYYY-MM-DD' });
    expect(checkArgs('criar_tarefa', {})).toMatchObject({ ok: false });
  });
  it('refuses made-up ids, odd times and bad money', () => {
    expect(checkArgs('concluir_tarefa', { id: '3' })).toMatchObject({ ok: false });
    expect(checkArgs('criar_lembrete', { titulo: 'x', data: '2026-11-20', hora: '25:00' })).toEqual({ ok: false, error: 'hora deve ser HH:MM' });
    expect(checkArgs('registrar_transacao', { descricao: 'Mercado', valor: -5, tipo: 'despesa' })).toMatchObject({ ok: false });
    expect(checkArgs('registrar_transacao', { descricao: 'Mercado', valor: 87.456, tipo: 'despesa' }))
      .toEqual({ ok: true, args: { descricao: 'Mercado', valor: 87.46, tipo: 'despesa', categoria: null, data: null } });
    expect(checkArgs('resumo_financeiro', { ano: 2026, mes: 13 })).toMatchObject({ ok: false });
    expect(checkArgs('apagar_tudo', {})).toEqual({ ok: false, error: 'ferramenta desconhecida: apagar_tudo' });
  });
  it('accepts a habit with or without a value', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    expect(checkArgs('marcar_habito', { id })).toEqual({ ok: true, args: { id, valor: null } });
    expect(checkArgs('marcar_habito', { id, valor: 2.5 })).toEqual({ ok: true, args: { id, valor: 2.5 } });
  });
});

describe('notes', () => {
  it('makes paragraphs and list items', () => {
    const b = textToBlocks('Ideia\n- um\n- dois') as { type: string; content: { text: string }[] }[];
    expect(b.map((x) => [x.type, x.content[0]?.text])).toEqual([['paragraph', 'Ideia'], ['bulletListItem', 'um'], ['bulletListItem', 'dois']]);
  });
});

describe('prompt and history', () => {
  it('states today and the snapshot', () => {
    const p = systemPrompt({ date: '2026-11-18', time: '09:05', weekday: 3 }, SP, { name: 'Vini', tasksToday: ['Pagar IPVA'], tasksLate: 2, habitsToday: [], goals: ['Correr 100 km'] });
    expect(p).toContain('quarta-feira, 18/11/2026, 09:05');
    expect(p).toContain('Pagar IPVA (mais 2 atrasadas)');
    expect(p).toContain('Hábitos de hoje: nenhum');
  });
  it('sends the latest messages within budget, starting with the user', () => {
    const m = (content: string, is_user: boolean, t: string) => ({ content, is_user, created_at: `2026-11-18T0${t}:00:00Z` });
    const h = history([m('resumo', false, '1'), m('oi', true, '2'), m('olá', false, '3'), m('x'.repeat(50), true, '4')], 52); // 50 + 3 would pass 52
    expect(h).toEqual([{ role: 'user', content: 'x'.repeat(50) }]);
    expect(history([m('resumo', false, '1'), m('oi', true, '2'), m('olá', false, '3')]).map((x) => x.role)).toEqual(['user', 'assistant']);
  });
});

describe('api key', () => {
  it('drops spaces, line breaks, quotes and a Bearer prefix pasted with the key', () => {
    expect(cleanKey('  sk-or-v1-abc\n')).toBe('sk-or-v1-abc');
    expect(cleanKey('"sk-or-v1-abc"')).toBe('sk-or-v1-abc');
    expect(cleanKey('Bearer sk-or-v1-abc')).toBe('sk-or-v1-abc');
    expect(cleanKey('OPENROUTER_API_KEY=sk-or-v1-abc')).toBe('sk-or-v1-abc');
  });
  it('drops invisible characters copied along, even in the middle', () => {
    expect(cleanKey('sk-or-v1-\u200babc\u00a0\ufeff')).toBe('sk-or-v1-abc');
    expect(cleanKey('sk-or-v1-ab c')).toBe('sk-or-v1-abc');
  });
  it('shows a masked form to compare with the key list', () => {
    expect(maskKey(`sk-or-v1-${'0'.repeat(60)}a1b2`)).toBe('sk-or-v1-…a1b2 (73 caracteres)');
  });
  it('says what is odd about a key without revealing it', () => {
    // Built at run time: a literal key-shaped string trips secret scanners.
    expect(keyHint(`sk-or-v1-${'0'.repeat(64)}`)).toBeNull();
    expect(keyHint('openrouter.ai')).toBe('o valor salvo não parece uma chave do OpenRouter (deveria começar com sk-or-)');
    expect(keyHint('sk-or-v1-abc')).toBe('a chave salva parece incompleta');
  });
});

describe('models', () => {
  it('tries the paid DeepSeek models, then the free ones', () => {
    const all = modelCandidates();
    expect(all[0]).toBe('deepseek/deepseek-chat-v3.1');
    expect(all.filter((m) => m.endsWith(':free')).length).toBeGreaterThan(0);
    expect(all.findIndex((m) => m.endsWith(':free'))).toBeGreaterThan(all.findIndex((m) => !m.endsWith(':free')));
  });
  it('starts with the one that worked last, and a chosen model stands alone', () => {
    expect(modelCandidates(undefined, 'deepseek/deepseek-chat:free')[0]).toBe('deepseek/deepseek-chat:free');
    expect(new Set(modelCandidates(undefined, 'deepseek/deepseek-chat:free')).size).toBe(modelCandidates().length);
    expect(modelCandidates('deepseek/deepseek-r1')).toEqual(['deepseek/deepseek-r1']);
  });
});
