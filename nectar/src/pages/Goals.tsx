import { useState, type FormEvent } from 'react';
import { Check, CheckCircle2, Pause, Play, Plus, Target, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTable, write } from '../lib/useTable';
import { formatDay, sentence, toDay } from '../lib/dates';
import { num, plural } from '../lib/format';
import { CURRENCIES, formatIn, symbolOf, type Currency } from '../lib/money';
import { bankBalance, type Bank, type InvoicePayment, type Transfer, type Tx } from '../lib/finance';
import type { Habit, HabitCompletion } from '../lib/habits';
import { projectProgress } from '../lib/projects';
import {
  PACE_LABEL, TYPE_LABEL, currentValue, goalCurrency, goalPace, goalProgress, goalSeries, linkedBankIdsOf,
  sumLinkedAccountsInGoalCurrency, targetOf,
  type Goal, type GoalEntry, type GoalStatus, type GoalType, type Pace,
} from '../lib/goals';
import { AreaChart, ProgressRing } from '../components/Charts';
import { Empty, Field, FieldGroup, ListSkeleton, Modal, PageHeader, Stat } from '../components/ui';
import { useProjects } from './projects/useProjects';
import { useRates } from './finance/useRates';

const TABS = ['Ativas', 'Pausadas', 'Concluídas'] as const;
type Tab = (typeof TABS)[number];
const TAB_STATUS: Record<Tab, GoalStatus> = { Ativas: 'active', Pausadas: 'paused', Concluídas: 'completed' };
export const PACE_TONE: Record<Pace, string> = { done: 'text-positive', ahead: 'text-positive', on: 'text-fg2', behind: 'text-warning', late: 'text-negative', open: 'text-fg3' };
const PACE_BADGE: Record<Pace, string> = {
  done: 'bg-positive/12 text-positive',
  ahead: 'bg-positive/12 text-positive',
  on: 'bg-raised text-fg2',
  behind: 'bg-warning/12 text-warning',
  late: 'bg-negative/12 text-negative',
  open: 'bg-raised text-fg3',
};
const short = (day: string) => `${Number(day.slice(8))}/${day.slice(5, 7)}`;

/** A value in the goal's unit: money in its chosen currency, a project as %. */
function fmt(goal: Goal, n: number | null): string {
  if (n == null) return '—';
  if (goal.goal_type === 'financial') return formatIn(n, goalCurrency(goal));
  if (goal.goal_type === 'project') return `${Math.round(n)}%`;
  if (goal.goal_type === 'habit') return `${num(n, 0)} ${plural(n, 'vez', 'vezes')}`;
  return `${num(n)}${goal.unit ? ` ${goal.unit}` : ''}`;
}

