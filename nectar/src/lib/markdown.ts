import {
  blocksToText, flatten, newBlock, runsToMarkdown, wikiLinks,
  type Block, type Inline,
} from './blocks';
import type { Connection, Note } from './knowledge';
import { searchKey } from './text';

// ---------------------------------------------------------------------------
// Obsidian-compatible Markdown Export & Import
// ---------------------------------------------------------------------------

function slugifyFileName(title: string): string {
  const clean = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-_]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
  return `${clean || 'nota'}.md`;
}

export function markdownFileName(title: string): string {
  return slugifyFileName(title);
}

function blockToMarkdownLine(b: Block, numCounter: { n: number }): string {
  const indent = '  '.repeat(Math.max(0, Number(b.props?.indent ?? 0)));
  const runs = Array.isArray(b.content) ? (b.content as Inline[]).filter((r) => r && typeof r.text === 'string') : [];
  const text = runsToMarkdown(runs);

  if (b.type !== 'numberedListItem') numCounter.n = 0;

  switch (b.type) {
    case 'heading': {
      const level = Math.min(3, Math.max(1, Number(b.props?.level ?? 1)));
      return `${'#'.repeat(level)} ${text}`;
    }
    case 'bulletListItem':
      return `${indent}- ${text}`;
    case 'numberedListItem': {
      numCounter.n += 1;
      return `${indent}${numCounter.n}. ${text}`;
    }
    case 'checkListItem':
      return `${indent}- [${b.props?.checked ? 'x' : ' '}] ${text}`;
    case 'quote':
      return `> ${text}`;
    case 'codeBlock':
      return `\`\`\`\n${text}\n\`\`\``;
    default:
      return text;
  }
}

/** Converts a Painel note into an Obsidian-compatible Markdown string with YAML frontmatter. */
export function noteToMarkdown(note: Pick<Note, 'title' | 'content' | 'content_text' | 'tags' | 'importance' | 'created_at' | 'updated_at'>, areaName?: string | null): string {
  const fm: string[] = ['---'];
  fm.push(`title: "${(note.title || 'Sem título').replace(/"/g, '\\"')}"`);
  if (areaName) fm.push(`area: "${areaName.replace(/"/g, '\\"')}"`);
  if (note.tags?.length) fm.push(`tags: [${note.tags.map((t) => t.replace(/^#/, '')).join(', ')}]`);
  if (note.importance) fm.push(`importance: ${note.importance}`);
  if (note.created_at) fm.push(`created: ${note.created_at.slice(0, 10)}`);
  if (note.updated_at) fm.push(`updated: ${note.updated_at.slice(0, 10)}`);
  fm.push('---', '');

  const flat = flatten(note.content);
  const counter = { n: 0 };
  const body = flat.length
    ? flat.map((b) => blockToMarkdownLine(b, counter)).join('\n')
    : (note.content_text ?? '');

  return `${fm.join('\n')}${body.trimEnd()}\n`;
}

export interface ImportedMarkdownNote {
  title: string;
  tags: string[];
  blocks: Block[];
  content_text: string;
  links: string[];
}

