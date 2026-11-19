import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Link2, Notebook, Pin, Plus, Search, Star, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { blocksToText, type Block } from '../../lib/blocks';
import { excerpt, linkedNotes, searchNotes, type Area, type Note } from '../../lib/knowledge';
import { Empty, Field, Modal } from '../../components/ui';
import { BlockEditor } from './BlockEditor';
import type { KnowledgeData } from './useKnowledge';

type Filter = 'all' | 'fav' | 'none' | string;
const AREA_COLORS = ['#ea580c', '#0ea5e9', '#22c55e', '#a855f7', '#eab308', '#ec4899', '#64748b'];

export function Notes({ data, selected, onSelect }: { data: KnowledgeData; selected: string | null; onSelect: (id: string | null) => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [areaForm, setAreaForm] = useState<Partial<Area> | null>(null);
  const notes = data.notes.rows;
  const inFilter = notes.filter((n) => filter === 'all' || (filter === 'fav' ? n.is_favorite : filter === 'none' ? !n.area_id : n.area_id === filter));
  const list = searchNotes(inFilter, query);
  const note = notes.find((n) => n.id === selected) ?? null;
  const areaOf = (n: Note) => data.areas.rows.find((a) => a.id === n.area_id);

  async function create() {
    const id = data.createNote({ area_id: filter !== 'all' && filter !== 'fav' && filter !== 'none' ? filter : null });
    if (id) onSelect(id);
  }

  const chip = (key: Filter, label: string, count: number, color?: string | null, emoji?: string | null, area?: Area) => (
    <li key={key} className="group flex items-center">
      <button
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors duration-150 ${filter === key ? 'bg-raised text-fg' : 'text-fg2 hover:bg-raised/50'}`}
        onClick={() => { setFilter(key); onSelect(null); }} aria-pressed={filter === key}
      >
        {emoji ? <span className="w-4 text-center">{emoji}</span> : <span className="ml-1 h-2 w-2 shrink-0 rounded-full" style={{ background: color ?? 'var(--fg3)' }} />}
        <span className="mr-auto truncate">{label}</span>
        <span className="figure text-xs text-fg3">{count}</span>
      </button>
      {area && <button className="icon-btn h-7 w-7 opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={`Editar área ${area.name}`} onClick={() => setAreaForm(area)}>⋯</button>}
    </li>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_300px_1fr]">
      <aside className={note ? 'hidden lg:block' : ''} aria-label="Áreas">
        <ul className="flex gap-1 overflow-x-auto pb-1 lg:block lg:space-y-0.5 lg:overflow-visible">
          {chip('all', 'Todas as notas', notes.length)}
          {chip('fav', 'Favoritas', notes.filter((n) => n.is_favorite).length, '#eab308')}
          {data.areas.rows.map((a) => chip(a.id, a.name, notes.filter((n) => n.area_id === a.id).length, a.color, a.emoji, a))}
          {notes.some((n) => !n.area_id) && chip('none', 'Sem área', notes.filter((n) => !n.area_id).length)}
        </ul>
        <button className="btn-ghost mt-2 w-full justify-start" onClick={() => setAreaForm({})}><Plus size={16} strokeWidth={1.5} />Nova área</button>
      </aside>

      <section className={note ? 'hidden lg:block' : ''} aria-label="Lista de notas">
        <div className="mb-3 flex gap-2">
          <label className="relative flex-1">
            <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg3" />
            <input className="input pl-9" placeholder="Buscar notas" aria-label="Buscar notas" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <button className="btn-primary px-3" onClick={create} aria-label="Nova nota"><Plus size={16} strokeWidth={1.5} /></button>
        </div>
        {list.length === 0 && (
          <div className="card"><Empty icon={<Notebook size={18} strokeWidth={1.5} />} action={!query ? <button className="btn-secondary" onClick={create}>Nova nota</button> : undefined}>
            {query ? 'Nada encontrado' : 'Nenhuma nota aqui'}
          </Empty></div>
        )}
        <ul className="space-y-2">
          {list.map((n) => {
            const area = areaOf(n);
            return (
              <li key={n.id}>
                <button className={`card w-full p-3 text-left transition-colors duration-150 ${n.id === selected ? 'border-brand/60' : 'hover:border-line-strong'}`} onClick={() => onSelect(n.id)}>
                  <div className="flex items-center gap-1.5">
                    {n.is_pinned && <Pin size={12} strokeWidth={1.5} className="shrink-0 text-brand-ink" aria-label="Fixada" />}
                    <span className="mr-auto truncate text-sm font-medium">{n.title || 'Sem título'}</span>
                    {n.is_favorite && <Star size={12} strokeWidth={1.5} className="shrink-0 fill-current text-[#eab308]" aria-label="Favorita" />}
                  </div>
                  {n.content_text && <p className="mt-1 line-clamp-2 text-xs text-fg3">{excerpt(n.content_text)}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-fg3">
                    {area && <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: area.color ?? 'var(--fg3)' }} />{area.name}</span>}
                    {n.tags.slice(0, 3).map((t) => <span key={t} className="rounded bg-raised px-1.5">#{t}</span>)}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={note ? '' : 'hidden lg:block'} aria-label="Nota">
        {note ? <NoteEditor key={note.id} note={note} data={data} onOpen={onSelect} onClose={() => onSelect(null)} />
          : <div className="card"><Empty icon={<Notebook size={18} strokeWidth={1.5} />}>Escolha uma nota ou crie uma nova</Empty></div>}
      </section>

      {areaForm && <AreaForm area={areaForm} data={data} onClose={() => setAreaForm(null)} onDeleted={() => setFilter('all')} />}
    </div>
  );
}

function NoteEditor({ note, data, onOpen, onClose }: { note: Note; data: KnowledgeData; onOpen: (id: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState(note.title);
  const [tags, setTags] = useState(note.tags.join(', '));
  const [status, setStatus] = useState<'saved' | 'saving'>('saved');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<Partial<Note>>({});
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (note.title === 'Sem título' && !note.content_text) titleRef.current?.select(); }, [note.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { clearTimeout(timer.current); flush(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function flush() {
    const patch = pending.current;
    pending.current = {};
    if (!Object.keys(patch).length) return;
    void data.saveNote(note.id, patch).then(() => setStatus('saved'));
  }
  /** Text edits wait a moment and go together; toggles save at once. */
  function change(patch: Partial<Note>, wait = 600) {
    pending.current = { ...pending.current, ...patch };
    setStatus('saving');
    clearTimeout(timer.current);
    if (wait) timer.current = setTimeout(flush, wait);
    else flush();
  }

  const links = linkedNotes(note.id, data.connections.rows, data.notes.rows);
  const others = data.notes.rows.filter((n) => n.id !== note.id && !links.some((l) => l.note.id === n.id));

  async function remove() {
    if (!confirm('Excluir esta nota?')) return;
    clearTimeout(timer.current);
    pending.current = {};
    if (await write(supabase.from('knowledge_blocks').delete().eq('id', note.id))) {
      data.notes.setRows((rows) => rows.filter((n) => n.id !== note.id));
      void data.connections.reload();
      onClose();
    }
  }
  async function connect(target: string) {
    if (target && await write(supabase.from('knowledge_connections').insert({ source_block_id: note.id, target_block_id: target }))) void data.connections.reload();
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="mb-3 flex items-center gap-1">
          <button className="btn-ghost -ml-2 lg:hidden" onClick={onClose}><ArrowLeft size={16} strokeWidth={1.5} />Notas</button>
          <span className="mr-auto text-xs text-fg3" aria-live="polite">{status === 'saving' ? 'Salvando…' : 'Salvo'}</span>
          <button className={`icon-btn ${note.is_pinned ? 'text-brand-ink' : ''}`} aria-pressed={note.is_pinned} aria-label="Fixar nota" onClick={() => change({ is_pinned: !note.is_pinned }, 0)}><Pin size={16} strokeWidth={1.5} /></button>
          <button className={`icon-btn ${note.is_favorite ? 'text-[#eab308]' : ''}`} aria-pressed={note.is_favorite} aria-label="Favoritar nota" onClick={() => change({ is_favorite: !note.is_favorite }, 0)}><Star size={16} strokeWidth={1.5} className={note.is_favorite ? 'fill-current' : ''} /></button>
          <button className="icon-btn text-negative" aria-label="Excluir nota" onClick={remove}><Trash2 size={16} strokeWidth={1.5} /></button>
        </div>
        <input
          ref={titleRef} className="mb-3 w-full bg-transparent text-2xl leading-8 font-medium outline-none placeholder:text-fg3" placeholder="Título" aria-label="Título da nota"
          value={title} onChange={(e) => { setTitle(e.target.value); change({ title: e.target.value }); }}
        />
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          <select className="input w-auto py-1 text-sm" aria-label="Área da nota" value={note.area_id ?? ''} onChange={(e) => change({ area_id: e.target.value || null }, 0)}>
            <option value="">Sem área</option>
            {data.areas.rows.map((a) => <option key={a.id} value={a.id}>{a.emoji ? `${a.emoji} ` : ''}{a.name}</option>)}
          </select>
          <select className="input w-auto py-1 text-sm" aria-label="Importância" value={note.importance} onChange={(e) => change({ importance: Number(e.target.value) }, 0)}>
            {[1, 2, 3, 4, 5].map((i) => <option key={i} value={i}>Importância {i}</option>)}
          </select>
          <input className="input min-w-40 flex-1 py-1 text-sm" placeholder="Tags, separadas por vírgula" aria-label="Tags"
            value={tags} onChange={(e) => { setTags(e.target.value); change({ tags: e.target.value.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean) }); }} />
        </div>
        <BlockEditor initial={note.content} onChange={(blocks: Block[]) => change({ content: blocks, content_text: blocksToText(blocks) })} />
      </div>

      <div className="card">
        <div className="label mb-2 flex items-center gap-2"><Link2 size={14} strokeWidth={1.5} />Conexões</div>
        {links.length === 0 && <p className="mb-3 text-sm text-fg3">Escreva [[Título de outra nota]] no texto para conectar, ou escolha abaixo.</p>}
        <ul className="mb-3 flex flex-wrap gap-2">
          {links.map(({ note: n, connection: c, direction }) => (
            <li key={n.id} className="flex items-center rounded-lg bg-raised text-sm">
              <button className="px-2.5 py-1 hover:underline" onClick={() => onOpen(n.id)} title={direction === 'in' ? 'Esta nota é citada lá' : c.auto_generated ? 'Via [[link]]' : 'Conexão manual'}>
                {direction === 'in' ? '← ' : ''}{n.title || 'Sem título'}
              </button>
              {!c.auto_generated && (
                <button className="icon-btn h-6 w-6" aria-label={`Desconectar ${n.title}`} onClick={async () => {
                  if (await write(supabase.from('knowledge_connections').delete().eq('id', c.id))) void data.connections.reload();
                }}><X size={12} strokeWidth={1.5} /></button>
              )}
            </li>
          ))}
        </ul>
        {others.length > 0 && (
          <select className="input py-1.5 text-sm" aria-label="Conectar a outra nota" value="" onChange={(e) => void connect(e.target.value)}>
            <option value="">Conectar a…</option>
            {others.map((n) => <option key={n.id} value={n.id}>{n.title || 'Sem título'}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}

function AreaForm({ area, data, onClose, onDeleted }: { area: Partial<Area>; data: KnowledgeData; onClose: () => void; onDeleted: () => void }) {
  const [name, setName] = useState(area.name ?? '');
  const [emoji, setEmoji] = useState(area.emoji ?? '');
  const [color, setColor] = useState(area.color ?? AREA_COLORS[1]);
  const [description, setDescription] = useState(area.description ?? '');
  async function save(e: FormEvent) {
    e.preventDefault();
    const row = { name, emoji: emoji || null, color, description: description || null };
    const ok = area.id ? await write(supabase.from('knowledge_areas').update(row).eq('id', area.id)) : await write(supabase.from('knowledge_areas').insert(row));
    if (ok) { void data.areas.reload(); onClose(); }
  }
  return (
    <Modal title={area.id ? 'Editar área' : 'Nova área'} onClose={onClose}>
      <form onSubmit={save}>
        <div className="grid grid-cols-[1fr_88px] gap-2">
          <Field label="Nome da área"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></Field>
          <Field label="Emoji"><input className="input text-center" maxLength={4} value={emoji} onChange={(e) => setEmoji(e.target.value)} /></Field>
        </div>
        <Field label="Descrição"><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="mb-4" role="group" aria-label="Cor">
          <span className="mb-1.5 block text-[13px] leading-5 text-fg2">Cor</span>
          <div className="flex gap-2">
            {AREA_COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Cor ${c}`} aria-pressed={c === color} onClick={() => setColor(c)}
                className={`h-7 w-7 rounded-full ${c === color ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface' : ''}`} style={{ background: c }} />
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          {area.id && <button type="button" className="btn-ghost text-negative" onClick={async () => {
            if (confirm('Excluir esta área? As notas continuam, sem área.') && await write(supabase.from('knowledge_areas').delete().eq('id', area.id!))) {
              void data.areas.reload(); void data.notes.reload(); onDeleted(); onClose();
            }
          }}>Excluir</button>}
          <button className="btn-primary ml-auto">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}
