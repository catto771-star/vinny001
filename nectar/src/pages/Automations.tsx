import { useState, type FormEvent } from 'react';
import { Bell, Bot, CheckSquare, Play, Plus, Sunrise, Workflow } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTable, write } from '../lib/useTable';
import { ACTION_LABEL, PRESETS, nextRun, runTimeText, scheduleText, type Action, type Automation, type Run } from '../lib/automations';
import { Empty, Field, FieldGroup, ListSkeleton, Modal, PageHeader, WeekdayPicker } from '../components/ui';

const TABS = ['Automações', 'Histórico'] as const;
type Tab = (typeof TABS)[number];
const ICON: Record<Action, typeof Bot> = { briefing: Sunrise, task: CheckSquare, reminder: Bell, ai: Bot };
const STATUS: Record<Run['status'], { label: string; tone: string }> = {
  ok: { label: 'Feito', tone: 'text-positive' }, waiting_ai: { label: 'Na fila da IA', tone: 'text-brand-ink' },
  running: { label: 'A IA está respondendo', tone: 'text-brand-ink' }, error: { label: 'Erro', tone: 'text-negative' },
};

const when = runTimeText;

export default function Automations() {
  const [tab, setTab] = useState<Tab>('Automações');
  const automations = useTable<Automation>('automations', '*', { column: 'time_of_day' });
  const runs = useTable<Run>('automation_runs', 'id,automation_id,ran_at,status,output', { column: 'ran_at', ascending: false });
  const [editing, setEditing] = useState<Partial<Automation> | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const now = new Date();
  const titleOf = (id: string) => automations.rows.find((a) => a.id === id)?.title ?? 'Automação excluída';

  async function toggle(a: Automation) {
    automations.setRows((rows) => rows.map((x) => (x.id === a.id ? { ...x, is_active: !a.is_active } : x)));
    await write(supabase.from('automations').update({ is_active: !a.is_active }).eq('id', a.id));
  }
  async function runNow(a: Automation) {
    setRunning(a.id);
    const { error } = await supabase.rpc('run_automation_now', { p_id: a.id });
    if (error) alert(`Não foi possível rodar: ${error.message}`);
    else if (a.action === 'ai') {
      // The request waits for the AI: show it waiting, then ask the assistant to answer now.
      await runs.reload();
      await supabase.functions.invoke('assistant', { body: { process_runs: true } });
    }
    await Promise.all([runs.reload(), automations.reload()]);
    setRunning(null);
  }

  return (
    <>
      <PageHeader
        title="Piloto automático" subtitle={`O que o app faz sozinho, nos dias e horários que você escolher · ${automations.rows.filter((a) => a.is_active).length} ativas`}
        tabs={TABS} tab={tab} onTab={(t) => setTab(t as Tab)}
        action={<button className="btn-primary" onClick={() => setEditing({})}><Plus size={16} strokeWidth={1.5} />Nova automação</button>}
      />
      {automations.error && <p className="mb-4 text-sm text-negative">{automations.error}</p>}
      {automations.loading ? <ListSkeleton rows={3} /> : tab === 'Automações' ? (
        <>
          {automations.rows.length === 0 && (
            <div className="card mb-6"><Empty icon={<Workflow size={18} strokeWidth={1.5} />}>Nenhuma automação ainda. Comece por uma das sugestões abaixo.</Empty></div>
          )}
          <ul className="grid gap-4 md:grid-cols-2">
            {automations.rows.map((a) => {
              const Icon = ICON[a.action];
              const next = nextRun(a, now);
              const last = runs.rows.find((r) => r.automation_id === a.id);
              return (
                <li key={a.id} className={`card flex flex-col ${a.is_active ? '' : 'opacity-70'}`}>
                  <div className="mb-2 flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-raised text-fg2"><Icon size={18} strokeWidth={1.5} /></span>
                    <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(a)}>
                      <div className="truncate font-medium hover:underline">{a.title}</div>
                      <div className="text-xs text-fg3">{ACTION_LABEL[a.action]} · {scheduleText(a)}</div>
                    </button>
                    <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                      <input type="checkbox" role="switch" className="peer sr-only" checked={a.is_active} onChange={() => toggle(a)} aria-label={`Ativar ${a.title}`} />
                      <span className="h-7 w-12 rounded-full bg-sunken transition-colors duration-300 ease-out peer-checked:bg-primary peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brand" />
                      <span className="absolute left-1 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] peer-checked:translate-x-5" />
                    </label>
                  </div>
                  {a.prompt && a.action !== 'briefing' && <p className="mb-2 line-clamp-2 text-sm text-fg2">{a.prompt}</p>}
                  {last && (
                    <div className="mb-3 rounded-lg bg-raised/60 px-3 py-2 text-xs">
                      <span className={STATUS[last.status].tone}>{STATUS[last.status].label}</span>
                      <span className="text-fg3"> · {when(new Date(last.ran_at), now)}</span>
                      <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-fg2">{last.output}</p>
                    </div>
                  )}
                  <div className="mt-auto flex items-center gap-2 text-xs text-fg3">
                    <span className="mr-auto">{next ? `Próxima: ${when(next, now)}` : 'Pausada'}</span>
                    <button className="btn-ghost h-8 text-sm" disabled={running === a.id} onClick={() => runNow(a)}><Play size={14} strokeWidth={1.5} />{running === a.id ? 'Rodando…' : 'Rodar agora'}</button>
                  </div>
                </li>
              );
            })}
          </ul>
          <section className="mt-8" aria-label="Sugestões">
            <div className="label mb-3">Sugestões</div>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {PRESETS.map((p) => {
                const Icon = ICON[p.action];
                return (
                  <li key={p.title}>
                    <button className="card flex w-full items-center gap-3 p-3 text-left hover:border-line-strong" onClick={() => setEditing(p)}>
                      <Icon size={16} strokeWidth={1.5} className="shrink-0 text-fg3" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{p.title}</span>
                        <span className="block text-xs text-fg3">{scheduleText(p)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      ) : (
        <section className="card" aria-label="Histórico de execuções">
          {runs.rows.length === 0 && <Empty icon={<Workflow size={18} strokeWidth={1.5} />}>Nenhuma execução ainda</Empty>}
          <ul className="divide-y divide-line">
            {runs.rows.slice(0, 100).map((r) => (
              <li key={r.id} className="py-3">
                <div className="mb-1 flex flex-wrap items-baseline gap-2 text-sm">
                  <span className="mr-auto font-medium">{titleOf(r.automation_id)}</span>
                  <span className={`text-xs ${STATUS[r.status].tone}`}>{STATUS[r.status].label}</span>
                  <span className="text-xs text-fg3">{when(new Date(r.ran_at), now)}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap text-fg2">{r.output}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {editing && (
        <AutomationForm automation={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void automations.reload(); }}
          onDeleted={(id) => { setEditing(null); automations.setRows((rows) => rows.filter((a) => a.id !== id)); }} />
      )}
    </>
  );
}

function AutomationForm({ automation, onClose, onSaved, onDeleted }: {
  automation: Partial<Automation>; onClose: () => void; onSaved: () => void; onDeleted: (id: string) => void;
}) {
  const [title, setTitle] = useState(automation.title ?? '');
  const [action, setAction] = useState<Action>(automation.action ?? 'briefing');
  const [prompt, setPrompt] = useState(automation.prompt ?? '');
  const [priority, setPriority] = useState(automation.payload?.priority ?? 'medium');
  const [days, setDays] = useState<number[]>(automation.weekdays ?? []);
  const [time, setTime] = useState(automation.time_of_day?.slice(0, 5) ?? '07:00');

  async function save(e: FormEvent) {
    e.preventDefault();
    const row = { title, action, prompt: action === 'briefing' ? '' : prompt, payload: action === 'task' ? { priority } : {}, weekdays: days, time_of_day: time };
    const ok = automation.id
      ? await write(supabase.from('automations').update(row).eq('id', automation.id))
      : await write(supabase.from('automations').insert(row));
    if (ok) onSaved();
  }
  async function remove() {
    if (automation.id && confirm('Excluir esta automação e o histórico dela?') && await write(supabase.from('automations').delete().eq('id', automation.id))) onDeleted(automation.id);
  }

  return (
    <Modal title={automation.id ? 'Editar automação' : 'Nova automação'} onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Nome"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus /></Field>
        <Field label="O que fazer">
          <select className="input" value={action} onChange={(e) => setAction(e.target.value as Action)}>
            <option value="briefing">Resumo do dia (tarefas, lembretes, hábitos e contas)</option>
            <option value="task">Criar uma tarefa</option>
            <option value="reminder">Criar um lembrete</option>
            <option value="ai">Pedido à IA</option>
          </select>
        </Field>
        {action === 'task' && (
          <div className="grid grid-cols-[1fr_120px] gap-2">
            <Field label="Título da tarefa"><input className="input" value={prompt} onChange={(e) => setPrompt(e.target.value)} required /></Field>
            <Field label="Prioridade">
              <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}>
                <option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option>
              </select>
            </Field>
          </div>
        )}
        {action === 'reminder' && <Field label="Texto do lembrete"><input className="input" value={prompt} onChange={(e) => setPrompt(e.target.value)} required /></Field>}
        {action === 'ai' && (
          <>
            <Field label="Pedido"><textarea className="input" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} required /></Field>
            <p className="-mt-2 mb-4 text-xs text-fg3">A IA responde no horário, com acesso aos seus dados (pode criar tarefas, lembretes etc.). A resposta aparece no Assistente e no histórico.</p>
          </>
        )}
        {action === 'briefing' && <p className="-mt-2 mb-4 text-xs text-fg3">O resumo aparece no histórico e, depois, no chat do assistente.</p>}
        <FieldGroup label="Dias (nenhum = todo dia)"><WeekdayPicker value={days} onChange={setDays} /></FieldGroup>
        <Field label="Horário"><input className="input w-32" type="time" value={time} onChange={(e) => setTime(e.target.value)} required /></Field>
        <div className="flex gap-2">
          {automation.id && <button type="button" className="btn-ghost text-negative" onClick={remove}>Excluir</button>}
          <button className="btn-primary ml-auto">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}
