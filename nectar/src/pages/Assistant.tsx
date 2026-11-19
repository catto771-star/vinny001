import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowUp, Bot, CheckCircle2, KeyRound, Sunrise, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTable, write } from '../lib/useTable';
import { formatDay, formatTime, sentence, toDay } from '../lib/dates';
import { pieces, type Span } from '../lib/chat';
import { Empty, ListSkeleton, PageHeader } from '../components/ui';

interface Message {
  id: string;
  content: string;
  is_user: boolean;
  created_at: string;
  metadata: { kind?: string; actions?: { tool: string; summary: string }[]; model?: string } | null;
}

const SUGGESTIONS = [
  'O que tenho para hoje?',
  'Anote: gastei R$ 32 no almoço',
  'Crie uma tarefa para amanhã: ligar para o contador',
  'Como estão minhas finanças este mês?',
  'Quais hábitos faltam hoje?',
];

export default function Assistant() {
  const messages = useTable<Message>('chat_messages', 'id,content,is_user,created_at,metadata', { column: 'created_at' });
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ missingKey: boolean; message: string } | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const list = messages.rows.slice(-200);

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [list.length, sending]);
  useLayoutEffect(() => {
    const el = box.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(160, el.scrollHeight)}px`; }
  }, [text]);

  async function send(message: string) {
    const content = message.trim();
    if (!content || sending) return;
    setText('');
    setError(null);
    setSending(true);
    const local: Message = { id: `local-${Date.now()}`, content, is_user: true, created_at: new Date().toISOString(), metadata: null };
    messages.setRows((rows) => [...rows, local]);
    const { data, error: e } = await supabase.functions.invoke('assistant', { body: { message: content } });
    if (e) {
      const body = await (e as { context?: Response }).context?.json?.().catch(() => null);
      setError({ missingKey: body?.error === 'missing_key', message: body?.message ?? 'Não consegui falar com o assistente agora. Tente de novo.' });
      messages.setRows((rows) => rows.filter((r) => r.id !== local.id));
      setText(content);
    } else if (data) {
      await messages.reload();
    }
    setSending(false);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(text); }
  }

  async function clear() {
    if (!confirm('Apagar toda a conversa? Tarefas, notas e registros criados pelo assistente continuam.')) return;
    const ids = messages.rows.map((m) => m.id);
    if (ids.length && await write(supabase.from('chat_messages').delete().in('id', ids))) messages.setRows([]);
  }

  let lastDay = '';
  return (
    <div className="flex h-[calc(100dvh-9rem)] flex-col md:h-[calc(100dvh-5rem)]">
      <PageHeader
        title="Assistente" subtitle="DeepSeek, com acesso às suas tarefas, hábitos, finanças, metas, projetos e notas"
        action={list.length > 0 ? <button className="btn-ghost" onClick={clear}><Trash2 size={16} strokeWidth={1.5} />Limpar conversa</button> : undefined}
      />
      <section className="card flex min-h-0 flex-1 flex-col p-0" aria-label="Conversa">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6" role="log" aria-live="polite">
          {messages.loading && <ListSkeleton rows={3} />}
          {!messages.loading && list.length === 0 && (
            <Empty icon={<Bot size={18} strokeWidth={1.5} />}>
              Pergunte sobre o seu dia, peça para criar tarefas e lembretes, registrar gastos, marcar hábitos ou anotar ideias.
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
                  <Bubble m={m} />
                </li>
              );
            })}
            {sending && (
              <li className="flex items-center gap-2 text-sm text-fg3" aria-label="O assistente está escrevendo">
                <Bot size={16} strokeWidth={1.5} /><span className="animate-pulse">Pensando…</span>
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
          <div className="flex gap-2 overflow-x-auto px-4 pb-3 sm:px-6" aria-label="Sugestões">
            {SUGGESTIONS.map((s) => <button key={s} className="shrink-0 rounded-full border border-line px-3 py-1.5 text-sm text-fg2 hover:bg-raised" onClick={() => void send(s)}>{s}</button>)}
          </div>
        )}
        <form className="flex items-end gap-2 border-t border-line p-3 sm:px-6" onSubmit={(e: FormEvent) => { e.preventDefault(); void send(text); }}>
          <textarea
            ref={box} rows={1} className="input max-h-40 min-h-10 flex-1 resize-none py-2.5" placeholder="Escreva para o assistente…" aria-label="Mensagem para o assistente"
            value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} maxLength={4000}
          />
          <button className="btn-primary h-10 w-10 shrink-0 justify-center p-0" disabled={sending || !text.trim()} aria-label="Enviar"><ArrowUp size={18} strokeWidth={1.5} /></button>
        </form>
      </section>
    </div>
  );
}

function Bubble({ m }: { m: Message }) {
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
  return (
    <div className={`max-w-[92%] ${briefing ? 'rounded-2xl border border-line bg-raised/40 px-4 py-3' : ''}`}>
      <div className="mb-1 flex items-center gap-1.5 text-xs text-fg3">
        {briefing ? <Sunrise size={14} strokeWidth={1.5} className="text-brand-ink" /> : <Bot size={14} strokeWidth={1.5} />}
        {briefing ? 'Resumo do dia · Piloto automático' : 'Assistente'} · {time}
      </div>
      <Rich text={m.content} />
      {!!m.metadata?.actions?.length && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="O que foi feito">
          {m.metadata.actions.map((a, i) => (
            <li key={i} className="flex items-center gap-1 rounded-full bg-positive/10 px-2.5 py-1 text-xs text-positive">
              <CheckCircle2 size={12} strokeWidth={1.5} />{a.summary}
            </li>
          ))}
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
