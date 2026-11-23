import { describe, expect, it } from 'vitest';
import { TOOLS, addDays, checkArgs, cleanKey, history, keyHint, maskKey, modelCandidates, pickFreeModels, exchangeRows, matchByName, skipFor, withoutSkipped, localNow, systemPrompt, textToBlocks, validImageDataUrl, zonedToUtc } from './lib';

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
  it('tries Claude Sonnet 4 and paid models first, then free fallbacks', () => {
    const all = modelCandidates();
    expect(all[0]).toBe('anthropic/claude-sonnet-4');
    expect(all.filter((m) => m.endsWith(':free')).length).toBeGreaterThan(0);
    expect(all.findIndex((m) => m.endsWith(':free'))).toBeGreaterThan(all.findIndex((m) => !m.endsWith(':free')));
  });
  it('respects userModel first, then last working, and env override stands alone', () => {
    expect(modelCandidates(undefined, 'deepseek/deepseek-chat:free')[0]).toBe('deepseek/deepseek-chat:free');
    expect(modelCandidates(undefined, 'deepseek/deepseek-chat:free', 'google/gemini-2.5-pro')[0]).toBe('google/gemini-2.5-pro');
    expect(new Set(modelCandidates(undefined, 'deepseek/deepseek-chat:free')).size).toBe(modelCandidates().length);
    expect(modelCandidates('anthropic/claude-sonnet-4')).toEqual(['anthropic/claude-sonnet-4']);
  });
});

describe('autonomy helpers', () => {
  it('includes learned memories and accounts in the system prompt', () => {
    const p = systemPrompt({ date: '2026-11-23', time: '10:00', weekday: 1 }, SP, {
      name: 'Vini', displayCurrency: 'EUR', tasksToday: [], tasksLate: 0, habitsToday: [], goals: [],
      accounts: [{ name: 'Revolut', currency: 'EUR' }],
      memories: [{ category: 'financas', content: 'Gastos em euro vão na Revolut' }],
    });
    expect(p).toContain('Revolut (EUR)');
    expect(p).toContain('[financas] Gastos em euro vão na Revolut');
  });

  it('validates multimodal image data URLs and checks new tool args', () => {
    expect(validImageDataUrl('data:image/jpeg;base64,AAAA')).toBe('data:image/jpeg;base64,AAAA');
    expect(validImageDataUrl('https://evil.example/x.png')).toBeNull();
    expect(checkArgs('registrar_transacao', { descricao: 'Tesco', valor: 14.5, tipo: 'despesa', moeda: 'EUR', conta: 'Revolut' }))
      .toEqual({ ok: true, args: { descricao: 'Tesco', valor: 14.5, tipo: 'despesa', categoria: null, data: null, moeda: 'EUR', conta: 'Revolut' } });
    expect(checkArgs('salvar_memoria', { categoria: 'financas', conteudo: 'Euro sempre na Revolut' }))
      .toEqual({ ok: true, args: { categoria: 'financas', conteudo: 'Euro sempre na Revolut' } });
    expect(checkArgs('criar_compromisso', { titulo: 'Dentista', data: '2026-11-25', inicio: '15:00', fim: '14:00' })).toMatchObject({ ok: false });
  });
});

describe('free models', () => {
  const m = (id: string, tools = true, context_length = 32000) => ({ id, context_length, supported_parameters: tools ? ['tools', 'temperature'] : ['temperature'] });
  it('keeps free models that take tools, DeepSeek first, then the preferred families, larger context first', () => {
    const picked = pickFreeModels([
      m('openai/gpt-4o'), m('meta-llama/llama-3.3-70b-instruct:free', true, 131072), m('qwen/qwen3-235b-a22b:free', true, 40960),
      m('google/gemma-3-27b-it:free', false), m('deepseek/deepseek-r1:free', false), m('mistralai/mistral-small-3.2-24b-instruct:free', true, 96000),
      m('deepseek/deepseek-v3.2:free', true, 64000), m('some/tiny-1b:free', true, 8000),
    ]);
    expect(picked).toEqual([
      'deepseek/deepseek-v3.2:free', 'qwen/qwen3-235b-a22b:free', 'meta-llama/llama-3.3-70b-instruct:free',
      'mistralai/mistral-small-3.2-24b-instruct:free', 'some/tiny-1b:free',
    ]);
  });
  it('offers up to 8', () => {
    expect(pickFreeModels(Array.from({ length: 12 }, (_, i) => m(`x/m${i}:free`))).length).toBe(8);
  });
  it('copes with an empty or odd catalog', () => {
    expect(pickFreeModels([])).toEqual([]);
    expect(pickFreeModels([{ id: 'x:free' } as never])).toEqual([]);
  });
});

