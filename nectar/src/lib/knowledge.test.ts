import { describe, expect, it } from 'vitest';
import { averageMood, excerpt, layoutGraph, linkedNotes, searchNotes, syncWikiLinks, writingStreak, type Connection, type DiaryEntry, type Note } from './knowledge';

const note = (over: Partial<Note>): Note => ({
  id: 'n', area_id: null, title: 'Nota', content: [], content_text: '', summary: null, tags: [], importance: 3,
  is_pinned: false, is_favorite: false, created_at: '', updated_at: '2026-11-01', ...over,
});
const conn = (id: string, s: string, t: string, auto = false): Connection => ({ id, source_block_id: s, target_block_id: t, connection_type: 'related', auto_generated: auto });

describe('search', () => {
  const notes = [
    note({ id: 'a', title: 'Suplementação', content_text: 'creatina 5 g por dia', updated_at: '2026-11-02' }),
    note({ id: 'b', title: 'Creatina', content_text: 'estudos', updated_at: '2026-11-01' }),
    note({ id: 'c', title: 'Sono', is_pinned: true, updated_at: '2026-10-01' }),
  ];
  it('matches words in title, text or tags, accents aside, title hits first', () => {
    expect(searchNotes(notes, 'CREATINA').map((n) => n.id)).toEqual(['b', 'a']);
    expect(searchNotes(notes, 'suplementacao').map((n) => n.id)).toEqual(['a']);
    expect(searchNotes(notes, 'creatina dia').map((n) => n.id)).toEqual(['a']);
  });
  it('lists pinned first, then the latest, without a query', () => {
    expect(searchNotes(notes, '').map((n) => n.id)).toEqual(['c', 'a', 'b']);
  });
  it('cuts long excerpts', () => {
    expect(excerpt('a  b\nc')).toBe('a b c');
    expect(excerpt('x'.repeat(200), 10)).toBe(`${'x'.repeat(9)}…`);
  });
});

describe('connections', () => {
  const notes = [note({ id: 'a', title: 'Treino' }), note({ id: 'b', title: 'Creatina' }), note({ id: 'c', title: 'Sono' })];
  it('lists linked notes both ways once', () => {
    const r = linkedNotes('a', [conn('1', 'a', 'b'), conn('2', 'c', 'a'), conn('3', 'b', 'a')], notes);
    expect(r.map((x) => [x.note.id, x.direction])).toEqual([['b', 'out'], ['c', 'in']]);
  });
  it('adds links for [[titles]] and drops automatic ones no longer written', () => {
    const r = syncWikiLinks(notes[0], ['creatina', 'Inexistente'], notes, [conn('x', 'a', 'c', true), conn('y', 'a', 'c', false)]);
    expect(r).toEqual({ add: ['b'], remove: ['x'] });
  });
});

describe('map layout', () => {
  it('is the same every time and stays inside the box, linked notes closer', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const edges: [string, string][] = [['a', 'b']];
    const one = layoutGraph(ids, edges, 400, 300);
    expect(layoutGraph(ids, edges, 400, 300)).toEqual(one);
    for (const p of one) { expect(p.x).toBeGreaterThanOrEqual(24); expect(p.x).toBeLessThanOrEqual(376); expect(p.y).toBeLessThanOrEqual(276); }
    const d = (i: number, j: number) => Math.hypot(one[i].x - one[j].x, one[i].y - one[j].y);
    expect(d(0, 1)).toBeLessThan(d(2, 3));
  });
});

describe('diary', () => {
  const e = (date: string, mood: number | null = 4): DiaryEntry => ({ id: date, date, title: null, content: '', mood });
  it('counts days written in a row, today still open', () => {
    expect(writingStreak([e('2026-11-16'), e('2026-11-17')], '2026-11-18')).toBe(2);
    expect(writingStreak([e('2026-11-16'), e('2026-11-17'), e('2026-11-18')], '2026-11-18')).toBe(3);
    expect(writingStreak([e('2026-11-15')], '2026-11-18')).toBe(0);
  });
  it('averages the mood of a range', () => {
    expect(averageMood([e('2026-11-01', 2), e('2026-11-02', 5), e('2026-11-03', null), e('2026-12-01', 1)], '2026-11-01', '2026-11-30')).toBe(3.5);
    expect(averageMood([], '2026-11-01', '2026-11-30')).toBeNull();
  });
});
