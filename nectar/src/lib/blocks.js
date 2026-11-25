// Notes are stored as blocks in the BlockNote JSON shape the Néctar used, so
// imported notes open as they are. The editor edits one block as plain text
// with light marks (**bold**, *italic*, `code`) and turns it back into runs.
export const TYPE_LABEL = {
    paragraph: 'Texto', heading: 'Título', bulletListItem: 'Lista', numberedListItem: 'Lista numerada',
    checkListItem: 'Checklist', quote: 'Citação', codeBlock: 'Código',
};
let seq = 0;
export const blockId = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;
export function newBlock(type = 'paragraph', text = '', props = {}) {
    return { id: blockId(), type, props, content: text ? markdownToRuns(text) : [], children: [] };
}
const runsOf = (b) => (Array.isArray(b.content) ? b.content.filter((c) => c && typeof c.text === 'string') : []);
/** Plain text of a block, marks dropped. */
export function plainText(b) {
    return runsOf(b).map((r) => r.text).join('');
}
/** A block's runs as editable text: **bold**, *italic*, `code`. */
export function runsToMarkdown(content) {
    return content.map((r) => {
        if (!r.text)
            return '';
        if (r.styles?.code)
            return `\`${r.text}\``;
        let t = r.text;
        if (r.styles?.italic)
            t = `*${t}*`;
        if (r.styles?.bold)
            t = `**${t}**`;
        return t;
    }).join('');
}
/** Editable text back into runs; unmatched marks stay as typed. */
export function markdownToRuns(text) {
    const out = [];
    const re = /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;
    let last = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
        if (m.index > last)
            out.push({ type: 'text', text: text.slice(last, m.index), styles: {} });
        if (m[1] !== undefined)
            out.push({ type: 'text', text: m[1], styles: { bold: true, italic: true } });
        else if (m[2] !== undefined)
            out.push({ type: 'text', text: m[2], styles: { bold: true } });
        else if (m[3] !== undefined)
            out.push({ type: 'text', text: m[3], styles: { italic: true } });
        else
            out.push({ type: 'text', text: m[4], styles: { code: true } });
        last = re.lastIndex;
    }
    if (last < text.length)
        out.push({ type: 'text', text: text.slice(last), styles: {} });
    return out;
}
/** Nested children become siblings with an indent, which is how the editor shows them. */
export function flatten(blocks) {
    if (!Array.isArray(blocks))
        return [];
    const out = [];
    const walk = (list, depth) => {
        for (const b of list) {
            if (!b || typeof b !== 'object')
                continue;
            out.push({ ...b, id: b.id || blockId(), props: { ...(b.props ?? {}), ...(depth ? { indent: depth } : {}) }, children: [] });
            if (Array.isArray(b.children) && b.children.length)
                walk(b.children, depth + 1);
        }
    };
    walk(blocks, 0);
    return out;
}
/** The searchable text of a note: every block on its own line. */
export function blocksToText(blocks) {
    return flatten(blocks).map(plainText).filter(Boolean).join('\n');
}
/**
 * Typing a prefix at the start of a block changes its type, like in Notion:
 * "# " heading, "- " list, "1. " numbered, "[] " checklist, "> " quote, "``` " code.
 */
export function applyShortcut(text) {
    const rules = [
        [/^### /, 'heading', { level: 3 }], [/^## /, 'heading', { level: 2 }], [/^# /, 'heading', { level: 1 }],
        [/^[-*] /, 'bulletListItem', {}], [/^1[.)] /, 'numberedListItem', {}], [/^\[ ?\] /, 'checkListItem', { checked: false }],
        [/^\[x\] /i, 'checkListItem', { checked: true }], [/^> /, 'quote', {}], [/^```\s?/, 'codeBlock', {}],
    ];
    for (const [re, type, props] of rules)
        if (re.test(text))
            return { type, props, text: text.replace(re, '') };
    return null;
}
/** Enter splits a block at the caret; lists carry on as lists, everything else starts a paragraph. */
export function splitBlock(blocks, index, before, after) {
    const b = blocks[index];
    const listy = ['bulletListItem', 'numberedListItem', 'checkListItem'].includes(b.type);
    // Enter on an empty list item ends the list.
    if (listy && !before && !after)
        return blocks.map((x, i) => (i === index ? { ...x, type: 'paragraph', props: {} } : x));
    const next = newBlock(listy ? b.type : 'paragraph', after, listy ? { ...(b.type === 'checkListItem' ? { checked: false } : {}), ...(b.props.indent ? { indent: b.props.indent } : {}) } : {});
    return [...blocks.slice(0, index), { ...b, content: markdownToRuns(before) }, next, ...blocks.slice(index + 1)];
}
/** Backspace at the start joins a block into the one above; returns the new list and where the caret goes. */
export function mergeUp(blocks, index) {
    if (index <= 0)
        return null;
    const prev = blocks[index - 1];
    const prevText = runsToMarkdown(runsOf(prev));
    const merged = { ...prev, content: markdownToRuns(prevText + runsToMarkdown(runsOf(blocks[index]))) };
    return { blocks: [...blocks.slice(0, index - 1), merged, ...blocks.slice(index + 1)], focus: index - 1, caret: prevText.length };
}
/** Number shown before a numbered item: counts the run of numbered items at the same indent. */
export function listNumber(blocks, index) {
    const indent = blocks[index].props.indent ?? 0;
    let n = 1;
    for (let i = index - 1; i >= 0; i--) {
        const b = blocks[i];
        const bi = b.props.indent ?? 0;
        if (bi > indent)
            continue;
        if (bi < indent || b.type !== 'numberedListItem')
            break;
        n++;
    }
    return n;
}
/** Titles linked with [[Title]] in a text. */
export function wikiLinks(text) {
    return [...new Set([...text.matchAll(/\[\[([^\]\n]{1,120})\]\]/g)].map((m) => m[1].trim()).filter(Boolean))];
}
