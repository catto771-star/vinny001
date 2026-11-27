import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CheckSquare, FileText, Inbox, Network, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { latestPerKey } from '../../lib/serial';
import { addDays, formatDay, sentence, toDay } from '../../lib/dates';
import { num } from '../../lib/format';
import { newBlock } from '../../lib/blocks';
import { MOODS, averageMood, layoutGraph, writingStreak, type DiaryEntry } from '../../lib/knowledge';
import { LineChart } from '../../components/Charts';
import { CellChip, MonthCalendar } from '../../components/MonthCalendar';
import { Empty, ListSkeleton, PageHeader, Stat } from '../../components/ui';
import { Notes } from './Notes';
import { useKnowledge, type KnowledgeData } from './useKnowledge';

const TABS = ['Notas', 'Mapa', 'Diário', 'Captura'] as const;
type Tab = (typeof TABS)[number];

export default function Knowledge() {
  const data = useKnowledge();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('Notas');
  // The open note lives in state, so switching notes happens in the same click
  // (a URL change renders later, as a transition); the URL only mirrors it.
  const [selected, setSelected] = useState<string | null>(() => params.get('nota'));
  const select = (id: string | null) => { setSelected(id); if (id) setTab('Notas'); setParams(id ? { nota: id } : {}, { replace: true }); };
  const pending = data.captures.rows.filter((c) => !c.processed_into).length;
  return (
    <>
      <PageHeader title="Conhecimento" subtitle={`${data.notes.rows.length} notas${pending ? ` · ${pending} na captura` : ''}`} tabs={TABS} tab={tab} onTab={(t) => setTab(t as Tab)} />
      {data.notes.error && <p className="mb-4 text-sm text-negative">{data.notes.error}</p>}
      {data.notes.loading ? <ListSkeleton rows={4} /> : (
        <>
          {tab === 'Notas' && <Notes data={data} selected={selected} onSelect={select} />}
          {tab === 'Mapa' && <KnowledgeMap data={data} onOpen={select} />}
          {tab === 'Diário' && <Diary data={data} />}
          {tab === 'Captura' && <CaptureInbox data={data} onOpen={select} />}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

function KnowledgeMap({ data, onOpen }: { data: KnowledgeData; onOpen: (id: string) => void }) {
  const [area, setArea] = useState('');
  const [loose, setLoose] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const notes = data.notes.rows.filter((n) => !area || n.area_id === area);
  const ids = new Set(notes.map((n) => n.id));
  const edges = data.connections.rows.filter((c) => ids.has(c.source_block_id) && ids.has(c.target_block_id)).map((c) => [c.source_block_id, c.target_block_id] as [string, string]);
  const linked = new Set(edges.flat());
  const shown = notes.filter((n) => loose || linked.has(n.id));
  const key = shown.map((n) => n.id).join() + edges.map((e) => e.join('>')).join();
  const pos = useMemo(() => layoutGraph(shown.map((n) => n.id), edges), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const at = new Map(pos.map((p) => [p.id, p]));
  const colorOf = (areaId: string | null) => data.areas.rows.find((a) => a.id === areaId)?.color ?? 'var(--chart-neutral)';
  const near = hover ? new Set(edges.filter((e) => e.includes(hover)).flat()) : null;

  return (
    <section className="card" aria-label="Mapa de conexões">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <div className="font-medium">Mapa de conexões</div>
          <div className="text-[13px] text-fg3">{edges.length} conexões entre {linked.size} notas. Toque numa nota para abrir.</div>
        </div>
        <select className="input w-auto py-1.5 text-sm" aria-label="Filtrar área" value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">Todas as áreas</option>
          {data.areas.rows.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-fg2"><input type="checkbox" className="accent-[var(--brand)]" checked={loose} onChange={(e) => setLoose(e.target.checked)} />Notas sem conexão</label>
      </div>
      {shown.length === 0 ? <Empty icon={<Network size={18} strokeWidth={1.5} />}>Nenhuma conexão ainda. Escreva [[Título de outra nota]] numa nota para ligar as duas.</Empty> : (
        <svg viewBox="0 0 800 520" className="w-full rounded-xl bg-raised/30" role="img" aria-label="Notas e suas conexões">
          {edges.map(([a, b], i) => {
            const p = at.get(a); const q = at.get(b);
            if (!p || !q) return null;
            const on = !near || (near.has(a) && near.has(b) && (a === hover || b === hover));
            return <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} className="stroke-line-strong" strokeWidth={on && hover ? 1.5 : 1} opacity={on ? 1 : 0.25} />;
          })}
          {shown.map((n) => {
            const p = at.get(n.id);
            if (!p) return null;
            const r = 5 + n.importance * 1.5;
            const dim = near && !near.has(n.id) && n.id !== hover;
            return (
              <g key={n.id} transform={`translate(${p.x},${p.y})`} className="cursor-pointer" opacity={dim ? 0.3 : 1}
                onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onClick={() => onOpen(n.id)}
                role="link" aria-label={`Abrir ${n.title}`} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(n.id); }}>
                <circle r={r} fill={colorOf(n.area_id)} className="stroke-surface" strokeWidth={2} />
                <text y={r + 13} textAnchor="middle" className="fill-fg2 text-[11px]">{n.title.length > 22 ? `${n.title.slice(0, 21)}…` : n.title}</text>
              </g>
            );
          })}
        </svg>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Diary
// ---------------------------------------------------------------------------

function Diary({ data }: { data: KnowledgeData }) {
  const today = toDay(new Date());
  const [day, setDay] = useState(today);
  const [ym, setYm] = useState({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) });
  const entries = data.diary.rows;
  const entry = entries.find((e) => e.date === day);
  const from30 = addDays(today, -29);
  const avg = averageMood(entries, from30, today);
  const monthKey = `${ym.year}-${String(ym.month).padStart(2, '0')}`;
  const points = Array.from({ length: 30 }, (_, i) => addDays(from30, i)).map((d) => ({ label: `${Number(d.slice(8))}/${d.slice(5, 7)}`, value: entries.find((e) => e.date === d)?.mood ?? null }));

  // The editor reads the day's entry once, when it opens: wait for the entries.
  if (data.diary.loading) return <ListSkeleton rows={4} />;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <DiaryEditor key={day} day={day} entry={entry} data={data} today={today} onDay={setDay} />
      <div className="space-y-6">
        <div className="card grid grid-cols-3 gap-4">
          <Stat label="Sequência" value={writingStreak(entries, today)} unit="dias" accent />
          <Stat label="Humor (30 dias)" value={avg == null ? '—' : num(avg)} hint={avg == null ? undefined : MOODS[Math.round(avg) - 1]} />
          <Stat label="No mês" value={entries.filter((e) => e.date.startsWith(monthKey)).length} />
        </div>
        <MonthCalendar
          year={ym.year} month={ym.month} onMonth={setYm} selected={day} onSelect={(d) => { if (d <= today) setDay(d); }}
          count={(d) => (entries.some((e) => e.date === d) ? 1 : 0)}
          renderCell={(d) => { const e = entries.find((x) => x.date === d); return e ? <CellChip>{e.mood ? MOODS[e.mood - 1] : 'escrito'}</CellChip> : null; }}
        />
        <LineChart title="Humor" subtitle="Últimos 30 dias, de 1 (péssimo) a 5 (ótimo)" points={points} unit="" minZero={false} height={180} />
      </div>
    </div>
  );
}

function DiaryEditor({ day, entry, data, today, onDay }: { day: string; entry?: DiaryEntry; data: KnowledgeData; today: string; onDay: (d: string) => void }) {
  const [mood, setMood] = useState<number | null>(entry?.mood ?? null);
  const [title, setTitle] = useState(entry?.title ?? '');
  const [content, setContent] = useState(entry?.content ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saves = useRef(latestPerKey()).current;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function save(next: { mood: number | null; title: string; content: string }, wait = 700) {
    setStatus('saving');
    clearTimeout(timer.current);
    const run = () => saves(day, async () => {
      const row = { date: day, mood: next.mood, title: next.title || null, content: next.content };
      const { data: saved, error } = await supabase.from('diary_entries').upsert(row, { onConflict: 'user_id,date' }).select('id,date,title,content,mood').single();
      if (error) { alert(`Não foi possível salvar: ${error.message}`); return; }
      data.diary.setRows((rows) => [saved as DiaryEntry, ...rows.filter((r) => r.date !== day)].sort((a, b) => b.date.localeCompare(a.date)));
      setStatus('saved');
    });
    if (wait) timer.current = setTimeout(run, wait); else void run();
  }

  return (
    <section className="card h-fit" aria-label="Registro do dia">
      <div className="mb-4 flex items-center gap-2">
        <button className="icon-btn" onClick={() => onDay(addDays(day, -1))} aria-label="Dia anterior"><ChevronLeft size={16} strokeWidth={1.5} /></button>
        <div className="font-medium">{day === today ? 'Hoje' : sentence(formatDay(day))}</div>
        <button className="icon-btn" disabled={day >= today} onClick={() => onDay(addDays(day, 1))} aria-label="Próximo dia"><ChevronRight size={16} strokeWidth={1.5} /></button>
        <span className="ml-auto text-xs text-fg3" aria-live="polite">{status === 'saving' ? 'Salvando…' : status === 'saved' ? 'Salvo' : ''}</span>
        {entry && <button className="icon-btn text-negative" aria-label="Apagar registro do dia" onClick={async () => {
          if (confirm('Apagar o registro deste dia?') && await write(supabase.from('diary_entries').delete().eq('id', entry.id))) {
            data.diary.setRows((rows) => rows.filter((r) => r.id !== entry.id));
            setMood(null); setTitle(''); setContent(''); setStatus('idle');
          }
        }}><Trash2 size={16} strokeWidth={1.5} /></button>}
      </div>
      <div className="mb-4" role="group" aria-label="Humor do dia">
        <div className="label mb-2">Como foi o dia?</div>
        <div className="grid grid-cols-5 gap-2">
          {MOODS.map((m, i) => (
            <button key={m} type="button" aria-pressed={mood === i + 1}
              className={`rounded-xl border py-2 text-sm transition-colors duration-150 ${mood === i + 1 ? 'border-brand bg-brand/15 text-fg' : 'border-line text-fg2 hover:bg-raised'}`}
              onClick={() => { const v = mood === i + 1 ? null : i + 1; setMood(v); save({ mood: v, title, content }, 0); }}>
              <span className="figure block text-lg">{i + 1}</span>{m}
            </button>
          ))}
        </div>
      </div>
      <input className="mb-3 w-full bg-transparent text-lg font-medium outline-none placeholder:text-fg3" placeholder="Título (opcional)" aria-label="Título do dia"
        value={title} onChange={(e) => { setTitle(e.target.value); save({ mood, title: e.target.value, content }); }} />
      <textarea className="input min-h-64 resize-y text-[15px] leading-6" placeholder="O que aconteceu, o que aprendeu, pelo que é grato…" aria-label="Texto do diário"
        value={content} onChange={(e) => { setContent(e.target.value); save({ mood, title, content: e.target.value }); }} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Quick capture
// ---------------------------------------------------------------------------

function CaptureInbox({ data, onOpen }: { data: KnowledgeData; onOpen: (id: string) => void }) {
  const [text, setText] = useState('');
  const open = data.captures.rows.filter((c) => !c.processed_into);
  const done = data.captures.rows.filter((c) => c.processed_into);

  async function add(e?: FormEvent) {
    e?.preventDefault();
    if (!text.trim()) return;
    if (await write(supabase.from('brain_entries').insert({ content: text.trim() }))) { setText(''); void data.captures.reload(); }
  }
  const split = (content: string) => {
    const [first, ...rest] = content.split('\n');
    return { title: first.slice(0, 120).trim() || 'Captura', body: rest.join('\n').trim() };
  };
  async function mark(id: string, processed_into: string) {
    data.captures.setRows((rows) => rows.map((c) => (c.id === id ? { ...c, processed_into } : c)));
    await write(supabase.from('brain_entries').update({ processed_into }).eq('id', id));
  }
  async function toNote(id: string, content: string) {
    const { title, body } = split(content);
    const blocks = body ? body.split('\n').map((l) => newBlock('paragraph', l)) : [];
    const noteId = data.createNote({ title, content: blocks, content_text: body });
    if (noteId) { await mark(id, 'nota'); onOpen(noteId); }
  }
  async function toTask(id: string, content: string) {
    const { title, body } = split(content);
    if (await write(supabase.from('tasks').insert({ title, description: body || null }))) await mark(id, 'tarefa');
  }
  const ago = (iso: string) => {
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    return m < 1 ? 'agora' : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : sentence(formatDay(toDay(new Date(iso))));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <form className="card h-fit" onSubmit={add}>
        <div className="label mb-2">Captura rápida</div>
        <p className="mb-3 text-sm text-fg3">Tire da cabeça agora e decida depois: vira nota, tarefa ou some. A primeira linha vira o título.</p>
        <textarea className="input mb-3 min-h-32" placeholder="Ideia, link, lembrete solto…" aria-label="Nova captura" value={text}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void add(); }} />
        <button className="btn-primary w-full">Guardar <span className="ml-1 text-xs opacity-60">Ctrl+Enter</span></button>
      </form>
      <section aria-label="Caixa de entrada">
        <div className="label mb-3">Para processar ({open.length})</div>
        {open.length === 0 && <div className="card"><Empty icon={<Inbox size={18} strokeWidth={1.5} />}>Caixa vazia</Empty></div>}
        <ul className="space-y-2">
          {open.map((c) => (
            <li key={c.id} className="card p-4">
              <p className="mb-3 text-sm whitespace-pre-wrap">{c.content}</p>
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-auto text-xs text-fg3">{ago(c.created_at)}</span>
                <button className="btn-ghost h-8 text-sm" onClick={() => toNote(c.id, c.content)}><FileText size={14} strokeWidth={1.5} />Virar nota</button>
                <button className="btn-ghost h-8 text-sm" onClick={() => toTask(c.id, c.content)}><CheckSquare size={14} strokeWidth={1.5} />Virar tarefa</button>
                <button className="icon-btn" aria-label="Excluir captura" onClick={async () => {
                  if (await write(supabase.from('brain_entries').delete().eq('id', c.id))) data.captures.setRows((rows) => rows.filter((x) => x.id !== c.id));
                }}><Trash2 size={14} strokeWidth={1.5} /></button>
              </div>
            </li>
          ))}
        </ul>
        {done.length > 0 && (
          <details className="mt-4">
            <summary className="label cursor-pointer">Processadas ({done.length})</summary>
            <ul className="mt-2 space-y-1 text-sm text-fg3">
              {done.slice(0, 30).map((c) => <li key={c.id} className="truncate">{c.processed_into === 'nota' ? 'Nota' : 'Tarefa'}: {c.content.split('\n')[0]}</li>)}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
