import { useEffect, useState } from 'react';
import { ArrowRight, CalendarCheck2, Check, CheckCircle2, ChevronLeft, FolderKanban, Sparkles, Target, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTable, write } from '../lib/useTable';
import { addDays, formatDay, toDay } from '../lib/dates';
import { moveToDay } from '../lib/calendar';
import { money } from '../lib/money';
import { buildReview, formatReviewDiary, type ReviewMode } from '../lib/review';
import type { Task } from '../lib/tasks';
import type { Reminder } from '../lib/reminders';
import type { Habit, HabitCompletion } from '../lib/habits';
import { currentValue, type Goal, type GoalEntry } from '../lib/goals';
import { bankBalance, recurringInMonth, type Bank, type InvoicePayment, type RecurringTemplate, type Skip, type Tx } from '../lib/finance';
import { MOODS } from '../lib/knowledge';
import { useProjects } from '../pages/projects/useProjects';
import { useRates } from '../pages/finance/useRates';
import { Field, ListSkeleton, Modal } from './ui';
import { notifyDataChanged } from './QuickCaptureModal';

export function openGuidedReview(mode: ReviewMode = 'daily') {
  window.dispatchEvent(new CustomEvent<ReviewMode>('painel-open-review', { detail: mode }));
}

const STEPS = ['Pendências', 'Rotina e foco', 'Projetos e finanças', 'Fechamento'] as const;

export function ReviewModal() {
  const [mode, setMode] = useState<ReviewMode | null>(null);
  useEffect(() => {
    const onOpen = (e: Event) => setMode((e as CustomEvent<ReviewMode>).detail ?? 'daily');
    window.addEventListener('painel-open-review', onOpen);
    return () => window.removeEventListener('painel-open-review', onOpen);
  }, []);
  if (!mode) return null;
  return <ReviewDialog initialMode={mode} onClose={() => setMode(null)} />;
}

