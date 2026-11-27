import {
  useEffect, useLayoutEffect, useMemo, useRef, useState,
  type ChangeEvent, type ClipboardEvent, type FormEvent, type KeyboardEvent,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowUp, ArrowUpRight, Bot, Brain, CheckCircle2, ImagePlus, KeyRound, MessageSquarePlus,
  Mic, MicOff, Plus, RotateCcw, Sunrise, Trash2, Workflow, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTable, write } from '../lib/useTable';
import { formatDay, formatTime, sentence, toDay } from '../lib/dates';
import { pieces, type Span } from '../lib/chat';
import { AI_MODELS, modelLabel } from '../lib/prefs';
import {
  AUTOMATIONS_THREAD_ID, DEFAULT_THREAD_ID, actionLinkOf, createThreadId, expandSlashCommand,
  filterThreadMessages, groupThreads, matchSlashCommands, playbooksForRoute,
  screenContextFromLocation, titleFromMessage,
  type ChatActionItem, type ChatMessageRow, type SlashCommand,
} from '../lib/assistant';
import { Empty, ListSkeleton } from './ui';
import { notifyDataChanged } from './QuickCaptureModal';

interface MemoryRow {
  id: string;
  category: string;
  content: string;
  updated_at: string;
}

const MEMORY_CATEGORIES = [
  { key: 'preferencia', label: 'Preferência' },
  { key: 'financas', label: 'Finanças' },
  { key: 'rotina', label: 'Rotina' },
  { key: 'projetos', label: 'Projetos' },
  { key: 'saude', label: 'Saúde' },
  { key: 'aprendizado', label: 'Aprendizado' },
] as const;

const UNDO_TABLES = new Set([
  'tasks', 'reminders', 'events', 'habit_completions', 'transactions', 'transfers',
  'category_budgets', 'knowledge_blocks', 'goal_entries', 'project_steps',
  'food_logs', 'water_logs', 'fasting_sessions', 'body_measurements', 'workouts',
  'workout_plan_sessions', 'cardio_sessions', 'assistant_memories',
]);

const I = { size: 16, strokeWidth: 1.5, 'aria-hidden': true } as const;

