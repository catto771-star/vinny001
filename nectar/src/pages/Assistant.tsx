import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowUp, Bot, CheckCircle2, ImagePlus, KeyRound, Mic, MicOff, RotateCcw, Sunrise, Trash2, Workflow, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTable, write } from '../lib/useTable';
import { formatDay, formatTime, sentence, toDay } from '../lib/dates';
import { pieces, type Span } from '../lib/chat';
import { modelLabel } from '../lib/prefs';
import { Empty, ListSkeleton, PageHeader } from '../components/ui';
import { notifyDataChanged } from '../components/QuickCaptureModal';

interface UndoSpec {
  table: string;
  op: 'delete' | 'update';
  id: string;
  patch?: Record<string, unknown>;
}

interface ActionItem {
  tool: string;
  summary: string;
  undo?: UndoSpec;
}

interface Message {
  id: string;
  content: string;
  is_user: boolean;
  created_at: string;
  metadata: { kind?: string; title?: string; actions?: ActionItem[]; model?: string } | null;
}

const SUGGESTIONS = [
  'O que tenho para hoje e o que está atrasado?',
  'Anote: gastei € 14,50 no Tesco pela Revolut',
  'Lembre que meus gastos em euro padrão vão na conta Revolut',
  'Crie um compromisso amanhã às 15h: estudar QQI Level 5',
  'Quais hábitos faltam hoje?',
];

const UNDO_TABLES = new Set([
  'tasks', 'reminders', 'events', 'habit_completions', 'transactions',
  'knowledge_blocks', 'goal_entries', 'project_steps', 'food_logs',
  'body_measurements', 'assistant_memories',
]);

