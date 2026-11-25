import { searchKey, searchWords } from './text';
const GROUP_RANK = {
    Ações: 0,
    'Ir para': 1,
    Tarefas: 2,
    Projetos: 3,
    Metas: 4,
    Hábitos: 5,
    Notas: 6,
};
/**
 * Accent-insensitive filter and ranking for the global Command Palette (⌘K).
 * When query is empty, shows quick actions and navigation first; when typing,
 * title prefix hits rank highest, followed by title matches and metadata hits.
 */
export function filterCommands(items, query, limit = 16) {
    const words = searchWords(query);
    if (!words.length) {
        return [...items]
            .filter((i) => i.group === 'Ações' || i.group === 'Ir para')
            .sort((a, b) => GROUP_RANK[a.group] - GROUP_RANK[b.group])
            .slice(0, limit);
    }
    const scored = [];
    for (const item of items) {
        const title = searchKey(item.title);
        const haystack = `${title} ${searchKey(item.subtitle ?? '')} ${searchKey(item.keywords ?? '')} ${searchKey(item.group)}`;
        if (!words.every((w) => haystack.includes(w)))
            continue;
        let score = 0;
        if (title.startsWith(words[0]))
            score += 30;
        for (const w of words)
            if (title.includes(w))
                score += 10;
        score -= GROUP_RANK[item.group];
        scored.push({ item, score });
    }
    return scored
        .sort((a, b) => b.score - a.score || GROUP_RANK[a.item.group] - GROUP_RANK[b.item.group])
        .slice(0, limit)
        .map((x) => x.item);
}
/** Keyboard index navigation inside the command palette list. */
export function nextCommandIndex(current, count, key) {
    if (count <= 0)
        return -1;
    if (key === 'Home')
        return 0;
    if (key === 'End')
        return count - 1;
    if (key === 'ArrowDown')
        return (current + 1 + count) % count;
    if (key === 'ArrowUp')
        return (current - 1 + count) % count;
    return Math.min(Math.max(0, current), count - 1);
}