/** Compresses a chosen or pasted image client-side to a compact JPEG data URL (max 1024px) for multimodal analysis. */
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagem não suportado'));
      img.onload = () => {
        const max = 1024;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas indisponível'));
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

export interface AssistantWorkspaceProps {
  mode: 'page' | 'drawer';
  initialPrompt?: string | null;
  initialNewThread?: boolean;
  onInitialConsumed?: () => void;
  onNavigateAway?: () => void;
}

export function AssistantWorkspace({
  mode,
  initialPrompt,
  initialNewThread,
  onInitialConsumed,
  onNavigateAway,
}: AssistantWorkspaceProps) {
  const location = useLocation();
  const screenCtx = useMemo(
    () => screenContextFromLocation(location.pathname, location.search),
    [location.pathname, location.search],
  );
  const playbooks = useMemo(() => playbooksForRoute(location.pathname), [location.pathname]);

  const messages = useTable<ChatMessageRow>('chat_messages', 'id,content,is_user,created_at,metadata', { column: 'created_at' });
  const memories = useTable<MemoryRow>('assistant_memories', 'id,category,content,updated_at', { column: 'updated_at', ascending: false });

  const [activeThreadId, setActiveThreadId] = useState<string>(DEFAULT_THREAD_ID);
  const [draftThreads, setDraftThreads] = useState<{ id: string; title: string }[]>([]);
  const [drawerTab, setDrawerTab] = useState<'chat' | 'threads' | 'memories'>('chat');
  const [showMemoriesPane, setShowMemoriesPane] = useState(mode === 'page');

  const [selectedModel, setSelectedModel] = useState<string>('anthropic/claude-sonnet-4');
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);

  const [text, setText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [undone, setUndone] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<{ missingKey: boolean; message: string } | null>(null);

  const [newMemText, setNewMemText] = useState('');
  const [newMemCat, setNewMemCat] = useState<string>('preferencia');
  const [savingMem, setSavingMem] = useState(false);

  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const recRef = useRef<SpeechRec | null>(null);
  const initialFiredRef = useRef<string | null>(null);

  const threads = useMemo(() => {
    const grouped = groupThreads(messages.rows);
    const existingIds = new Set(grouped.map((t) => t.id));
    const extras = draftThreads
      .filter((d) => !existingIds.has(d.id))
      .map((d) => ({
        id: d.id,
        title: d.title,
        lastMessage: 'Nova conversa',
        updatedAt: new Date().toISOString(),
        count: 0,
        kind: 'chat' as const,
      }));
    return [...extras, ...grouped];
  }, [messages.rows, draftThreads]);

  const threadMessages = useMemo(
    () => filterThreadMessages(messages.rows, activeThreadId).slice(-120),
    [messages.rows, activeThreadId],
  );

  const currentThread = threads.find((t) => t.id === activeThreadId);
  const slashMatches = useMemo(() => matchSlashCommands(text), [text]);
  const voiceSupported = typeof window !== 'undefined' && !!getSpeechCtor();

  useEffect(() => {
    let alive = true;
    void supabase.functions.invoke('assistant', { body: { status: true } }).then(({ data }) => {
      if (!alive || !data) return;
      setAiConfigured(Boolean(data.configured));
      if (typeof data.preferred_model === 'string' && data.preferred_model) setSelectedModel(data.preferred_model);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [threadMessages.length, sending, activeThreadId]);
  useEffect(() => () => { recRef.current?.stop(); }, []);
  useEffect(() => { setSlashIndex(0); }, [slashMatches.length]);
  useLayoutEffect(() => {
    const el = box.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(144, el.scrollHeight)}px`; }
  }, [text]);

  function startNewThread() {
    const id = createThreadId();
    setDraftThreads((prev) => [{ id, title: 'Nova conversa' }, ...prev]);
    setActiveThreadId(id);
    setDrawerTab('chat');
    setError(null);
    window.setTimeout(() => box.current?.focus(), 20);
    return id;
  }

  useEffect(() => {
    if (!initialPrompt && !initialNewThread) return;
    const key = `${initialPrompt ?? ''}|${initialNewThread ? '1' : '0'}`;
    if (initialFiredRef.current === key) return;
    initialFiredRef.current = key;
    const targetThread = initialNewThread ? startNewThread() : activeThreadId;
    if (initialPrompt) {
      setDrawerTab('chat');
      void send(initialPrompt, targetThread);
    }
    onInitialConsumed?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt, initialNewThread]);

  async function changeModel(nextModel: string) {
    setSelectedModel(nextModel);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await write(supabase.from('user_settings').upsert({ user_id: user.id, assistant_model: nextModel }, { onConflict: 'user_id' }));
  }

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

  async function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const item = Array.from(e.clipboardData.items).find((it) => it.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    e.preventDefault();
    try {
      setError(null);
      setImage(await compressImage(file));
    } catch (err) {
      setError({ missingKey: false, message: (err as Error).message });
    }
  }

  function applySlash(cmd: SlashCommand) {
    if (cmd.immediate) {
      setText('');
      void send(cmd.template);
      return;
    }
    setText(`${cmd.cmd} `);
    box.current?.focus();
  }

  async function send(rawMessage: string, explicitThreadId?: string) {
    const expanded = expandSlashCommand(rawMessage);
    const attached = image;
    if ((!expanded && !attached) || sending) return;
    if (listening) { recRef.current?.stop(); setListening(false); }

    const threadId = explicitThreadId ?? (activeThreadId === AUTOMATIONS_THREAD_ID ? startNewThread() : activeThreadId);
    const existingThread = threads.find((t) => t.id === threadId);
    const threadTitle = threadId === DEFAULT_THREAD_ID
      ? 'Conversa geral'
      : existingThread && existingThread.title !== 'Nova conversa'
        ? existingThread.title
        : titleFromMessage(expanded || 'Análise de imagem');

    setText('');
    setImage(null);
    setError(null);
    setSending(true);
    setDrawerTab('chat');

    const shownText = expanded || 'Analisar imagem anexada';
    const local: ChatMessageRow = {
      id: `local-${Date.now()}`,
      content: attached ? `${shownText} [imagem anexada]` : shownText,
      is_user: true,
      created_at: new Date().toISOString(),
      metadata: { thread_id: threadId, thread_title: threadTitle },
    };
    messages.setRows((rows) => [...rows, local]);

    const { data, error: e } = await supabase.functions.invoke('assistant', {
      body: {
        message: expanded,
        thread_id: threadId,
        thread_title: threadTitle,
        context: screenCtx,
        ...(attached ? { image: attached } : {}),
      },
    });
    if (e) {
      const body = await (e as { context?: Response }).context?.json?.().catch(() => null);
      setError({ missingKey: body?.error === 'missing_key', message: body?.message ?? 'Não consegui falar com o assistente agora. Tente novamente' });
      messages.setRows((rows) => rows.filter((r) => r.id !== local.id));
      setText(rawMessage);
      setImage(attached);
    } else if (data?.saved === false) {
      messages.setRows((rows) => [...rows, {
        id: `local-${Date.now()}-a`,
        content: data.reply,
        is_user: false,
        created_at: new Date().toISOString(),
        metadata: { actions: data.actions, model: data.model, thread_id: threadId, thread_title: threadTitle },
      }]);
      setError({ missingKey: false, message: `A resposta não foi salva no histórico (${data.saveError ?? 'erro desconhecido'})` });
    } else if (data) {
      await Promise.all([messages.reload(), memories.reload()]);
      if (data.actions?.length) notifyDataChanged();
    }
    setSending(false);
  }

  async function undoAction(key: string, spec: NonNullable<ChatActionItem['undo']>) {
    if (!UNDO_TABLES.has(spec.table) || undone.has(key)) return;
    const ok = spec.op === 'delete'
      ? await write(supabase.from(spec.table).delete().eq('id', spec.id))
      : await write(supabase.from(spec.table).update(spec.patch ?? {}).eq('id', spec.id));
    if (ok) {
      setUndone((prev) => new Set(prev).add(key));
      notifyDataChanged();
      if (spec.table === 'assistant_memories') void memories.reload();
    }
  }

  async function deleteThread(threadId: string) {
    const ids = filterThreadMessages(messages.rows, threadId).map((m) => m.id);
    if (!ids.length) {
      setDraftThreads((prev) => prev.filter((d) => d.id !== threadId));
      if (activeThreadId === threadId) setActiveThreadId(DEFAULT_THREAD_ID);
      return;
    }
    if (!confirm('Apagar esta conversa? Tarefas, notas, memórias e registros criados continuam salvos.')) return;
    if (await write(supabase.from('chat_messages').delete().in('id', ids))) {
      messages.setRows((rows) => rows.filter((r) => !ids.includes(r.id)));
      setDraftThreads((prev) => prev.filter((d) => d.id !== threadId));
      if (activeThreadId === threadId) setActiveThreadId(DEFAULT_THREAD_ID);
    }
  }

  async function addMemory(e: FormEvent) {
    e.preventDefault();
    const content = newMemText.trim();
    if (!content || savingMem) return;
    setSavingMem(true);
    const ok = await write(supabase.from('assistant_memories').insert({ category: newMemCat, content, source: 'user' }));
    if (ok) {
      setNewMemText('');
      await memories.reload();
    }
    setSavingMem(false);
  }

  async function removeMemory(id: string) {
    memories.setRows((rows) => rows.filter((m) => m.id !== id));
    await write(supabase.from('assistant_memories').delete().eq('id', id));
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (slashMatches.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIndex((i) => (i + 1) % slashMatches.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIndex((i) => (i - 1 + slashMatches.length) % slashMatches.length); return; }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing)) {
        e.preventDefault();
        applySlash(slashMatches[slashIndex] ?? slashMatches[0]);
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); setText(''); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(text);
    }
  }

  const threadsList = (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-fg2">Conversas</span>
        <button
          type="button"
          onClick={startNewThread}
          className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-line bg-raised px-2 text-xs font-medium text-fg transition-colors duration-150 hover:border-line-strong"
        >
          <MessageSquarePlus size={14} strokeWidth={1.5} aria-hidden="true" />
          <span>Nova</span>
        </button>
      </div>
      <ul className="flex-1 space-y-1 overflow-y-auto">
        {threads.length === 0 && (
          <li className="rounded-[8px] border border-line bg-sunken/60 px-3 py-2 text-xs text-fg3">
            Nenhuma conversa salva ainda
          </li>
        )}
        {threads.map((t) => {
          const active = t.id === activeThreadId;
          return (
            <li key={t.id} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => { setActiveThreadId(t.id); setDrawerTab('chat'); }}
                className={`flex min-w-0 flex-1 flex-col rounded-[8px] px-3 py-2 text-left transition-colors duration-150 ${
                  active ? 'border border-line-strong bg-raised text-fg' : 'text-fg2 hover:bg-raised/60 hover:text-fg'
                }`}
              >
                <div className="flex w-full items-center gap-2">
                  {t.kind === 'automation'
                    ? <Workflow size={14} strokeWidth={1.5} className="shrink-0 text-fg3" aria-hidden="true" />
                    : <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? 'bg-brand' : 'bg-fg3/40'}`} aria-hidden="true" />}
                  <span className="mr-auto truncate text-xs font-medium">{t.title}</span>
                  <span className="figure shrink-0 text-[11px] text-fg3">{t.count}</span>
                </div>
                <span className="mt-1 w-full truncate text-xs text-fg3">{t.lastMessage}</span>
              </button>
              {t.count > 0 && (
                <button
                  type="button"
                  onClick={() => void deleteThread(t.id)}
                  className="icon-btn h-7 w-7 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus:opacity-100"
                  aria-label={`Apagar conversa ${t.title}`}
                  title="Apagar conversa"
                >
                  <Trash2 size={14} strokeWidth={1.5} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );

  const memoriesPanel = (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Brain {...I} className="text-fg3" />
          <span className="text-xs font-medium text-fg2">Memória do Assistente</span>
        </div>
        <span className="figure text-xs text-fg3">{memories.rows.length}</span>
      </div>
      <p className="mb-3 text-xs leading-4 text-fg3">
        Regras e preferências usadas automaticamente em todas as conversas
      </p>
      <form onSubmit={(e) => void addMemory(e)} className="mb-4 space-y-2">
        <input
          type="text"
          value={newMemText}
          onChange={(e) => setNewMemText(e.target.value)}
          placeholder="Ex.: Gastos em euro vão na Revolut"
          className="input h-8 w-full text-xs"
          maxLength={300}
        />
        <div className="flex gap-2">
          <select
            value={newMemCat}
            onChange={(e) => setNewMemCat(e.target.value)}
            aria-label="Categoria da memória"
            className="input h-8 flex-1 px-2 text-xs"
          >
            {MEMORY_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <button
            type="submit"
            disabled={savingMem || !newMemText.trim()}
            className="btn-secondary h-8 shrink-0 px-3 text-xs"
          >
            <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
            <span>Salvar</span>
          </button>
        </div>
      </form>
      <ul className="flex-1 space-y-2 overflow-y-auto">
        {memories.loading && <ListSkeleton rows={2} />}
        {!memories.loading && memories.rows.length === 0 && (
          <li className="rounded-[8px] border border-line bg-sunken/60 p-3 text-xs text-fg3">
            Nenhuma regra salva ainda. Adicione acima ou diga no chat: &ldquo;/memoria …&rdquo;
          </li>
        )}
        {memories.rows.map((m) => (
          <li key={m.id} className="group flex items-start gap-2 rounded-[8px] border border-line bg-sunken/60 p-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-fg3">
                {MEMORY_CATEGORIES.find((c) => c.key === m.category)?.label ?? m.category}
              </div>
              <p className="mt-1 text-xs leading-4 text-fg">{m.content}</p>
            </div>
            <button
              type="button"
              onClick={() => void removeMemory(m.id)}
              className="icon-btn h-6 w-6 shrink-0 opacity-60 hover:opacity-100"
              aria-label={`Remover memória: ${m.content}`}
            >
              <X size={13} strokeWidth={1.5} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  let lastDay = '';

  const chatArea = (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Top toolbar inside workspace: model selector + status + contextual playbooks */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <div className="mr-auto flex min-w-0 items-center gap-2">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${aiConfigured === false ? 'bg-warning' : 'bg-positive'}`}
            aria-hidden="true"
          />
          <span className="truncate text-xs font-medium text-fg">
            {currentThread?.title ?? 'Conversa geral'}
          </span>
          {mode === 'drawer' && (
            <span className="rounded-[4px] border border-line bg-sunken px-1.5 py-0.5 text-[11px] text-fg3">
              {screenCtx.label}
            </span>
          )}
        </div>

        <select
          value={selectedModel}
          onChange={(e) => void changeModel(e.target.value)}
          aria-label="Modelo de IA"
          className="h-7 rounded-[6px] border border-line bg-sunken px-2 text-xs text-fg2 outline-none transition-colors duration-150 hover:border-line-strong hover:text-fg"
        >
          {AI_MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>

        {mode === 'page' && (
          <button
            type="button"
            onClick={() => setShowMemoriesPane((v) => !v)}
            className={`hidden h-7 items-center gap-1.5 rounded-[6px] border px-2 text-xs transition-colors duration-150 xl:inline-flex ${
              showMemoriesPane ? 'border-line-strong bg-raised text-fg' : 'border-line bg-sunken text-fg3 hover:text-fg'
            }`}
          >
            <Brain size={14} strokeWidth={1.5} aria-hidden="true" />
            <span>Memórias</span>
            <span className="figure text-[11px] text-fg3">{memories.rows.length}</span>
          </button>
        )}

        {threadMessages.length > 0 && (
          <button
            type="button"
            onClick={() => void deleteThread(activeThreadId)}
            className="icon-btn h-7 w-7"
            title="Apagar esta conversa"
            aria-label="Apagar esta conversa"
          >
            <Trash2 size={14} strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Messages log */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5" role="log" aria-live="polite">
        {messages.loading && <ListSkeleton rows={3} />}
        {!messages.loading && threadMessages.length === 0 && (
          <div className="mx-auto max-w-xl py-4">
            <Empty icon={<Bot size={18} strokeWidth={1.5} />}>
              Crie planos de etapas em projetos, lance gastos em EUR/BRL, transfira entre contas, registre treinos ou envie foto de recibo e refeição
            </Empty>
            <div className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="Ações rápidas">
              {playbooks.map((pb) => (
                <button
                  key={pb.id}
                  type="button"
                  onClick={() => void send(pb.prompt)}
                  className="flex items-center justify-between gap-2 rounded-[10px] border border-line bg-sunken/70 px-3 py-2.5 text-left text-xs font-medium text-fg2 transition-colors duration-150 hover:border-line-strong hover:bg-raised hover:text-fg"
                >
                  <span className="truncate">{pb.label}</span>
                  <ArrowUpRight size={14} strokeWidth={1.5} className="shrink-0 text-fg3" aria-hidden="true" />
                </button>
              ))}
            </div>
            <p className="mt-4 text-center text-xs text-fg3">
              Dica: digite <kbd className="rounded-[4px] border border-line bg-raised px-1.5 py-0.5 font-mono text-[11px]">/</kbd> para ver comandos rápidos ou cole uma imagem com <kbd className="rounded-[4px] border border-line bg-raised px-1.5 py-0.5 font-mono text-[11px]">Ctrl+V</kbd>
            </p>
          </div>
        )}

        <ol className="mx-auto max-w-3xl space-y-4">
          {threadMessages.map((m) => {
            const day = toDay(new Date(m.created_at));
            const divider = day !== lastDay;
            lastDay = day;
            return (
              <li key={m.id}>
                {divider && <div className="my-4 text-center text-xs text-fg3">{day === toDay(new Date()) ? 'Hoje' : sentence(formatDay(day))}</div>}
                <Bubble m={m} undone={undone} onUndo={undoAction} onNavigate={onNavigateAway} />
              </li>
            );
          })}
          {sending && (
            <li className="flex items-center gap-2 text-xs text-fg3" aria-label="O assistente está respondendo">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
              <span>Consultando dados e executando ações…</span>
            </li>
          )}
        </ol>
        <div ref={end} />
      </div>

      {/* Error banner */}
      {error && (
        <div className={`mx-4 mb-3 flex items-start gap-2 rounded-[8px] border px-3 py-2 text-xs ${error.missingKey ? 'border-warning/40 text-fg2' : 'border-negative/40 text-negative'}`} role="alert">
          {error.missingKey && <KeyRound size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-warning" />}
          <span>{error.message}</span>
        </div>
      )}

      {/* Compact playbook strip when conversation already has messages */}
      {threadMessages.length > 0 && !sending && slashMatches.length === 0 && (
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-2 tabs-scroll" aria-label="Ações rápidas">
          {playbooks.map((pb) => (
            <button
              key={pb.id}
              type="button"
              onClick={() => void send(pb.prompt)}
              className="shrink-0 rounded-[6px] border border-line bg-sunken px-2.5 py-1 text-xs text-fg3 transition-colors duration-150 hover:border-line-strong hover:text-fg"
            >
              {pb.label}
            </button>
          ))}
        </div>
      )}

      {/* Image preview */}
      {image && (
        <div className="mx-4 mb-2 flex items-center gap-3 rounded-[8px] border border-line bg-sunken p-2">
          <img src={image} alt="Prévia da imagem anexada" className="h-10 w-10 rounded-[6px] object-cover" />
          <span className="mr-auto text-xs text-fg2">Imagem pronta para leitura (recibo, prato ou anotação)</span>
          <button type="button" className="icon-btn h-7 w-7" onClick={() => setImage(null)} aria-label="Remover imagem">
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
      )}

      {/* Slash command autocomplete popup */}
      {slashMatches.length > 0 && (
        <div className="mx-4 mb-2 overflow-hidden rounded-[10px] border border-line-strong bg-surface" role="listbox" aria-label="Comandos rápidos">
          {slashMatches.map((cmd, idx) => (
            <button
              key={cmd.cmd}
              type="button"
              role="option"
              aria-selected={idx === slashIndex}
              onMouseEnter={() => setSlashIndex(idx)}
              onClick={() => applySlash(cmd)}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left text-xs transition-colors duration-150 ${
                idx === slashIndex ? 'bg-raised text-fg' : 'text-fg2 hover:bg-raised/60'
              }`}
            >
              <span className="w-24 shrink-0 font-mono font-medium text-brand-ink">{cmd.cmd}</span>
              <span className="shrink-0 font-medium text-fg">{cmd.label}</span>
              <span className="min-w-0 flex-1 truncate text-right text-fg3 hidden sm:inline">{cmd.description}</span>
            </button>
          ))}
        </div>
      )}

      {/* Composer */}
      <form className="flex items-end gap-2 border-t border-line p-3" onSubmit={(e: FormEvent) => { e.preventDefault(); void send(text); }}>
        <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => void onPickImage(e)} />
        <button
          type="button"
          className="icon-btn shrink-0"
          onClick={() => fileInput.current?.click()}
          disabled={sending}
          title="Anexar foto de recibo ou prato"
          aria-label="Anexar foto"
        >
          <ImagePlus {...I} />
        </button>
        {voiceSupported && (
          <button
            type="button"
            className={`icon-btn shrink-0 ${listening ? 'bg-negative/15 text-negative' : ''}`}
            onClick={toggleVoice}
            disabled={sending}
            title={listening ? 'Parar ditado' : 'Ditar por voz'}
            aria-label={listening ? 'Parar ditado por voz' : 'Ditar por voz'}
            aria-pressed={listening}
          >
            {listening ? <MicOff {...I} /> : <Mic {...I} />}
          </button>
        )}
        <textarea
          ref={box}
          rows={1}
          className="input max-h-36 min-h-9 flex-1 resize-none py-2"
          placeholder={listening ? 'Ouvindo… fale seu pedido' : 'Escreva um pedido ou digite / para comandos'}
          aria-label="Mensagem para o assistente"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onPaste={(e) => void onPaste(e)}
          maxLength={4000}
        />
        <button
          type="submit"
          className="btn-primary h-9 w-9 shrink-0 justify-center p-0"
          disabled={sending || (!text.trim() && !image)}
          aria-label="Enviar"
        >
          <ArrowUp {...I} />
        </button>
      </form>
    </div>
  );

  if (mode === 'drawer') {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-1 border-b border-line px-4 py-2">
          <div className="segmented" role="tablist" aria-label="Visão do assistente">
            <button type="button" role="tab" aria-selected={drawerTab === 'chat'} className={drawerTab === 'chat' ? 'tab-active' : 'tab'} onClick={() => setDrawerTab('chat')}>Chat</button>
            <button type="button" role="tab" aria-selected={drawerTab === 'threads'} className={drawerTab === 'threads' ? 'tab-active' : 'tab'} onClick={() => setDrawerTab('threads')}>Conversas</button>
            <button type="button" role="tab" aria-selected={drawerTab === 'memories'} className={drawerTab === 'memories' ? 'tab-active' : 'tab'} onClick={() => setDrawerTab('memories')}>Memórias ({memories.rows.length})</button>
          </div>
          <button
            type="button"
            onClick={startNewThread}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-line bg-surface px-2.5 text-xs font-medium text-fg2 transition-colors duration-150 hover:border-line-strong hover:text-fg"
            title="Nova conversa"
          >
            <MessageSquarePlus size={14} strokeWidth={1.5} aria-hidden="true" />
            <span>Nova</span>
          </button>
        </div>
        {drawerTab === 'chat' && chatArea}
        {drawerTab === 'threads' && <div className="min-h-0 flex-1 p-4">{threadsList}</div>}
        {drawerTab === 'memories' && <div className="min-h-0 flex-1 p-4">{memoriesPanel}</div>}
      </div>
    );
  }

  // Full page mode: 3-column desktop workspace (Threads | Chat | Memories)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Mobile switcher for page mode */}
      <div className="mb-4 flex items-center gap-2 lg:hidden">
        <div className="segmented" role="tablist" aria-label="Visão do assistente">
          <button type="button" role="tab" aria-selected={drawerTab === 'chat'} className={drawerTab === 'chat' ? 'tab-active' : 'tab'} onClick={() => setDrawerTab('chat')}>Chat</button>
          <button type="button" role="tab" aria-selected={drawerTab === 'threads'} className={drawerTab === 'threads' ? 'tab-active' : 'tab'} onClick={() => setDrawerTab('threads')}>Conversas</button>
          <button type="button" role="tab" aria-selected={drawerTab === 'memories'} className={drawerTab === 'memories' ? 'tab-active' : 'tab'} onClick={() => setDrawerTab('memories')}>Memórias</button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-12">
        <aside className={`card min-h-0 flex-col p-4 lg:col-span-3 ${drawerTab === 'threads' ? 'flex' : 'hidden lg:flex'}`}>
          {threadsList}
        </aside>

        <section
          className={`card min-h-0 flex-col p-0 ${showMemoriesPane ? 'lg:col-span-9 xl:col-span-6' : 'lg:col-span-9'} ${drawerTab === 'chat' ? 'flex' : 'hidden lg:flex'}`}
          aria-label="Conversa"
        >
          {chatArea}
        </section>

        {showMemoriesPane && (
          <aside className={`card min-h-0 flex-col p-4 xl:col-span-3 ${drawerTab === 'memories' ? 'flex' : 'hidden xl:flex'}`}>
            {memoriesPanel}
          </aside>
        )}
      </div>
    </div>
  );
}

