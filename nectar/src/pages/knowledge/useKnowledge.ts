import { useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useTable, write } from '../../lib/useTable';
import { mergingWriter } from '../../lib/serial';
import { wikiLinks } from '../../lib/blocks';
import { syncWikiLinks, type Area, type Connection, type DiaryEntry, type Note } from '../../lib/knowledge';

export interface Capture { id: string; title: string | null; content: string; processed_into: string | null; created_at: string }

/** Everything the knowledge screens read; note saves are coalesced per note. */
export function useKnowledge() {
  const areas = useTable<Area>('knowledge_areas', '*', { column: 'name' });
  const notes = useTable<Note>('knowledge_blocks', '*', { column: 'updated_at', ascending: false });
  const connections = useTable<Connection>('knowledge_connections', 'id,source_block_id,target_block_id,connection_type,auto_generated');
  const diary = useTable<DiaryEntry>('diary_entries', 'id,date,title,content,mood', { column: 'date', ascending: false });
  const captures = useTable<Capture>('brain_entries', 'id,title,content,processed_into,created_at', { column: 'created_at', ascending: false });
  const saves = useRef(mergingWriter<Partial<Note>>()).current;

  /** Shows a note change at once and saves it; after a content change, syncs its [[links]]. */
  function saveNote(id: string, patch: Partial<Note>) {
    notes.setRows((rows) => rows.map((n) => (n.id === id ? { ...n, ...patch, updated_at: new Date().toISOString() } : n)));
    return saves(id, patch, async (merged) => {
      if (!await write(supabase.from('knowledge_blocks').update(merged).eq('id', id))) return;
      patch = merged;
      if (patch.content_text === undefined && patch.title === undefined) return;
      const { data: fresh } = await supabase.from('knowledge_connections').select('id,source_block_id,target_block_id,connection_type,auto_generated');
      const list = (fresh ?? []) as Connection[];
      const note = { ...(notes.rows.find((n) => n.id === id) as Note), ...patch };
      const { add, remove } = syncWikiLinks(note, wikiLinks(note.content_text ?? ''), notes.rows, list);
      if (add.length) await write(supabase.from('knowledge_connections').insert(add.map((target) => ({ source_block_id: id, target_block_id: target, auto_generated: true }))));
      if (remove.length) await write(supabase.from('knowledge_connections').delete().in('id', remove));
      if (add.length || remove.length) await connections.reload();
    });
  }

  /**
   * Creates a note and shows it at once: the id is made here, so the editor
   * opens on the new note before the server answers and nothing typed in the
   * meantime lands in the previous one. Edits wait behind the insert.
   */
  function createNote(row: Partial<Note>): string {
    const now = new Date().toISOString();
    const note: Note = {
      id: crypto.randomUUID(), area_id: null, title: 'Sem título', content: [], content_text: '', summary: null, tags: [], importance: 3,
      is_pinned: false, is_favorite: false, created_at: now, updated_at: now, ...row,
    };
    notes.setRows((rows) => [note, ...rows]);
    void saves(note.id, {}, async () => {
      const { id, title, area_id, content, content_text, tags, importance, is_pinned, is_favorite } = note;
      if (!await write(supabase.from('knowledge_blocks').insert({ id, title, area_id, content, content_text, tags, importance, is_pinned, is_favorite }))) {
        notes.setRows((rows) => rows.filter((n) => n.id !== note.id));
      }
    });
    return note.id;
  }

  return { areas, notes, connections, diary, captures, saveNote, createNote, saving: () => saves.busy() };
}

export type KnowledgeData = ReturnType<typeof useKnowledge>;
