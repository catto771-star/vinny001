import { describe, expect, it } from 'vitest';
import { blocksToText, newBlock } from './blocks';
import { backlinksOf, markdownFileName, markdownToNote, NOTE_TEMPLATES, noteToMarkdown } from './markdown';
const note = (over) => ({
    id: 'n1', area_id: null, title: 'Arquitetura Painel', content: [], content_text: '', summary: null,
    tags: ['sistema', 'ideias'], importance: 4, is_pinned: false, is_favorite: false,
    created_at: '2026-11-10T10:00:00Z', updated_at: '2026-11-20T15:00:00Z', ...over,
});
describe('Obsidian Markdown export & import', () => {
    it('exports YAML frontmatter, headings, checklists and [[wikilinks]]', () => {
        const blocks = [
            newBlock('heading', 'Decisões', { level: 2 }),
            newBlock('paragraph', 'Ver também [[Finanças 2026]] com **foco**.'),
            newBlock('checkListItem', 'Finalizar fase 5', { checked: true }),
            newBlock('bulletListItem', 'Testar offline'),
        ];
        const md = noteToMarkdown(note({ content: blocks, content_text: blocksToText(blocks) }), 'Projetos');
        expect(md).toContain('title: "Arquitetura Painel"');
        expect(md).toContain('area: "Projetos"');
        expect(md).toContain('tags: [sistema, ideias]');
        expect(md).toContain('## Decisões');
        expect(md).toContain('[[Finanças 2026]]');
        expect(md).toContain('- [x] Finalizar fase 5');
        expect(markdownFileName('Café & Finanças 2026!')).toBe('cafe-financas-2026.md');
    });
    it('imports Markdown with frontmatter, lists, checklists, quotes and extracts [[wikilinks]]', () => {
        const raw = [
            '---',
            'title: Plano 2027',
            'tags: [meta, viagem]',
            '---',
            '## Objetivos',
            '- [ ] Conectar com [[Reserva EUR]]',
            '- [x] Revisar #saude',
            '> Consistência vence intensidade',
            '```',
            'const ok = true;',
            '```',
        ].join('\n');
        const parsed = markdownToNote(raw, 'fallback.md');
        expect(parsed.title).toBe('Plano 2027');
        expect(parsed.tags).toEqual(expect.arrayContaining(['meta', 'viagem', 'saude']));
        expect(parsed.links).toEqual(['Reserva EUR']);
        expect(parsed.blocks.map((b) => b.type)).toEqual(['heading', 'checkListItem', 'checkListItem', 'quote', 'codeBlock']);
        expect(parsed.blocks[1].props.checked).toBe(false);
        expect(parsed.blocks[2].props.checked).toBe(true);
    });
    it('uses first H1 or filename as title when frontmatter is absent', () => {
        const withH1 = markdownToNote('# Minha Ideia\nTexto simples', 'arquivo.md');
        expect(withH1.title).toBe('Minha Ideia');
        expect(withH1.blocks).toHaveLength(1);
        const noH1 = markdownToNote('Apenas um parágrafo', 'Notas-Reuniao.md');
        expect(noH1.title).toBe('Notas-Reuniao');
    });
});
describe('backlinks and templates', () => {
    it('returns incoming backlinks with matching line snippet around [[Title]]', () => {
        const target = note({ id: 'target', title: 'Reserva EUR' });
        const src1 = note({ id: 's1', title: 'Plano 2027', content_text: 'Linha 1\nPreciso reforçar [[Reserva EUR]] este trimestre', updated_at: '2026-11-22T10:00:00Z' });
        const src2 = note({ id: 's2', title: 'Metas', content_text: 'Resumo financeiro geral', updated_at: '2026-11-21T10:00:00Z' });
        const conns = [
            { id: 'c1', source_block_id: 's1', target_block_id: 'target', connection_type: 'related', auto_generated: true },
            { id: 'c2', source_block_id: 's2', target_block_id: 'target', connection_type: 'related', auto_generated: false },
            { id: 'c3', source_block_id: 'target', target_block_id: 's2', connection_type: 'related', auto_generated: false },
        ];
        const backlinks = backlinksOf(target, conns, [target, src1, src2]);
        expect(backlinks.map((b) => b.note.id)).toEqual(['s1', 's2']);
        expect(backlinks[0].snippet).toContain('[[Reserva EUR]]');
        expect(backlinks[1].snippet).toBe('Resumo financeiro geral');
    });
    it('provides structured note templates with blocks', () => {
        expect(NOTE_TEMPLATES.length).toBeGreaterThanOrEqual(4);
        for (const tpl of NOTE_TEMPLATES) {
            const blocks = tpl.buildBlocks();
            expect(blocks.length).toBeGreaterThan(0);
        }
    });
});