function ReviewDialog({ initialMode, onClose }: { initialMode: ReviewMode; onClose: () => void }) {
  const [mode, setMode] = useState<ReviewMode>(initialMode);
  const [step, setStep] = useState(0);
  const [focus, setFocus] = useState('');
  const [focusSaved, setFocusSaved] = useState(false);
  const [reflection, setReflection] = useState('');
  const [mood, setMood] = useState<number>(4);
  const [savingDiary, setSavingDiary] = useState(false);

  const tasks = useTable<Task>('tasks');
  const reminders = useTable<Reminder>('reminders', '*', { column: 'datetime' });
  const habits = useTable<Habit>('habits');
  const completions = useTable<HabitCompletion>('habit_completions', 'id,habit_id,completed_date,value');
  const projects = useProjects();
  const goals = useTable<Goal>('goals');
  const entries = useTable<GoalEntry>('goal_entries');
  const banks = useTable<Bank>('banks');
  const txs = useTable<Tx>('transactions');
  const templates = useTable<RecurringTemplate>('transaction_recurring_templates');
  const skips = useTable<Skip>('transaction_recurring_skips');
  const payments = useTable<InvoicePayment>('card_invoice_payments');
  useRates(null);

  const now = new Date();
  const today = toDay(now);
  const tomorrow = addDays(today, 1);
  const loading = tasks.loading || habits.loading || projects.projects.loading || goals.loading;

  const occ = recurringInMonth(templates.rows.filter((t) => t.is_active && !t.deleted_at), txs.rows, skips.rows, now.getFullYear(), now.getMonth() + 1);
  const upcomingBills = [
    ...occ.filter((o) => !o.paid && !o.skipped && o.template.type === 'expense' && o.date >= today).map((o) => ({ date: o.date, label: o.template.description, amount: o.template.amount })),
    ...txs.rows.filter((t) => t.is_pending && t.type === 'expense' && t.date >= today).map((t) => ({ date: t.date, label: t.description, amount: t.amount })),
  ];

  const summary = buildReview(mode, {
    tasks: tasks.rows,
    reminders: reminders.rows,
    habits: habits.rows,
    completions: completions.rows,
    projects: projects.projects.rows,
    tasksOf: projects.tasksOf,
    stepsOf: projects.stepsOf,
    goals: goals.rows,
    goalValueOf: (g) => {
      const bank = banks.rows.find((b) => b.id === g.linked_bank_id);
      return currentValue(g, {
        entries: entries.rows,
        habits: habits.rows,
        completions: completions.rows,
        bankBalance: bank ? bankBalance(bank, txs.rows, [], payments.rows) : undefined,
      });
    },
    upcomingBills,
  }, now);

  async function completeTask(t: Task) {
    tasks.setRows((rows) => rows.map((x) => (x.id === t.id ? { ...x, completed: true, completed_at: new Date().toISOString() } : x)));
    await write(supabase.from('tasks').update({ completed: true, status: 'completed', completed_at: new Date().toISOString() }).eq('id', t.id));
    notifyDataChanged();
  }

  async function rescheduleTask(t: Task, targetDay: string) {
    const due_date = !t.due_date || t.due_all_day ? new Date(`${targetDay}T12:00:00`).toISOString() : moveToDay(t.due_date, targetDay);
    tasks.setRows((rows) => rows.map((x) => (x.id === t.id ? { ...x, due_date } : x)));
    await write(supabase.from('tasks').update({ due_date }).eq('id', t.id));
    notifyDataChanged();
  }

  async function completeReminder(r: Reminder) {
    reminders.setRows((rows) => rows.map((x) => (x.id === r.id ? { ...x, completed: true } : x)));
    await write(supabase.from('reminders').update({ completed: true }).eq('id', r.id));
    notifyDataChanged();
  }

  async function createFocusTask() {
    const title = focus.trim();
    if (!title) return;
    const ok = await write(supabase.from('tasks').insert({
      title,
      priority: 'high',
      due_date: new Date(`${today}T12:00:00`).toISOString(),
      due_all_day: true,
    }));
    if (ok) {
      setFocusSaved(true);
      notifyDataChanged();
      void tasks.reload();
    }
  }

  async function finish(saveToDiary: boolean) {
    if (saveToDiary) {
      setSavingDiary(true);
      const entry = formatReviewDiary(summary, focus, reflection);
      await write(supabase.from('diary_entries').upsert({
        date: today,
        title: entry.title,
        content: entry.content,
        mood,
      }, { onConflict: 'user_id,date' }));
      setSavingDiary(false);
      notifyDataChanged();
    }
    onClose();
  }

  return (
    <Modal title={mode === 'daily' ? 'Revisão diária' : 'Revisão semanal'} onClose={onClose}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="segmented" role="tablist" aria-label="Tipo de revisão">
          <button type="button" role="tab" aria-selected={mode === 'daily'} className={mode === 'daily' ? 'tab-active' : 'tab'} onClick={() => setMode('daily')}>Diária</button>
          <button type="button" role="tab" aria-selected={mode === 'weekly'} className={mode === 'weekly' ? 'tab-active' : 'tab'} onClick={() => setMode('weekly')}>Semanal</button>
        </div>
        <span className="figure text-xs text-fg3">Passo {step + 1} de {STEPS.length}</span>
      </div>

      <div className="mb-5 flex gap-1" aria-hidden="true">
        {STEPS.map((s, i) => (
          <span key={s} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${i <= step ? 'bg-brand' : 'bg-raised'}`} />
        ))}
      </div>

      {loading ? <ListSkeleton rows={3} /> : (
        <div className="min-h-[220px]">
          {step === 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CalendarCheck2 size={16} strokeWidth={1.6} className="text-brand" aria-hidden="true" />
                <span>Pendências e atrasos ({formatDay(today)})</span>
              </div>
              {summary.overdueTasks.length === 0 && summary.overdueReminders.length === 0 ? (
                <div className="rounded-[14px] bg-positive/10 px-4 py-5 text-center text-sm text-positive">
                  <CheckCircle2 size={20} strokeWidth={1.75} className="mx-auto mb-1.5" aria-hidden="true" />
                  Tudo em dia! Nenhuma tarefa nem lembrete atrasado.
                </div>
              ) : (
                <ul className="space-y-2">
                  {summary.overdueTasks.map((t) => (
                    <li key={t.id} className="rounded-[14px] bg-raised p-3">
                      <div className="mb-2 text-sm font-medium">{t.title}</div>
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" className="btn-secondary h-8 px-2.5 text-xs" onClick={() => void rescheduleTask(t, today)}>Mover p/ hoje</button>
                        <button type="button" className="btn-secondary h-8 px-2.5 text-xs" onClick={() => void rescheduleTask(t, tomorrow)}>Amanhã</button>
                        <button type="button" className="btn-ghost h-8 px-2.5 text-xs text-positive" onClick={() => void completeTask(t)}><Check size={14} aria-hidden="true" />Concluir</button>
                      </div>
                    </li>
                  ))}
                  {summary.overdueReminders.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 rounded-[14px] bg-raised px-3 py-2.5 text-sm">
                      <span className="mr-auto truncate">{r.title}</span>
                      <button type="button" className="btn-ghost h-8 px-2.5 text-xs text-positive" onClick={() => void completeReminder(r)}><Check size={14} aria-hidden="true" />Feito</button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-fg3">Você tem <strong className="figure text-fg">{summary.todayTasks.length}</strong> {summary.todayTasks.length === 1 ? 'tarefa' : 'tarefas'} programadas para hoje.</p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[14px] bg-raised p-3.5">
                  <div className="label">Hábitos hoje</div>
                  <div className="figure mt-1 text-2xl font-medium">{summary.habitsDoneToday}<span className="text-sm text-fg3"> / {summary.habitsTotalToday}</span></div>
                </div>
                <div className="rounded-[14px] bg-raised p-3.5">
                  <div className="label">Últimos 7 dias</div>
                  <div className="figure mt-1 text-2xl font-medium text-brand-ink">{Math.round(summary.weeklyHabitRate * 100)}%</div>
                </div>
              </div>
              <Field label={mode === 'daily' ? 'Qual é a prioridade nº 1 de hoje?' : 'Qual é a grande entrega desta semana?'}>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    value={focus}
                    onChange={(e) => { setFocus(e.target.value); setFocusSaved(false); }}
                    placeholder="Ex.: Concluir módulo QQI Level 5"
                  />
                  <button type="button" className="btn-secondary shrink-0" disabled={!focus.trim() || focusSaved} onClick={() => void createFocusTask()}>
                    {focusSaved ? 'Criada' : 'Criar tarefa'}
                  </button>
                </div>
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-[14px] bg-raised p-3.5">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-fg2">
                  <Wallet size={14} strokeWidth={1.6} aria-hidden="true" />
                  <span>Contas nos próximos 7 dias</span>
                  <span className="figure ml-auto text-fg">{money(summary.billsTotal)}</span>
                </div>
                {summary.billsNext7Days.length === 0 ? (
                  <p className="text-xs text-fg3">Nenhuma conta prevista para os próximos 7 dias.</p>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {summary.billsNext7Days.slice(0, 5).map((b, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="figure text-fg3">{b.date.slice(8)}/{b.date.slice(5, 7)}</span>
                        <span className="mr-auto truncate">{b.label}</span>
                        <span className="figure">{money(b.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-[14px] bg-raised p-3.5">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-fg2">
                  <FolderKanban size={14} strokeWidth={1.6} aria-hidden="true" />
                  <span>Projetos que pedem atenção ({summary.projectsNeedingAttention.length})</span>
                </div>
                {summary.projectsNeedingAttention.length === 0 ? (
                  <p className="text-xs text-fg3">Todos os projetos estão no ritmo.</p>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {summary.projectsNeedingAttention.slice(0, 5).map(({ project, reason }) => (
                      <li key={project.id} className="flex items-center gap-2">
                        <span className="mr-auto truncate font-medium text-fg">{project.name}</span>
                        <span className="shrink-0 text-fg3">{reason}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {summary.goalsBehind.length > 0 && (
                <div className="rounded-[14px] bg-warning/10 p-3.5">
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-warning">
                    <Target size={14} strokeWidth={1.6} aria-hidden="true" />
                    <span>Metas fora do ritmo ({summary.goalsBehind.length})</span>
                  </div>
                  <ul className="space-y-1 text-xs text-fg2">
                    {summary.goalsBehind.map(({ goal, paceLabel }) => (
                      <li key={goal.id} className="flex items-center gap-2">
                        <span className="mr-auto truncate">{goal.title}</span>
                        <span className="shrink-0 text-warning">{paceLabel}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles size={16} strokeWidth={1.6} className="text-brand" aria-hidden="true" />
                <span>Fechamento da revisão</span>
              </div>
              <Field label="Reflexão rápida (opcional — salva no Diário de hoje)">
                <textarea
                  className="input h-24 py-2.5"
                  value={reflection}
                  onChange={(e) => setReflection(e.target.value)}
                  placeholder="O que funcionou bem? O que ajustar amanhã?"
                />
              </Field>
              <div>
                <span className="mb-1.5 block text-[13px] text-fg2">Como está sua energia hoje?</span>
                <div className="flex flex-wrap gap-1.5">
                  {MOODS.map((label, i) => {
                    const v = i + 1;
                    return (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={mood === v}
                        onClick={() => setMood(v)}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${mood === v ? 'bg-primary text-primary-ink' : 'bg-raised text-fg2 hover:text-fg'}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-2 border-t border-line pt-4">
        {step > 0 ? (
          <button type="button" className="btn-ghost" onClick={() => setStep(step - 1)}>
            <ChevronLeft size={16} strokeWidth={1.6} aria-hidden="true" />Voltar
          </button>
        ) : (
          <button type="button" className="btn-ghost" onClick={onClose}>Fechar</button>
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" className="btn-primary ml-auto" onClick={() => setStep(step + 1)}>
            Continuar <ArrowRight size={16} strokeWidth={1.6} aria-hidden="true" />
          </button>
        ) : (
          <div className="ml-auto flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => void finish(false)}>Concluir</button>
            <button type="button" className="btn-primary" disabled={savingDiary} onClick={() => void finish(true)}>
              {savingDiary ? 'Salvando…' : 'Salvar no Diário'}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