/** Parses an Obsidian/Markdown file (optional YAML frontmatter + headings/lists/checklists/[[wikilinks]]). */
export function markdownToNote(raw: string, fallbackTitle?: string): ImportedMarkdownNote {
  let text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let fmTitle = '';
  const tagSet = new Set<string>();

  // 1. Parse optional YAML frontmatter
  if (text.startsWith('---\n')) {
    const end = text.indexOf('\n---', 4);
    if (end !== -1) {
      const yaml = text.slice(4, end);
      text = text.slice(end + 4).replace(/^\n+/, '');
      let readingTags = false;
      for (const line of yaml.split('\n')) {
        const trimmed = line.trim();
        if (readingTags && trimmed.startsWith('- ')) {
          const t = trimmed.slice(2).trim().replace(/^["'#]+|["']+$/g, '');
          if (t) tagSet.add(t);
          continue;
        }
        readingTags = false;
        const mTitle = line.match(/^title:\s*(.+)$/i);
        if (mTitle) {
          fmTitle = mTitle[1].trim().replace(/^["']|["']$/g, '');
          continue;
        }
        const mTags = line.match(/^tags:\s*(.*)$/i);
        if (mTags) {
          const val = mTags[1].trim();
          if (!val) {
            readingTags = true;
          } else {
            val
              .replace(/^\[|\]$/g, '')
              .split(',')
              .map((t) => t.trim().replace(/^["'#]+|["']+$/g, ''))
              .filter(Boolean)
              .forEach((t) => tagSet.add(t));
          }
        }
      }
    }
  }

  // 2. Parse Markdown lines into BlockNote-compatible Block[]
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let inCode = false;
  let codeLines: string[] = [];
  let headingTitle = '';

  for (const rawLine of lines) {
    if (rawLine.trim().startsWith('```')) {
      if (inCode) {
        blocks.push(newBlock('codeBlock', codeLines.join('\n')));
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }

    const leadingSpaces = rawLine.match(/^(\s*)/)?.[1].length ?? 0;
    const indent = Math.min(4, Math.floor(leadingSpaces / 2));
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Extract inline #tags (skipping headings)
    if (!trimmed.startsWith('#')) {
      for (const m of trimmed.matchAll(/(?:^|\s)#([a-zA-ZÀ-ÿ0-9_-]{2,32})/g)) {
        tagSet.add(m[1]);
      }
    }

    const hMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (hMatch) {
      const level = hMatch[1].length;
      const body = hMatch[2].trim();
      if (level === 1 && !headingTitle && !fmTitle) {
        headingTitle = body;
        continue; // Use first H1 as note title instead of duplicating it as block 1
      }
      blocks.push(newBlock('heading', body, { level }));
      continue;
    }

    const checkMatch = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
    if (checkMatch) {
      blocks.push(newBlock('checkListItem', checkMatch[2], { checked: checkMatch[1].toLowerCase() === 'x', ...(indent ? { indent } : {}) }));
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      blocks.push(newBlock('bulletListItem', bulletMatch[1], indent ? { indent } : {}));
      continue;
    }

    const numMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (numMatch) {
      blocks.push(newBlock('numberedListItem', numMatch[1], indent ? { indent } : {}));
      continue;
    }

    const quoteMatch = trimmed.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      blocks.push(newBlock('quote', quoteMatch[1]));
      continue;
    }

    blocks.push(newBlock('paragraph', trimmed));
  }

  if (inCode && codeLines.length) {
    blocks.push(newBlock('codeBlock', codeLines.join('\n')));
  }

  const cleanFallback = fallbackTitle ? fallbackTitle.replace(/\.md$/i, '').trim() : '';
  const title = fmTitle || headingTitle || cleanFallback || 'Nota importada';
  const finalBlocks = blocks.length ? blocks : [newBlock('paragraph', '')];
  const content_text = blocksToText(finalBlocks);

  return {
    title,
    tags: [...tagSet],
    blocks: finalBlocks,
    content_text,
    links: wikiLinks(content_text),
  };
}

// ---------------------------------------------------------------------------
// Backlinks & Curated Note Templates (Item 14)
// ---------------------------------------------------------------------------

export interface BacklinkItem {
  note: Note;
  snippet: string;
  auto: boolean;
}

/** Notes that link INTO `noteId` (backlinks), with a context snippet around [[Title]] when present. */
export function backlinksOf(
  note: Pick<Note, 'id' | 'title'>,
  connections: readonly Connection[],
  notes: readonly Note[],
): BacklinkItem[] {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const targetKey = searchKey(note.title || '');
  const out: BacklinkItem[] = [];

  for (const c of connections) {
    if (c.target_block_id !== note.id || c.source_block_id === note.id) continue;
    if (seen.has(c.source_block_id)) continue;
    const source = byId.get(c.source_block_id);
    if (!source) continue;
    seen.add(source.id);

    let snippet = '';
    const lines = (source.content_text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
    const matchingLine = targetKey
      ? lines.find((l) => searchKey(l).includes(targetKey))
      : undefined;
    const rawSnippet = matchingLine ?? lines[0] ?? '';
    snippet = rawSnippet.length > 140 ? `${rawSnippet.slice(0, 139).trimEnd()}…` : rawSnippet;

    out.push({ note: source, snippet, auto: c.auto_generated });
  }
  return out.sort((a, b) => b.note.updated_at.localeCompare(a.note.updated_at));
}

export interface NoteTemplate {
  id: string;
  name: string;
  description: string;
  defaultTitle: string;
  tags: string[];
  buildBlocks: () => Block[];
}

export const NOTE_TEMPLATES: readonly NoteTemplate[] = [
  {
    id: 'meeting',
    name: 'Reunião',
    description: 'Pauta, decisões e próximos passos com checklist',
    defaultTitle: 'Reunião — ',
    tags: ['reuniao'],
    buildBlocks: () => [
      newBlock('heading', 'Contexto e participantes', { level: 2 }),
      newBlock('paragraph', ''),
      newBlock('heading', 'Principais pontos', { level: 2 }),
      newBlock('bulletListItem', ''),
      newBlock('heading', 'Próximos passos', { level: 2 }),
      newBlock('checkListItem', '', { checked: false }),
    ],
  },
  {
    id: 'book',
    name: 'Livro / Artigo',
    description: 'Resumo, citações marcantes e ideias para aplicar',
    defaultTitle: 'Leitura — ',
    tags: ['leitura'],
    buildBlocks: () => [
      newBlock('heading', 'Ideia central', { level: 2 }),
      newBlock('paragraph', ''),
      newBlock('heading', 'Citações e trechos', { level: 2 }),
      newBlock('quote', ''),
      newBlock('heading', 'Como aplicar na prática', { level: 2 }),
      newBlock('bulletListItem', ''),
    ],
  },
  {
    id: 'decision',
    name: 'Decisão',
    description: 'Opções avaliadas, prós/contras e critério final',
    defaultTitle: 'Decisão — ',
    tags: ['decisao'],
    buildBlocks: () => [
      newBlock('heading', 'Problema ou escolha', { level: 2 }),
      newBlock('paragraph', ''),
      newBlock('heading', 'Opções consideradas', { level: 2 }),
      newBlock('bulletListItem', 'Opção A: '),
      newBlock('bulletListItem', 'Opção B: '),
      newBlock('heading', 'Decisão tomada e por quê', { level: 2 }),
      newBlock('paragraph', ''),
    ],
  },
  {
    id: 'weekly',
    name: 'Revisão semanal',
    description: 'Vitórias, aprendizados e foco da próxima semana',
    defaultTitle: 'Revisão semanal',
    tags: ['revisao'],
    buildBlocks: () => [
      newBlock('heading', 'O que funcionou bem', { level: 2 }),
      newBlock('bulletListItem', ''),
      newBlock('heading', 'O que travou ou precisa ajustar', { level: 2 }),
      newBlock('bulletListItem', ''),
      newBlock('heading', 'Top 3 prioridades da próxima semana', { level: 2 }),
      newBlock('checkListItem', '', { checked: false }),
    ],
  },
];