describe('skipping models that just failed', () => {
  const NOW = 1_000_000;
  it('waits longer for no credits or a gone model than for a busy one', () => {
    expect(skipFor(402)).toBe(10 * 60_000);
    expect(skipFor(404)).toBe(60 * 60_000);
    expect(skipFor(429)).toBe(60_000);
    expect(skipFor(403)).toBe(60 * 60_000); // restricted, e.g. "only available on agentic harnesses"
    expect(skipFor(500)).toBe(0);
  });
  it('leaves out models still in their wait, but never all of them', () => {
    const skip = new Map([['a', NOW + 5000], ['b', NOW - 1]]);
    expect(withoutSkipped(['a', 'b', 'c'], skip, NOW)).toEqual(['b', 'c']);
    expect(withoutSkipped(['a'], skip, NOW)).toEqual(['a']);
  });
});

describe('saving the exchange', () => {
  it('writes both rows with the same columns, so none is sent as null', () => {
    const [q, a] = exchangeRows('oi', 'olá', { model: 'm', actions: [] }, new Date('2026-11-19T10:00:00Z'));
    expect(Object.keys(q).sort()).toEqual(Object.keys(a).sort());
    expect(q).toEqual({ content: 'oi', is_user: true, metadata: {}, created_at: '2026-11-19T10:00:00.000Z' });
    expect(a).toEqual({ content: 'olá', is_user: false, metadata: { model: 'm', actions: [] }, created_at: '2026-11-19T10:00:00.001Z' });
  });
});

describe('acting by name', () => {
  it('takes a task or habit by name when there is no id', () => {
    expect(checkArgs('concluir_tarefa', { titulo: 'ligar para o contador' })).toEqual({ ok: true, args: { id: null, titulo: 'ligar para o contador' } });
    expect(checkArgs('marcar_habito', { nome: 'Ler', valor: 1 })).toEqual({ ok: true, args: { id: null, nome: 'Ler', valor: 1 } });
    expect(checkArgs('concluir_tarefa', {})).toEqual({ ok: false, error: 'informe o id ou o título' });
  });
  it('matches names without accents or case, the closest first', () => {
    const rows = [{ id: '1', name: 'Ligar para o banco' }, { id: '2', name: 'Ligar para o Contador' }, { id: '3', name: 'Contador de passos' }];
    expect(matchByName(rows, 'ligar para o contador').map((r) => r.id)).toEqual(['2']);
    expect(matchByName(rows, 'contador').map((r) => r.id)).toEqual(['3', '2']);
    expect(matchByName(rows, 'academia')).toEqual([]);
  });
});

describe('threads, screen context, and extended tool args', () => {
  it('propagates thread_id and thread_title onto both user and assistant rows', () => {
    const [q, a] = exchangeRows('oi', 'olá', { model: 'm', thread_id: 't-1', thread_title: 'Finanças' }, new Date('2026-11-19T10:00:00Z'));
    expect(q.metadata).toEqual({ thread_id: 't-1', thread_title: 'Finanças' });
    expect(a.metadata).toMatchObject({ thread_id: 't-1', thread_title: 'Finanças' });
  });

  it('includes active screen context in systemPrompt when provided', () => {
    const p = systemPrompt({ date: '2026-11-23', time: '10:00', weekday: 1 }, SP, {
      tasksToday: [], tasksLate: 0, habitsToday: [], goals: [],
      screenContext: { route: '/projetos', label: 'Projetos', hint: 'Projeto aberto: QQI' },
    });
    expect(p).toContain('Tela atual do usuário: Projetos (/projetos) — Projeto aberto: QQI');
  });

  it('validates criar_plano_projeto and registrar_transferencia arguments', () => {
    expect(checkArgs('criar_plano_projeto', { projeto: 'QQI', etapas: [{ titulo: 'Módulo 1', subetapas: ['Ler apostila'] }] }))
      .toEqual({ ok: true, args: { projeto: 'QQI', etapas: [{ titulo: 'Módulo 1', prazo: null, subetapas: ['Ler apostila'] }] } });
    expect(checkArgs('criar_plano_projeto', { projeto: 'QQI', etapas: [] })).toMatchObject({ ok: false });
    expect(checkArgs('registrar_transferencia', { origem: 'Revolut', destino: 'Wise', valor: 150, moeda: 'eur' }))
      .toEqual({ ok: true, args: { origem: 'Revolut', destino: 'Wise', valor: 150, moeda: 'EUR', descricao: null, data: null } });
  });
});