/** Compresses a chosen image client-side to a compact JPEG data URL (max 1024px) for Claude Vision. */
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagem não suportado.'));
      img.onload = () => {
        const max = 1024;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas indisponível.'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechCtor(): (new () => SpeechRec) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export default function Assistant() {
  const messages = useTable<Message>('chat_messages', 'id,content,is_user,created_at,metadata', { column: 'created_at' });
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [undone, setUndone] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<{ missingKey: boolean; message: string } | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const recRef = useRef<SpeechRec | null>(null);
  const list = messages.rows.slice(-200);
  const voiceSupported = typeof window !== 'undefined' && !!getSpeechCtor();

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [list.length, sending]);
  useEffect(() => () => { recRef.current?.stop(); }, []);
  useLayoutEffect(() => {
    const el = box.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(160, el.scrollHeight)}px`; }
  }, [text]);

  function toggleVoice() {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const Ctor = getSpeechCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = 'pt-BR';
    rec.interimResults = false;
    rec.onresult = (e) => {
      const spoken = Array.from(e.results).map((r) => r[0]?.transcript ?? '').join(' ').trim();
      if (spoken) setText((prev) => (prev ? `${prev.trimEnd()} ${spoken}` : spoken));
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  async function onPickImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setError(null);
      setImage(await compressImage(file));
    } catch (err) {
      setError({ missingKey: false, message: (err as Error).message });
    }
  }

  async function send(message: string) {
    const content = message.trim();
    const attached = image;
    if ((!content && !attached) || sending) return;
    if (listening) { recRef.current?.stop(); setListening(false); }
    setText('');
    setImage(null);
    setError(null);
    setSending(true);
    const shownText = content || 'Analisar imagem anexada';
    const local: Message = { id: `local-${Date.now()}`, content: attached ? `${shownText} [imagem anexada]` : shownText, is_user: true, created_at: new Date().toISOString(), metadata: null };
    messages.setRows((rows) => [...rows, local]);
    const { data, error: e } = await supabase.functions.invoke('assistant', { body: { message: content, ...(attached ? { image: attached } : {}) } });
    if (e) {
      const body = await (e as { context?: Response }).context?.json?.().catch(() => null);
      setError({ missingKey: body?.error === 'missing_key', message: body?.message ?? 'Não consegui falar com o assistente agora. Tente de novo.' });
      messages.setRows((rows) => rows.filter((r) => r.id !== local.id));
      setText(content);
      setImage(attached);
    } else if (data?.saved === false) {
      messages.setRows((rows) => [...rows, { id: `local-${Date.now()}-a`, content: data.reply, is_user: false, created_at: new Date().toISOString(), metadata: { actions: data.actions, model: data.model } }]);
      setError({ missingKey: false, message: `A resposta não foi salva no histórico (${data.saveError ?? 'erro desconhecido'}).` });
    } else if (data) {
      await messages.reload();
      if (data.actions?.length) notifyDataChanged();
    }
    setSending(false);
  }

  async function undoAction(key: string, spec: UndoSpec) {
    if (!UNDO_TABLES.has(spec.table) || undone.has(key)) return;
    const ok = spec.op === 'delete'
      ? await write(supabase.from(spec.table).delete().eq('id', spec.id))
      : await write(supabase.from(spec.table).update(spec.patch ?? {}).eq('id', spec.id));
    if (ok) {
      setUndone((prev) => new Set(prev).add(key));
      notifyDataChanged();
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(text); }
  }

  async function clear() {
    if (!confirm('Apagar toda a conversa? Tarefas, notas, memórias e registros criados pelo assistente continuam.')) return;
    const ids = messages.rows.map((m) => m.id);
    if (ids.length && await write(supabase.from('chat_messages').delete().in('id', ids))) messages.setRows([]);
  }

  let lastDay = '';
  return (
    <div className="flex h-[calc(100dvh-9rem)] flex-col md:h-[calc(100dvh-5rem)]">
      <PageHeader
        title="Assistente" subtitle="Autônomo com Claude Sonnet, memória contínua, ações com desfazer, voz e leitura de fotos."
        action={list.length > 0 ? <button className="btn-ghost" onClick={clear}><Trash2 size={16} strokeWidth={1.5} aria-hidden="true" />Limpar conversa</button> : undefined}
      />
      <section className="card flex min-h-0 flex-1 flex-col p-0" aria-label="Conversa">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6" role="log" aria-live="polite">
          {messages.loading && <ListSkeleton rows={3} />}
          {!messages.loading && list.length === 0 && (
            <Empty icon={<Bot size={18} strokeWidth={1.5} />}>
              Peça para criar ou reagendar tarefas, lançar gastos em euro/real, agendar compromissos, ensinar preferências ou enviar fotos de recibos e refeições.
            </Empty>
          )}
          <ol className="mx-auto max-w-3xl space-y-4">
            {list.map((m) => {
              const day = toDay(new Date(m.created_at));
              const divider = day !== lastDay;
              lastDay = day;
              return (
                <li key={m.id}>
                  {divider && <div className="my-4 text-center text-xs text-fg3">{day === toDay(new Date()) ? 'Hoje' : sentence(formatDay(day))}</div>}
                  <Bubble m={m} undone={undone} onUndo={undoAction} />
                </li>
              );
            })}
            {sending && (
              <li className="flex items-center gap-2 text-sm text-fg3" aria-label="O assistente está escrevendo">
                <Bot size={16} strokeWidth={1.5} /><span className="animate-pulse">Pensando e executando…</span>
              </li>
            )}
          </ol>
          <div ref={end} />
        </div>

        {error && (
          <div className={`mx-4 mb-3 flex gap-2 rounded-xl border px-3 py-2 text-sm sm:mx-6 ${error.missingKey ? 'border-brand/40 text-fg2' : 'border-negative/40 text-negative'}`} role="alert">
            {error.missingKey && <KeyRound size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-brand-ink" />}
            <span>{error.message}</span>
          </div>
        )}
        {list.length < 2 && !sending && (
          <div className="flex flex-wrap gap-2 px-4 pb-3 sm:px-6" aria-label="Sugestões">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className="rounded-full border border-line-strong bg-surface px-3.5 py-2 text-left text-[13px] text-fg2 transition-colors duration-150 hover:bg-raised hover:text-fg active:scale-[0.98]"
                onClick={() => void send(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {image && (
          <div className="mx-4 mb-2 flex items-center gap-3 rounded-xl bg-raised p-2 sm:mx-6">
            <img src={image} alt="Prévia da imagem anexada" className="h-12 w-12 rounded-lg object-cover" />
            <span className="mr-auto text-xs text-fg2">Imagem pronta para leitura (recibo, prato ou anotação)</span>
            <button type="button" className="icon-btn h-8 w-8" onClick={() => setImage(null)} aria-label="Remover imagem">
              <X size={15} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        )}
        <form className="flex items-end gap-2 border-t border-line p-3 sm:px-6" onSubmit={(e: FormEvent) => { e.preventDefault(); void send(text); }}>
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => void onPickImage(e)} />
          <button
            type="button"
            className="icon-btn shrink-0"
            onClick={() => fileInput.current?.click()}
            disabled={sending}
            title="Anexar foto de recibo ou prato"
            aria-label="Anexar foto"
          >
            <ImagePlus size={18} strokeWidth={1.6} aria-hidden="true" />
          </button>
          {voiceSupported && (
            <button
              type="button"
              className={`icon-btn shrink-0 ${listening ? 'bg-negative/15 text-negative' : ''}`}
              onClick={toggleVoice}
              disabled={sending}
              title={listening ? 'Parar ditado' : 'Falar pedido por voz'}
              aria-label={listening ? 'Parar ditado por voz' : 'Ditar por voz'}
              aria-pressed={listening}
            >
              {listening ? <MicOff size={18} strokeWidth={1.6} aria-hidden="true" /> : <Mic size={18} strokeWidth={1.6} aria-hidden="true" />}
            </button>
          )}
          <textarea
            ref={box} rows={1} className="input max-h-40 min-h-10 flex-1 resize-none py-2.5"
            placeholder={listening ? 'Ouvindo… fale seu pedido' : 'Escreva, dite ou anexe uma foto…'}
            aria-label="Mensagem para o assistente"
            value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} maxLength={4000}
          />
          <button className="btn-primary h-10 w-10 shrink-0 justify-center p-0" disabled={sending || (!text.trim() && !image)} aria-label="Enviar">
            <ArrowUp size={18} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </form>
      </section>
    </div>
  );
}

function Bubble({ m, undone, onUndo }: { m: Message; undone: Set<string>; onUndo: (key: string, spec: UndoSpec) => void }) {
  const time = formatTime(m.created_at);
  if (m.is_user) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-raised px-4 py-2.5 text-[15px] leading-6 whitespace-pre-wrap">
          {m.content}
          <div className="mt-1 text-right text-[11px] text-fg3">{time}</div>
        </div>
      </div>
    );
  }
  const briefing = m.metadata?.kind === 'briefing';
  const auto = m.metadata?.kind === 'automation';
  const modelName = m.metadata?.model ? modelLabel(m.metadata.model) : null;
  return (
    <div className={`max-w-[92%] ${briefing || auto ? 'rounded-2xl border border-line bg-raised/40 px-4 py-3' : ''}`}>
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs text-fg3">
        {briefing ? <Sunrise size={14} strokeWidth={1.5} className="text-brand-ink" /> : auto ? <Workflow size={14} strokeWidth={1.5} className="text-brand-ink" /> : <Bot size={14} strokeWidth={1.5} />}
        <span>{briefing ? 'Resumo do dia · Piloto automático' : auto ? `Piloto automático · ${m.metadata?.title ?? 'pedido à IA'}` : modelName ?? 'Assistente'} · {time}</span>
      </div>
      <Rich text={m.content} />
      {!!m.metadata?.actions?.length && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="O que foi feito">
          {m.metadata.actions.map((a, i) => {
            const key = `${m.id}:${i}`;
            const isUndone = undone.has(key);
            return (
              <li key={key} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${isUndone ? 'bg-raised text-fg3 line-through' : 'bg-positive/10 text-positive'}`}>
                <CheckCircle2 size={12} strokeWidth={1.5} aria-hidden="true" />
                <span>{a.summary}</span>
                {a.undo && !isUndone && (
                  <button
                    type="button"
                    onClick={() => onUndo(key, a.undo!)}
                    className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-surface/80 px-1.5 py-0.5 text-[11px] font-medium text-fg2 transition-colors hover:bg-surface hover:text-fg"
                    aria-label={`Desfazer: ${a.summary}`}
                  >
                    <RotateCcw size={10} strokeWidth={2} aria-hidden="true" />Desfazer
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Line({ spans }: { spans: Span[] }) {
  return <>{spans.map((s, i) => (s.code ? <code key={i} className="rounded bg-raised px-1 font-mono text-[13px]">{s.text}</code> : s.bold ? <strong key={i} className="font-medium">{s.text}</strong> : <span key={i}>{s.text}</span>))}</>;
}

function Rich({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-[15px] leading-6">
      {pieces(text).map((p, i) => {
        if (p.kind === 'h') return <div key={i} className="font-medium"><Line spans={p.spans} /></div>;
        if (p.kind === 'p') return <p key={i} className="whitespace-pre-wrap"><Line spans={p.spans} /></p>;
        const Tag = p.kind;
        return <Tag key={i} className={`space-y-1 pl-5 ${p.kind === 'ul' ? 'list-disc' : 'list-decimal'} marker:text-fg3`}>{p.items.map((it, k) => <li key={k}><Line spans={it} /></li>)}</Tag>;
      })}
    </div>
  );
}
