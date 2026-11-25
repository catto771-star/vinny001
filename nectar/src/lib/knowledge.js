import { addDays } from './dates';
import { searchKey, searchWords } from './text';
export const MOODS = ['Péssimo', 'Ruim', 'Ok', 'Bom', 'Ótimo'];
/** Notes matching every word of the query; title hits first, then pinned, then most recent. */
export function searchNotes(notes, query) {
    const words = searchWords(query);
    const order = (a, b) => Number(b.is_pinned) - Number(a.is_pinned) || b.updated_at.localeCompare(a.updated_at);
    if (!words.length)
        return [...notes].sort(order);
    const scored = notes.map((n) => {
        const title = searchKey(n.title);
        const all = `${title} ${searchKey(n.content_text)} ${searchKey(n.tags.join(' '))}`;
        if (!words.every((w) => all.includes(w)))
            return null;
        return { n, title: words.filter((w) => title.includes(w)).length };
    }).filter((x) => x !== null);
    return scored.sort((a, b) => b.title - a.title || order(a.n, b.n)).map((x) => x.n);
}
/** A short excerpt of a note's text. */
export function excerpt(text, max = 140) {
    const t = text.replace(/\s+/g, ' ').trim();
    return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}
/** Notes linked to a note, either way, without repeats. */
export function linkedNotes(noteId, connections, notes) {
    const seen = new Set();
    const out = [];
    for (const c of connections) {
        const other = c.source_block_id === noteId ? c.target_block_id : c.target_block_id === noteId ? c.source_block_id : null;
        if (!other || other === noteId || seen.has(other))
            continue;
        const note = notes.find((n) => n.id === other);
        if (!note)
            continue;
        seen.add(other);
        out.push({ note, connection: c, direction: c.source_block_id === noteId ? 'out' : 'in' });
    }
    return out;
}
/**
 * The connections a note's [[links]] call for: which to add (titles that match
 * another note, accents and case aside) and which automatic ones to drop.
 */
export function syncWikiLinks(note, titles, notes, connections) {
    const byTitle = new Map(notes.filter((n) => n.id !== note.id).map((n) => [searchKey(n.title), n.id]));
    const wanted = new Set(titles.map((t) => byTitle.get(searchKey(t))).filter((x) => !!x));
    const mine = connections.filter((c) => c.source_block_id === note.id);
    const have = new Set(mine.map((c) => c.target_block_id));
    return {
        add: [...wanted].filter((id) => !have.has(id)),
        remove: mine.filter((c) => c.auto_generated && !wanted.has(c.target_block_id)).map((c) => c.id),
    };
}
/**
 * Places notes for the map: a few hundred steps of a small force layout
 * (links pull, every pair pushes), seeded so the same notes land in the same
 * place every time, kept inside the box.
 */
export function layoutGraph(ids, edges, width = 800, height = 520, steps = 300) {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = ids.length;
    const pos = ids.map((id, i) => {
        const a = (i / Math.max(1, n)) * Math.PI * 2;
        return { id, x: width / 2 + Math.cos(a) * width * 0.3 + rand() * 10, y: height / 2 + Math.sin(a) * height * 0.3 + rand() * 10 };
    });
    const index = new Map(ids.map((id, i) => [id, i]));
    const links = edges.map(([a, b]) => [index.get(a), index.get(b)]).filter((e) => e[0] !== undefined && e[1] !== undefined && e[0] !== e[1]);
    const k = Math.sqrt((width * height) / Math.max(1, n)) * 0.6;
    for (let s = 0; s < steps; s++) {
        const t = 1 - s / steps;
        const dx = new Array(n).fill(0);
        const dy = new Array(n).fill(0);
        for (let i = 0; i < n; i++)
            for (let j = i + 1; j < n; j++) {
                const x = pos[i].x - pos[j].x;
                const y = pos[i].y - pos[j].y;
                const d = Math.max(1, Math.hypot(x, y));
                const f = (k * k) / d;
                dx[i] += (x / d) * f;
                dy[i] += (y / d) * f;
                dx[j] -= (x / d) * f;
                dy[j] -= (y / d) * f;
            }
        for (const [i, j] of links) {
            const x = pos[i].x - pos[j].x;
            const y = pos[i].y - pos[j].y;
            const d = Math.max(1, Math.hypot(x, y));
            const f = (d * d) / k;
            dx[i] -= (x / d) * f;
            dy[i] -= (y / d) * f;
            dx[j] += (x / d) * f;
            dy[j] += (y / d) * f;
        }
        for (let i = 0; i < n; i++) {
            // A light pull to the middle keeps loose notes from drifting to the edges.
            dx[i] += (width / 2 - pos[i].x) * 0.02;
            dy[i] += (height / 2 - pos[i].y) * 0.02;
            const d = Math.max(1, Math.hypot(dx[i], dy[i]));
            const step = Math.min(d, 12 * t + 0.5);
            pos[i].x = Math.min(width - 24, Math.max(24, pos[i].x + (dx[i] / d) * step));
            pos[i].y = Math.min(height - 24, Math.max(24, pos[i].y + (dy[i] / d) * step));
        }
    }
    return pos;
}
/** Days in a row with a diary entry, ending today (or yesterday, while today is still open). */
export function writingStreak(entries, today) {
    const days = new Set(entries.map((e) => e.date));
    let day = days.has(today) ? today : addDays(today, -1);
    let n = 0;
    while (days.has(day)) {
        n++;
        day = addDays(day, -1);
    }
    return n;
}
/** Average mood (1..5) of the entries in a range of days, or null without any. */
export function averageMood(entries, from, to) {
    const m = entries.filter((e) => e.date >= from && e.date <= to && e.mood != null).map((e) => e.mood);
    return m.length ? m.reduce((a, b) => a + b, 0) / m.length : null;
}
