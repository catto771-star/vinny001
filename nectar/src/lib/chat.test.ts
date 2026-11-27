import { describe, expect, it } from 'vitest';
import { pieces, spans } from './chat';

describe('assistant text', () => {
  it('marks bold and code', () => {
    expect(spans('Total **R$ 120** em `mercado`')).toEqual([{ text: 'Total ' }, { text: 'R$ 120', bold: true }, { text: ' em ' }, { text: 'mercado', code: true }]);
    expect(spans('2 * 3')).toEqual([{ text: '2 * 3' }]);
  });
  it('splits paragraphs, lists and headings', () => {
    const p = pieces('## Hoje\nVocê tem:\n- Pagar IPVA\n- Ligar pro banco\n\n1. primeiro\n2. segundo\nFim');
    expect(p.map((x) => x.kind)).toEqual(['h', 'p', 'ul', 'ol', 'p']);
    expect(p[2]).toEqual({ kind: 'ul', items: [[{ text: 'Pagar IPVA' }], [{ text: 'Ligar pro banco' }]] });
  });
  it('keeps single line breaks inside a paragraph', () => {
    expect(pieces('linha 1\nlinha 2')).toEqual([{ kind: 'p', spans: [{ text: 'linha 1\nlinha 2' }] }]);
  });
});
