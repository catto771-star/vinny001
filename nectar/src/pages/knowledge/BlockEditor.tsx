import { useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import {
  TYPE_LABEL, applyShortcut, flatten, listNumber, markdownToRuns, mergeUp, newBlock, runsToMarkdown, splitBlock,
  type Block, type BlockType, type Inline,
} from '../../lib/blocks';

const textOf = (b: Block) => runsToMarkdown(Array.isArray(b.content) ? (b.content as Inline[]) : []);
const INDENT_MAX = 4;

const STYLE: Record<string, string> = {
  paragraph: 'text-[15px] leading-6',
  quote: 'text-[15px] leading-6 italic text-fg2',
  codeBlock: 'font-mono text-[13px] leading-5',
  bulletListItem: 'text-[15px] leading-6',
  numberedListItem: 'text-[15px] leading-6',
  checkListItem: 'text-[15px] leading-6',
};
const HEADING = ['', 'text-2xl leading-8 font-medium', 'text-xl leading-7 font-medium', 'text-lg leading-7 font-medium'];

/**
 * A note as a list of blocks, Notion style: Enter splits, Backspace at the start
 * joins, Tab indents, and "# ", "- ", "1. ", "[] ", "> ", "```" change the type.
 * Text marks: **bold**, *italic*, `code`. Initial content only: remount (key) to load another note.
 */
export function BlockEditor({ initial, onChange }: { initial: unknown; onChange: (blocks: Block[]) => void }) {
  const [blocks, setBlocks] = useState<Block[]>(() => {
    const flat = flatten(initial);
    return flat.length ? flat : [newBlock()];
  });
  const [texts, setTexts] = useState<Record<string, string>>({});
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const focusNext = useRef<{ index: number; caret: number } | null>(null);

  function commit(next: Block[], focus?: { index: number; caret: number }) {
    const safe = next.length ? next : [newBlock()];
    setBlocks(safe);
    if (focus) focusNext.current = focus;
    onChange(safe);
  }

  useLayoutEffect(() => {
    for (const el of refs.current.values()) grow(el);
    const f = focusNext.current;
    if (!f) return;
    focusNext.current = null;
    const b = blocks[Math.min(f.index, blocks.length - 1)];
    const el = b && refs.current.get(b.id);
    if (el) { el.focus(); const c = Math.min(f.caret, el.value.length); el.setSelectionRange(c, c); }
  });

  const valueOf = (b: Block) => texts[b.id] ?? textOf(b);
  const patch = (i: number, p: Partial<Block>) => blocks.map((b, k) => (k === i ? { ...b, ...p } : b));

  function edit(i: number, text: string) {
    const b = blocks[i];
    const sc = b.type === 'codeBlock' ? null : applyShortcut(text);
    if (sc) {
      setTexts((t) => ({ ...t, [b.id]: sc.text }));
      commit(patch(i, { type: sc.type, props: { ...b.props, ...sc.props }, content: markdownToRuns(sc.text) }), { index: i, caret: 0 });
      return;
    }
    setTexts((t) => ({ ...t, [b.id]: text }));
    commit(patch(i, { content: markdownToRuns(text) }));
  }

  function setType(i: number, type: BlockType, level?: number) {
    const b = blocks[i];
    const props = { ...b.props, level: type === 'heading' ? level ?? 2 : undefined, checked: type === 'checkListItem' ? Boolean(b.props.checked) : undefined };
    commit(patch(i, { type, props }), { index: i, caret: valueOf(b).length });
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>, i: number) {
    const el = e.currentTarget;
    const b = blocks[i];
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
    const text = el.value;
    if (e.key === 'Enter' && !e.shiftKey && !(b.type === 'codeBlock' && !e.ctrlKey && !e.metaKey)) {
      e.preventDefault();
      const caret = el.selectionStart;
      const next = splitBlock(blocks, i, text.slice(0, caret), text.slice(el.selectionEnd));
      setTexts((t) => { const c = { ...t }; delete c[b.id]; return c; });
      commit(next, next.length > blocks.length ? { index: i + 1, caret: 0 } : { index: i, caret: 0 });
    } else if (e.key === 'Backspace' && atStart) {
      if ((b.props.indent ?? 0) > 0) { e.preventDefault(); commit(patch(i, { props: { ...b.props, indent: (b.props.indent ?? 1) - 1 } }), { index: i, caret: 0 }); return; }
      if (b.type !== 'paragraph') { e.preventDefault(); commit(patch(i, { type: 'paragraph', props: {} }), { index: i, caret: 0 }); return; }
      const merged = mergeUp(blocks, i);
      if (!merged) return;
      e.preventDefault();
      setTexts((t) => { const c = { ...t }; delete c[b.id]; delete c[blocks[i - 1].id]; return c; });
      commit(merged.blocks, { index: merged.focus, caret: merged.caret });
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const indent = Math.min(INDENT_MAX, Math.max(0, (b.props.indent ?? 0) + (e.shiftKey ? -1 : 1)));
      commit(patch(i, { props: { ...b.props, indent } }), { index: i, caret: el.selectionStart });
    } else if (e.key === 'ArrowUp' && el.selectionStart === 0 && i > 0) {
      e.preventDefault();
      focusNext.current = { index: i - 1, caret: Infinity };
      setBlocks([...blocks]);
    } else if (e.key === 'ArrowDown' && el.selectionEnd === text.length && i < blocks.length - 1) {
      e.preventDefault();
      focusNext.current = { index: i + 1, caret: 0 };
      setBlocks([...blocks]);
    }
  }

  /** Pasting several lines makes one block per line, prefixes applied. */
  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>, i: number) {
    const pasted = e.clipboardData.getData('text/plain');
    if (!pasted.includes('\n') || blocks[i].type === 'codeBlock') return;
    e.preventDefault();
    const el = e.currentTarget;
    const before = el.value.slice(0, el.selectionStart);
    const after = el.value.slice(el.selectionEnd);
    const lines = pasted.replace(/\r/g, '').split('\n');
    const made = lines.map((line, k) => {
      const text = (k === 0 ? before : '') + line + (k === lines.length - 1 ? after : '');
      const sc = applyShortcut(text);
      return k === 0 && !sc ? { ...blocks[i], content: markdownToRuns(text) } : newBlock(sc?.type ?? 'paragraph', sc ? sc.text : text, sc?.props ?? {});
    });
    setTexts((t) => { const c = { ...t }; delete c[blocks[i].id]; return c; });
    commit([...blocks.slice(0, i), ...made, ...blocks.slice(i + 1)], { index: i + made.length - 1, caret: Infinity });
  }

  return (
    <div className="space-y-0.5" role="group" aria-label="Conteúdo da nota">
      {blocks.map((b, i) => {
        const indent = b.props.indent ?? 0;
        const type = (b.type in TYPE_LABEL ? b.type : 'paragraph') as BlockType;
        const cls = type === 'heading' ? HEADING[Math.min(3, Math.max(1, Number(b.props.level) || 1))] : STYLE[type];
        return (
          <div key={b.id} className="group relative flex items-start gap-2" style={{ paddingLeft: indent * 24 }}>
            <select
              className="mt-1 h-6 w-6 shrink-0 cursor-pointer appearance-none rounded bg-transparent text-center text-xs text-transparent opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 focus:opacity-100"
              style={{ backgroundImage: 'radial-gradient(circle, var(--fg3) 1.2px, transparent 1.4px)', backgroundSize: '6px 6px', backgroundPosition: 'center' }}
              aria-label={`Tipo do bloco ${i + 1}`} title="Tipo do bloco"
              value={type === 'heading' ? `heading${b.props.level ?? 1}` : type}
              onChange={(e) => { const v = e.target.value; if (v.startsWith('heading')) setType(i, 'heading', Number(v.slice(7))); else setType(i, v as BlockType); }}
            >
              <option value="paragraph">Texto</option>
              <option value="heading1">Título 1</option>
              <option value="heading2">Título 2</option>
              <option value="heading3">Título 3</option>
              <option value="bulletListItem">Lista</option>
              <option value="numberedListItem">Lista numerada</option>
              <option value="checkListItem">Checklist</option>
              <option value="quote">Citação</option>
              <option value="codeBlock">Código</option>
            </select>
            {type === 'bulletListItem' && <span className="mt-0 w-4 shrink-0 text-center leading-7 text-fg3" aria-hidden>•</span>}
            {type === 'numberedListItem' && <span className="figure w-5 shrink-0 text-right text-sm leading-7 text-fg3" aria-hidden>{listNumber(blocks, i)}.</span>}
            {type === 'checkListItem' && (
              <input type="checkbox" className="mt-1.5 h-4 w-4 shrink-0 accent-[var(--brand)]" checked={Boolean(b.props.checked)} aria-label={`Marcar item ${i + 1}`}
                onChange={() => commit(patch(i, { props: { ...b.props, checked: !b.props.checked } }))} />
            )}
            <textarea
              ref={(el) => { if (el) refs.current.set(b.id, el); else refs.current.delete(b.id); }}
              rows={1}
              value={valueOf(b)}
              onChange={(e) => { edit(i, e.target.value); grow(e.target); }}
              onKeyDown={(e) => onKey(e, i)}
              onPaste={(e) => onPaste(e, i)}
              placeholder={blocks.length === 1 ? 'Escreva… (# título, - lista, [] tarefa, > citação)' : type === 'heading' ? 'Título' : ''}
              aria-label={`Bloco ${i + 1}: ${TYPE_LABEL[type]}`}
              className={`block w-full resize-none overflow-hidden bg-transparent py-0.5 outline-none placeholder:text-fg3 ${cls} ${type === 'quote' ? 'border-l-2 border-line-strong pl-3' : ''} ${type === 'codeBlock' ? 'rounded-lg bg-raised px-3 py-2' : ''} ${type === 'checkListItem' && b.props.checked ? 'text-fg3 line-through' : ''}`}
            />
          </div>
        );
      })}
    </div>
  );
}

function grow(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}
