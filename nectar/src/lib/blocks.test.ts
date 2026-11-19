import { describe, expect, it } from 'vitest';
import { applyShortcut, blocksToText, flatten, listNumber, markdownToRuns, mergeUp, newBlock, plainText, runsToMarkdown, splitBlock, wikiLinks, type Block } from './blocks';

const t = (text: string, styles = {}) => ({ type: 'text' as const, text, styles });

describe('runs and marks', () => {
  it('round-trips bold, italic and code', () => {
    const runs = [t('Treino '), t('pesado', { bold: true }), t(' e '), t('leve', { italic: true }), t(' com '), t('RPE', { code: true })];
    const md = runsToMarkdown(runs);
    expect(md).toBe('Treino **pesado** e *leve* com `RPE`');
    expect(markdownToRuns(md)).toEqual(runs);
  });
  it('keeps unmatched marks as typed', () => {
    expect(markdownToRuns('2 * 3 = 6')).toEqual([t('2 * 3 = 6')]);
  });
});

describe('blocks', () => {
  it('reads the BlockNote shape, nested children as indented siblings', () => {
    const doc = [{ id: 'a', type: 'bulletListItem', props: { textColor: 'default' }, content: [t('Pai')], children: [
      { id: 'b', type: 'bulletListItem', props: {}, content: [t('Filho')], children: [] },
    ] }];
    const flat = flatten(doc);
    expect(flat.map((b) => [b.id, b.props.indent ?? 0])).toEqual([['a', 0], ['b', 1]]);
    expect(flat[0].props.textColor).toBe('default');
    expect(blocksToText(doc as Block[])).toBe('Pai\nFilho');
    expect(flatten(null)).toEqual([]);
  });
  it('turns typed prefixes into block types', () => {
    expect(applyShortcut('## Plano')).toEqual({ type: 'heading', props: { level: 2 }, text: 'Plano' });
    expect(applyShortcut('- item')?.type).toBe('bulletListItem');
    expect(applyShortcut('[] comprar')).toEqual({ type: 'checkListItem', props: { checked: false }, text: 'comprar' });
    expect(applyShortcut('texto normal')).toBeNull();
  });
  it('splits at the caret: lists go on, an empty item ends the list', () => {
    const list = [newBlock('bulletListItem', 'leite e pão')];
    const split = splitBlock(list, 0, 'leite', ' e pão');
    expect(split.map((b) => [b.type, plainText(b)])).toEqual([['bulletListItem', 'leite'], ['bulletListItem', ' e pão']]);
    const heading = splitBlock([newBlock('heading', 'Título', { level: 1 })], 0, 'Título', '');
    expect(heading[1].type).toBe('paragraph');
    const ended = splitBlock([newBlock('bulletListItem')], 0, '', '');
    expect(ended).toHaveLength(1);
    expect(ended[0].type).toBe('paragraph');
  });
  it('joins a block into the one above with the caret at the seam', () => {
    const r = mergeUp([newBlock('paragraph', 'Olá '), newBlock('paragraph', '**mundo**')], 1)!;
    expect(r.blocks).toHaveLength(1);
    expect(runsToMarkdown(r.blocks[0].content as never)).toBe('Olá **mundo**');
    expect(r.caret).toBe(4);
    expect(mergeUp([newBlock()], 0)).toBeNull();
  });
  it('numbers a run of numbered items', () => {
    const bs = [newBlock('numberedListItem', 'a'), newBlock('numberedListItem', 'b'), newBlock('paragraph', 'x'), newBlock('numberedListItem', 'c')];
    expect([0, 1, 3].map((i) => listNumber(bs, i))).toEqual([1, 2, 1]);
  });
  it('finds [[links]]', () => {
    expect(wikiLinks('ver [[Creatina]] e [[ Sono ]], de novo [[Creatina]]')).toEqual(['Creatina', 'Sono']);
  });
});
