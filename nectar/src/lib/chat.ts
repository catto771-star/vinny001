// The assistant writes light Markdown. These turn it into simple pieces the
// chat draws: paragraphs, bullet and numbered lists, headings, **bold**.

export type Span = { text: string; bold?: boolean; code?: boolean };
export type Piece =
  | { kind: 'p'; spans: Span[] }
  | { kind: 'h'; spans: Span[] }
  | { kind: 'ul' | 'ol'; items: Span[][] };

/** **bold**, __bold__ and `code` inside a line. */
export function spans(line: string): Span[] {
  const out: Span[] = [];
  const re = /\*\*(.+?)\*\*|__(.+?)__|`([^`]+)`/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) out.push({ text: line.slice(last, m.index) });
    if (m[3] !== undefined) out.push({ text: m[3], code: true });
    else out.push({ text: m[1] ?? m[2], bold: true });
    last = re.lastIndex;
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out;
}

/** Splits a reply into blocks: blank lines end paragraphs; "- " and "1. " make lists; "#" headings. */
export function pieces(text: string): Piece[] {
  const out: Piece[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push({ kind: 'p', spans: spans(para.join('\n')) }); para = []; } };
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    if (!line.trim()) { flush(); continue; }
    if (heading) { flush(); out.push({ kind: 'h', spans: spans(heading[1]) }); continue; }
    if (bullet || numbered) {
      flush();
      const kind = bullet ? 'ul' : 'ol';
      const item = spans((bullet ?? numbered)![1]);
      const prev = out[out.length - 1];
      if (prev && prev.kind === kind) prev.items.push(item);
      else out.push({ kind, items: [item] });
      continue;
    }
    para.push(line);
  }
  flush();
  return out;
}