function Bubble({
  m,
  undone,
  onUndo,
  onNavigate,
}: {
  m: ChatMessageRow;
  undone: Set<string>;
  onUndo: (key: string, spec: NonNullable<ChatActionItem['undo']>) => void;
  onNavigate?: () => void;
}) {
  const time = formatTime(m.created_at);
  if (m.is_user) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-[12px] rounded-br-[4px] border border-line bg-raised px-4 py-2.5 text-sm leading-6 whitespace-pre-wrap text-fg">
          {m.content}
          <div className="figure mt-1 text-right text-[11px] text-fg3">{time}</div>
        </div>
      </div>
    );
  }
  const briefing = m.metadata?.kind === 'briefing';
  const auto = m.metadata?.kind === 'automation';
  const modelName = m.metadata?.model ? modelLabel(m.metadata.model) : null;
  return (
    <div className={`max-w-[94%] ${briefing || auto ? 'rounded-[12px] border border-line bg-sunken/70 px-4 py-3' : ''}`}>
      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-fg3">
        {briefing
          ? <Sunrise size={14} strokeWidth={1.5} className="text-brand-ink" aria-hidden="true" />
          : auto
            ? <Workflow size={14} strokeWidth={1.5} className="text-brand-ink" aria-hidden="true" />
            : <Bot size={14} strokeWidth={1.5} aria-hidden="true" />}
        <span>{briefing ? 'Resumo do dia · Piloto automático' : auto ? `Piloto automático · ${m.metadata?.title ?? 'pedido à IA'}` : modelName ?? 'Assistente'}</span>
        <span className="figure">· {time}</span>
      </div>
      <Rich text={m.content} />
      {!!m.metadata?.actions?.length && (
        <ul className="mt-3 space-y-1.5" aria-label="Ações executadas">
          {m.metadata.actions.map((a, i) => {
            const key = `${m.id}:${i}`;
            const isUndone = undone.has(key);
            const link = actionLinkOf(a);
            return (
              <li
                key={key}
                className={`flex flex-wrap items-center gap-2 rounded-[8px] border px-3 py-2 text-xs ${
                  isUndone ? 'border-line bg-sunken text-fg3 line-through' : 'border-line bg-sunken/80 text-fg'
                }`}
              >
                <CheckCircle2 size={14} strokeWidth={1.5} className={isUndone ? 'shrink-0 text-fg3' : 'shrink-0 text-positive'} aria-hidden="true" />
                <span className="mr-auto min-w-0">{a.summary}</span>
                {link && !isUndone && (
                  <Link
                    to={link}
                    onClick={onNavigate}
                    className="inline-flex items-center gap-1 rounded-[6px] border border-line bg-surface px-2 py-0.5 text-xs font-medium text-fg2 transition-colors duration-150 hover:border-line-strong hover:text-fg"
                  >
                    <span>Abrir</span>
                    <ArrowUpRight size={12} strokeWidth={1.5} aria-hidden="true" />
                  </Link>
                )}
                {a.undo && !isUndone && (
                  <button
                    type="button"
                    onClick={() => onUndo(key, a.undo!)}
                    className="inline-flex items-center gap-1 rounded-[6px] border border-line bg-surface px-2 py-0.5 text-xs text-fg3 transition-colors duration-150 hover:border-line-strong hover:text-fg"
                    aria-label={`Desfazer: ${a.summary}`}
                  >
                    <RotateCcw size={12} strokeWidth={1.5} aria-hidden="true" />
                    <span>Desfazer</span>
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
  return <>{spans.map((s, i) => (s.code ? <code key={i} className="rounded-[4px] bg-raised px-1 font-mono text-xs">{s.text}</code> : s.bold ? <strong key={i} className="font-medium text-fg">{s.text}</strong> : <span key={i}>{s.text}</span>))}</>;
}

function Rich({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm leading-6 text-fg">
      {pieces(text).map((p, i) => {
        if (p.kind === 'h') return <div key={i} className="font-medium text-fg"><Line spans={p.spans} /></div>;
        if (p.kind === 'p') return <p key={i} className="whitespace-pre-wrap"><Line spans={p.spans} /></p>;
        const Tag = p.kind;
        return <Tag key={i} className={`space-y-1 pl-5 ${p.kind === 'ul' ? 'list-disc' : 'list-decimal'} marker:text-fg3`}>{p.items.map((it, k) => <li key={k}><Line spans={it} /></li>)}</Tag>;
      })}
    </div>
  );
}
