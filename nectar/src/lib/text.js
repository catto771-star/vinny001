/** Lowercase text without accents, used to search food names (same rule as scripts/foods-map.mjs). */
export function searchKey(text) {
    return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
/** Words of a search, each to be matched anywhere in the name. */
export function searchWords(query) {
    return searchKey(query).split(' ').filter((w) => w.length > 0).slice(0, 5);
}