export default function Goals() {
  const [tab, setTab] = useState<Tab>('Ativas');
  const goals = useTable<Goal>('goals', '*', { column: 'created_at' });
  const entries = useTable<GoalEntry>('goal_entries', '*', { column: 'date' });
  const habits = useTable<Habit>('habits');
  const completions = useTable<HabitCompletion>('habit_completions', 'id,habit_id,completed_date,value');
  const banks = useTable<Bank>('banks');
  const txs = useTable<Tx>('transactions');
  const transfers = useTable<Transfer>('transfers');
  const payments = useTable<InvoicePayment>('card_invoice_payments');
  const projects = useProjects();
  const fx = useRates(null); // today's rates value euro and dollar accounts and multi-currency goals
  const [editing, setEditing] = useState<Partial<Goal> | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const today = toDay(new Date());

  const bankById = new Map(banks.rows.map((b) => [b.id, b]));
  const balanceBrlOf = (id: string) => {
    const bank = bankById.get(id);
    return bank ? bankBalance(bank, txs.rows, transfers.rows, payments.rows) : 0;
  };

  const valueOf = (g: Goal) => currentValue(g, {
    entries: entries.rows, habits: habits.rows, completions: completions.rows,
    projectPct: g.linked_project_id ? projectProgress(projects.tasksOf(g.linked_project_id), projects.stepsOf(g.linked_project_id)).pct : undefined,
    bankBalance: sumLinkedAccountsInGoalCurrency(g, banks.rows, balanceBrlOf, fx.rates),
  });
  const rows = goals.rows.map((g) => {
    const current = valueOf(g);
    return { g, current, progress: goalProgress(g, current), ...goalPace(g, current, today) };
  });
  const shown = rows.filter((r) => r.g.status === TAB_STATUS[tab]);
  const active = rows.filter((r) => r.g.status === 'active');
  const linkName = (g: Goal) => {
    if (g.goal_type === 'habit') return habits.rows.find((h) => h.id === g.linked_habit_id)?.name;
    if (g.goal_type === 'project') return projects.projects.rows.find((p) => p.id === g.linked_project_id)?.name;
    if (g.goal_type === 'financial') {
      const names = linkedBankIdsOf(g).map((id) => bankById.get(id)?.name).filter((x): x is string => !!x);
      return names.length ? names.join(' + ') : 'aportes';
    }
    return undefined;
  };
  const open = rows.find((r) => r.g.id === openId);

  async function setStatus(g: Goal, status: GoalStatus) {
    goals.setRows((list) => list.map((x) => (x.id === g.id ? { ...x, status } : x)));
    await write(supabase.from('goals').update({ status }).eq('id', g.id));
  }

  return (
    <>
      <PageHeader
        title="Metas" subtitle={`${active.length} ${plural(active.length, 'ativa', 'ativas')}`} tabs={TABS} tab={tab} onTab={(t) => setTab(t as Tab)}
        action={<button className="btn-primary" onClick={() => setEditing({})}><Plus size={16} strokeWidth={1.5} />Nova meta</button>}
      />
      {goals.error && <p className="mb-4 text-sm text-negative">{goals.error}</p>}
      {goals.loading ? <ListSkeleton rows={3} /> : (
        <>
          {tab === 'Ativas' && (
            <div className="card mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Ativas" value={active.length} accent />
              <Stat label="No ritmo ou adiantadas" value={active.filter((r) => r.pace === 'on' || r.pace === 'ahead' || r.pace === 'done').length} />
              <Stat label="Atrasadas" value={active.filter((r) => r.pace === 'behind' || r.pace === 'late').length} />
              <Stat label="Concluídas" value={rows.filter((r) => r.g.status === 'completed').length} hint="no total" />
            </div>
          )}
          {shown.length === 0 && (
            <div className="card"><Empty icon={<Target size={18} strokeWidth={1.5} />} action={tab === 'Ativas' ? <button className="btn-secondary" onClick={() => setEditing({})}>Nova meta</button> : undefined}>
              {tab === 'Ativas' ? 'Nenhuma meta ativa' : `Nenhuma meta ${tab.toLowerCase().replace(/s$/, '')}`}
            </Empty></div>
          )}
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shown.map(({ g, current, progress, pace, expected, daysLeft, perWeek, projected }) => (
              <li key={g.id} className="min-w-0">
                <button type="button" className="card glow flex h-full w-full min-w-0 flex-col text-left" onClick={() => setOpenId(g.id)}>
                  <div className="mb-2 flex w-full min-w-0 items-center gap-2 text-xs text-fg3">
                    <span className="mr-auto min-w-0 truncate">{TYPE_LABEL[g.goal_type]}{linkName(g) ? ` · ${linkName(g)}` : ''}</span>
                    <span className={`badge ${PACE_BADGE[pace]}`}>{PACE_LABEL[pace]}</span>
                  </div>
                  <div className="mb-3 flex items-center gap-3.5">
                    <ProgressRing
                      pct={progress * 100}
                      size={52}
                      strokeWidth={4.5}
                      tone={pace === 'done' || pace === 'ahead' ? 'var(--positive)' : pace === 'late' ? 'var(--negative)' : 'var(--brand)'}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{g.title}</div>
                      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
                        <span className="figure text-lg font-semibold">{fmt(g, current)}</span>
                        <span className="figure text-xs text-fg3">de {fmt(g, targetOf(g))}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-auto">
                    <ProgressBar progress={progress} expected={expected} label={g.title} />
                    <div className="mt-2 text-xs text-fg3">
                      {pace === 'done' ? (g.status === 'completed' ? 'Concluída' : 'Meta batida: marque como concluída')
                        : daysLeft == null ? (projected ? `Nesse ritmo, chega lá em ${short(projected)}` : '\u00a0') : daysLeft < 0 ? `Venceu em ${short(g.target_date!)}`
                          : `${daysLeft === 0 ? 'Vence hoje' : `Faltam ${daysLeft} ${plural(daysLeft, 'dia', 'dias')}`}${perWeek != null && perWeek > 0 ? ` · ${fmt(g, perWeek)} por semana` : ''}`}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {open && (
        <GoalDetail
          row={open} entries={entries.rows.filter((e) => e.goal_id === open.g.id)} linkName={linkName(open.g)} today={today}
          onClose={() => setOpenId(null)} onEdit={() => { setEditing(open.g); setOpenId(null); }}
          onStatus={(s) => setStatus(open.g, s)} onEntries={() => entries.reload()}
          onDelete={async () => {
            if (confirm('Excluir esta meta e os registros dela?') && await write(supabase.from('goals').delete().eq('id', open.g.id))) { setOpenId(null); void goals.reload(); }
          }}
        />
      )}
      {editing && (
        <GoalForm goal={editing} habits={habits.rows.filter((h) => !h.is_archived)} banks={banks.rows}
          projects={projects.projects.rows.filter((p) => !p.is_template && !p.archived_at)}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void goals.reload(); }} />
      )}
    </>
  );
}

/** The bar, with a tick where progress should be by now. */
function ProgressBar({ progress, expected, label }: { progress: number; expected: number | null; label: string }) {
  return (
    <div className="relative h-1.5 rounded-full bg-raised" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Progresso: ${label}`}>
      <div className="h-1.5 rounded-full bg-brand" style={{ width: `${progress * 100}%` }} />
      {expected != null && expected > 0 && expected < 1 && (
        <span className="absolute -top-1 h-3.5 w-0.5 rounded bg-fg2" style={{ left: `calc(${expected * 100}% - 1px)` }} title={`Esperado até hoje: ${Math.round(expected * 100)}%`} />
      )}
    </div>
  );
}

function GoalDetail({ row, entries, linkName, today, onClose, onEdit, onStatus, onEntries, onDelete }: {
  row: { g: Goal; current: number; progress: number; pace: Pace; expected: number | null; daysLeft: number | null; perWeek: number | null; projected: string | null };
  entries: GoalEntry[]; linkName?: string; today: string;
  onClose: () => void; onEdit: () => void; onStatus: (s: GoalStatus) => void; onEntries: () => void; onDelete: () => void;
}) {
  const { g, current, progress, pace, expected, perWeek, projected } = row;
  const linkedCount = linkedBankIdsOf(g).length;
  const manual = g.goal_type === 'custom' || (g.goal_type === 'financial' && linkedCount === 0);
  const curSymbol = symbolOf(goalCurrency(g));
  const [value, setValue] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const series = goalSeries(g, entries);

  async function add(e: FormEvent) {
    e.preventDefault();
    const v = Number(value.replace(',', '.'));
    if (!Number.isFinite(v)) return;
    if (await write(supabase.from('goal_entries').insert({ goal_id: g.id, value: v, date, note: note || null }))) {
      setValue(''); setNote('');
      onEntries();
    }
  }

  return (
    <Modal title={g.title} onClose={onClose}>
      <p className="-mt-3 mb-4 text-sm text-fg3">
        {TYPE_LABEL[g.goal_type]}{linkName ? ` · ${linkName}` : ''} · desde {short(g.start_date)}{g.target_date ? ` até ${short(g.target_date)}` : ''}
      </p>
      {g.description && <p className="mb-4 text-sm text-fg2">{g.description}</p>}
      <div className="mb-4 grid grid-cols-2 gap-4">
        <Stat label="Agora" value={fmt(g, current)} accent />
        <Stat label="Meta" value={fmt(g, targetOf(g))} />
        <Stat label="Ritmo" value={<span className={PACE_TONE[pace]}>{PACE_LABEL[pace]}</span>} hint={expected != null ? `esperado ${Math.round(expected * 100)}% até hoje` : undefined} />
        <Stat label="Progresso" value={`${Math.round(progress * 100)}%`}
          hint={pace === 'done' ? undefined : [perWeek != null && perWeek > 0 ? `${fmt(g, perWeek)}/semana` : null, projected ? `nesse ritmo: ${short(projected)}` : null].filter(Boolean).join(' · ') || undefined} />
      </div>
      <div className="mb-5"><ProgressBar progress={progress} expected={expected} label={g.title} /></div>

      {series.length > 1 && (
        <div className="-mx-5 mb-5 sm:mx-0">
          <AreaChart title="Evolução" points={series.map((p) => ({ label: short(p.date), value: p.value }))} unit={g.goal_type === 'financial' ? curSymbol : g.unit} minZero={g.measure === 'sum'} height={180} />
        </div>
      )}

      {manual && (
        <>
          <form onSubmit={add} className="mb-4 grid grid-cols-[1fr_1fr] gap-2">
            <Field label={g.measure === 'last' ? `Novo valor${g.unit ? ` (${g.unit})` : ''}` : g.goal_type === 'financial' ? `Aporte (${curSymbol})` : `Somar${g.unit ? ` (${g.unit})` : ''}`}>
              <input className="input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} required />
            </Field>
            <Field label="Data do registro"><input className="input" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required /></Field>
            <div className="col-span-2 flex gap-2">
              <input className="input" placeholder="Observação (opcional)" aria-label="Observação do registro" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn-primary shrink-0">Registrar</button>
            </div>
          </form>
          {entries.length > 0 && (
            <ul className="mb-5 max-h-48 space-y-1 overflow-y-auto text-sm">
              {[...entries].sort((a, b) => b.date.localeCompare(a.date)).map((e) => (
                <li key={e.id} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-fg3">{sentence(formatDay(e.date).replace(/ de \S+$/, ''))}</span>
                  <span className="figure shrink-0">{g.measure === 'sum' && Number(e.value) > 0 ? '+' : ''}{fmt(g, Number(e.value))}</span>
                  <span className="min-w-0 flex-1 truncate text-fg3">{e.note}</span>
                  <button className="icon-btn h-7 w-7" aria-label={`Apagar registro de ${e.date}`} onClick={async () => {
                    if (await write(supabase.from('goal_entries').delete().eq('id', e.id))) onEntries();
                  }}><Trash2 size={14} strokeWidth={1.5} /></button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {!manual && (
        <p className="mb-5 text-xs text-fg3">
          O valor vem {g.goal_type === 'habit' ? 'dos registros do hábito' : g.goal_type === 'project' ? 'do progresso do projeto' : linkedCount > 1 ? `da soma das ${linkedCount} contas vinculadas (convertido para ${curSymbol})` : `do saldo da conta (em ${curSymbol})`}, sem registro manual.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {g.status !== 'completed' && <button className="btn-secondary" onClick={() => { onStatus('completed'); onClose(); }}><CheckCircle2 size={16} strokeWidth={1.5} />Concluir</button>}
        {g.status === 'active' && <button className="btn-ghost" onClick={() => { onStatus('paused'); onClose(); }}><Pause size={16} strokeWidth={1.5} />Pausar</button>}
        {g.status !== 'active' && <button className="btn-ghost" onClick={() => { onStatus('active'); onClose(); }}><Play size={16} strokeWidth={1.5} />Reativar</button>}
        <button className="btn-ghost text-negative" onClick={onDelete}>Excluir</button>
        <button className="btn-primary ml-auto" onClick={onEdit}>Editar</button>
      </div>
    </Modal>
  );
}

function GoalForm({ goal, habits, projects, banks, onClose, onSaved }: {
  goal: Partial<Goal>; habits: Habit[]; projects: { id: string; name: string }[]; banks: Bank[]; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(goal.title ?? '');
  const [description, setDescription] = useState(goal.description ?? '');
  const [type, setType] = useState<GoalType>(goal.goal_type ?? 'custom');
  const [currency, setCurrency] = useState<Currency>(goalCurrency(goal));
  const [unit, setUnit] = useState(goal.unit ?? '');
  const [measure, setMeasure] = useState<'sum' | 'last'>(goal.measure ?? 'sum');
  const [progressFromZero, setProgressFromZero] = useState<boolean>(
    goal.progress_from_zero ?? !(goal.goal_type === 'custom' && goal.measure === 'last'),
  );
  const [start, setStart] = useState(String(goal.start_value ?? 0));
  const [target, setTarget] = useState(goal.target_value != null ? String(goal.target_value) : '');
  const [startDate, setStartDate] = useState(goal.start_date ?? toDay(new Date()));
  const [targetDate, setTargetDate] = useState(goal.target_date ?? '');
  const [habitId, setHabitId] = useState(goal.linked_habit_id ?? '');
  const [projectId, setProjectId] = useState(goal.linked_project_id ?? '');
  const [bankIds, setBankIds] = useState<string[]>(() => linkedBankIdsOf({ linked_bank_id: goal.linked_bank_id ?? null, linked_bank_ids: goal.linked_bank_ids }));
  const n = (s: string) => Number(s.replace(',', '.'));
  const curSymbol = symbolOf(currency);

  function toggleBank(id: string) {
    setBankIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const row = {
      title, description: description || null, goal_type: type, start_date: startDate, target_date: targetDate || null,
      currency: type === 'financial' ? currency : 'BRL',
      unit: type === 'custom' ? unit : '', measure: type === 'custom' ? measure : 'sum',
      progress_from_zero: type === 'custom' && measure === 'last' ? progressFromZero : true,
      start_value: type === 'custom' || (type === 'financial' && bankIds.length === 0) ? n(start) || 0 : 0,
      target_value: type === 'project' ? 100 : target === '' ? null : n(target),
      linked_habit_id: type === 'habit' ? habitId || null : null,
      linked_project_id: type === 'project' ? projectId || null : null,
      linked_bank_id: type === 'financial' ? (bankIds[0] ?? null) : null,
      linked_bank_ids: type === 'financial' ? bankIds : [],
    };
    const ok = goal.id ? await write(supabase.from('goals').update(row).eq('id', goal.id)) : await write(supabase.from('goals').insert(row));
    if (ok) onSaved();
  }

  return (
    <Modal title={goal.id ? 'Editar meta' : 'Nova meta'} onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Título"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus /></Field>
        <Field label="Tipo">
          <select className="input" value={type} onChange={(e) => setType(e.target.value as GoalType)}>
            <option value="custom">Pessoal (você registra o progresso)</option>
            <option value="financial">Financeira (aportes ou saldo de contas)</option>
            <option value="habit">Hábito (vezes feitas no período)</option>
            <option value="project">Projeto (progresso do projeto)</option>
          </select>
        </Field>
        {type === 'custom' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Unidade"><input className="input" placeholder="km, kg, livros…" value={unit} onChange={(e) => setUnit(e.target.value)} /></Field>
              <Field label="Como medir">
                <select className="input" value={measure} onChange={(e) => {
                  const next = e.target.value as 'sum' | 'last';
                  setMeasure(next);
                  if (!goal.id) setProgressFromZero(next === 'sum');
                }}>
                  <option value="sum">Somar registros</option>
                  <option value="last">Último valor</option>
                </select>
              </Field>
            </div>
            {measure === 'last' ? (
              <label className="-mt-1 mb-4 flex items-start gap-2 rounded-xl border border-line bg-raised/40 p-3 text-xs text-fg2">
                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={progressFromZero} onChange={(e) => setProgressFromZero(e.target.checked)} />
                <span>
                  <strong className="font-medium text-fg">Contar progresso a partir do zero</strong>
                  <span className="mt-0.5 block text-fg3">
                    {progressFromZero
                      ? 'Ex.: já tenho 1.194 de 5.000 = 24% concluído.'
                      : 'Ex.: chegar a 82 kg partindo de 92 kg; a meta pode ser menor que o início.'}
                  </span>
                </span>
              </label>
            ) : (
              <p className="-mt-2 mb-4 text-xs text-fg3">Ex.: correr 300 km, ler 12 livros.</p>
            )}
          </>
        )}
        {type === 'financial' && (
          <>
            <FieldGroup label="Moeda da meta">
              <div className="segmented">
                {CURRENCIES.map((c) => (
                  <button key={c.code} type="button" className={currency === c.code ? 'tab-active' : 'tab'} aria-pressed={currency === c.code} title={c.name} onClick={() => setCurrency(c.code)}>
                    {c.symbol} {c.code}
                  </button>
                ))}
              </div>
            </FieldGroup>
            <FieldGroup label="Contas vinculadas (opcional)">
              {banks.length === 0 ? (
                <p className="text-xs text-fg3">Nenhuma conta cadastrada em Finanças — registre aportes manualmente.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {banks.map((b) => {
                      const on = bankIds.includes(b.id);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleBank(b.id)}
                          className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${on ? 'border-primary bg-primary text-primary-ink' : 'border-line-strong bg-surface text-fg2 hover:bg-raised hover:text-fg'}`}
                        >
                          {on && <Check size={13} strokeWidth={2.2} aria-hidden="true" />}
                          <span>{b.name}</span>
                          {b.currency && b.currency !== 'BRL' && <span className={on ? 'opacity-80' : 'text-fg3'}>({symbolOf(b.currency)})</span>}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-xs text-fg3">
                    {bankIds.length === 0
                      ? 'Nenhuma conta marcada: você registra aportes manualmente.'
                      : bankIds.length === 1
                        ? `Acompanha automaticamente o saldo desta conta em ${curSymbol}.`
                        : `Soma o saldo das ${bankIds.length} contas selecionadas, convertido para ${curSymbol}.`}
                  </p>
                </>
              )}
            </FieldGroup>
          </>
        )}
        {type === 'habit' && (
          <Field label="Hábito">
            <select className="input" value={habitId} onChange={(e) => setHabitId(e.target.value)} required>
              <option value="">Escolha</option>
              {habits.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </Field>
        )}
        {type === 'project' && (
          <Field label="Projeto">
            <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
              <option value="">Escolha</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        )}
        {type !== 'project' && (
          <div className="grid grid-cols-2 gap-2">
            {(type === 'custom' || (type === 'financial' && bankIds.length === 0)) && (
              <Field label={type === 'financial' ? `Já guardado (${curSymbol})` : 'Valor inicial'}><input className="input" inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            )}
            <Field label={type === 'habit' ? 'Meta (vezes)' : type === 'financial' ? `Meta (${curSymbol})` : 'Meta'}>
              <input className="input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} required />
            </Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Início"><input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required /></Field>
          <Field label="Prazo (opcional)"><input className="input" type="date" value={targetDate} min={startDate} onChange={(e) => setTargetDate(e.target.value)} /></Field>
        </div>
        <Field label="Por quê (opcional)"><textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <button className="btn-primary w-full">Salvar</button>
      </form>
    </Modal>
  );
}
