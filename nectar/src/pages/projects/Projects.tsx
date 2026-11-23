import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Calendar, CheckCircle2, FolderKanban, LayoutTemplate, ListChecks, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { addDays, toDay } from '../../lib/dates';
import {
  HEALTH_LABEL, STATUS_LABEL, burnup, fromTemplate, projectHealth, projectProgress, projectUpcomingPlan,
  type Health, type Project, type ProjectStatus,
} from '../../lib/projects';
import type { Priority } from '../../lib/tasks';
import { ColumnChart, DonutChart, RankedBars } from '../../components/Charts';
import { CURRENCIES, formatIn, symbolOf, type Currency } from '../../lib/money';
import { Empty, Field, FieldGroup, ListSkeleton, Modal, PageHeader, Stat } from '../../components/ui';
import { useProjects, type ProjectsData } from './useProjects';
import ProjectView from './ProjectView';

const TABS = ['Projetos', 'Análise', 'Modelos'] as const;
type Tab = (typeof TABS)[number];
const FILTERS = ['Em andamento', 'Pausados', 'Concluídos', 'Arquivados'] as const;
type Filter = (typeof FILTERS)[number];

export const HEALTH_TONE: Record<Health, string> = {
  late: 'text-negative', risk: 'text-warning', ok: 'text-positive', done: 'text-fg3', open: 'text-fg3',
};
const HEALTH_BADGE: Record<Health, string> = {
  late: 'bg-negative/15 text-negative',
  risk: 'bg-warning/15 text-warning',
  ok: 'bg-positive/15 text-positive',
  done: 'bg-raised text-fg2',
  open: 'bg-raised text-fg3',
};

const short = (day: string) => `${Number(day.slice(8))}/${day.slice(5, 7)}`;

export default function Projects() {
  const data = useProjects();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('Projetos');
  const [filter, setFilter] = useState<Filter>('Em andamento');
  const [creating, setCreating] = useState<{ template?: Project } | null>(null);
  const today = toDay(new Date());
  const openId = params.get('p');
  const open = data.projects.rows.find((p) => p.id === openId);
  const real = data.projects.rows.filter((p) => !p.is_template);
  const templates = data.projects.rows.filter((p) => p.is_template);
  const loading = data.projects.loading || data.tasks.loading;

  if (open) return <ProjectView project={open} data={data} today={today} onBack={() => setParams({})} />;

  const shown = real.filter((p) => {
    if (filter === 'Arquivados') return !!p.archived_at;
    if (p.archived_at) return false;
    if (filter === 'Pausados') return p.status === 'paused';
    if (filter === 'Concluídos') return p.status === 'completed';
    return p.status === 'active' || p.status === 'planning';
  });
  const summary = real.filter((p) => !p.archived_at).map((p) => {
    const prog = projectProgress(data.tasksOf(p.id), data.stepsOf(p.id));
    return { p, prog, ...projectHealth(p, prog.pct, today) };
  });
  const going = summary.filter((s) => s.p.status === 'active' || s.p.status === 'planning');
  const openTasksCount = going.reduce((n, s) => n + data.tasksOf(s.p.id).filter((t) => !t.completed && !t.is_archived).length, 0);
  const riskCount = going.filter((s) => s.health === 'late' || s.health === 'risk').length;
  const doneCount = summary.filter((s) => s.p.status === 'completed').length;

  return (
    <>
      <PageHeader
        title="Projetos" subtitle={`${going.length} em andamento`} tabs={TABS} tab={tab} onTab={(t) => setTab(t as Tab)}
        action={<button className="btn-primary" onClick={() => setCreating({})}><Plus size={16} strokeWidth={1.5} />Novo projeto</button>}
      />
      {data.projects.error && <p className="mb-4 text-sm text-negative">{data.projects.error}</p>}
      {loading && <ListSkeleton rows={4} />}

      {tab === 'Projetos' && !loading && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3.5 xl:grid-cols-4">
            <div className="kpi-indigo flex items-center gap-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/18"><FolderKanban size={20} /></span>
              <div>
                <div className="figure text-[26px] leading-7 font-bold">{going.length}</div>
                <div className="mt-0.5 text-xs text-white/85">Em andamento</div>
              </div>
            </div>
            <div className="kpi-gold flex items-center gap-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-black/12"><ListChecks size={20} /></span>
              <div>
                <div className="figure text-[26px] leading-7 font-bold">{openTasksCount}</div>
                <div className="mt-0.5 text-xs font-medium opacity-80">Subetapas abertas</div>
              </div>
            </div>
            <div className="kpi-pink flex items-center gap-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/18"><AlertTriangle size={20} /></span>
              <div>
                <div className="figure text-[26px] leading-7 font-bold">{riskCount}</div>
                <div className="mt-0.5 text-xs text-white/85">Em risco / atraso</div>
              </div>
            </div>
            <div className="kpi-teal flex items-center gap-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/18"><CheckCircle2 size={20} /></span>
              <div>
                <div className="figure text-[26px] leading-7 font-bold">{doneCount}</div>
                <div className="mt-0.5 text-xs text-white/85">Concluídos</div>
              </div>
            </div>
          </div>

          <div className="segmented mb-5 w-fit max-w-full overflow-x-auto" role="tablist" aria-label="Filtro">
            {FILTERS.map((f) => <button key={f} role="tab" aria-selected={f === filter} className={f === filter ? 'tab-active' : 'tab'} onClick={() => setFilter(f)}>{f}</button>)}
          </div>
          {shown.length === 0 && (
            <div className="card"><Empty icon={<FolderKanban size={18} strokeWidth={1.5} />} action={filter === 'Em andamento' ? <button className="btn-secondary" onClick={() => setCreating({})}>Novo projeto</button> : undefined}>
              {filter === 'Em andamento' ? 'Nenhum projeto em andamento' : `Nenhum projeto em ${filter.toLowerCase()}`}
            </Empty></div>
          )}
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((p) => <ProjectCard key={p.id} project={p} data={data} today={today} onOpen={() => setParams({ p: p.id })} />)}
          </ul>
        </>
      )}

      {tab === 'Análise' && !loading && <Analysis data={data} today={today} />}

      {tab === 'Modelos' && !loading && (
        <>
          <p className="mb-4 max-w-2xl text-sm text-fg2">Um modelo guarda os marcos (com a distância em dias do início) e as tarefas de um projeto. Para criar um, abra um projeto e use "Salvar como modelo".</p>
          {templates.length === 0 && <div className="card"><Empty icon={<LayoutTemplate size={18} strokeWidth={1.5} />}>Nenhum modelo ainda</Empty></div>}
          <ul className="grid gap-4 md:grid-cols-2">
            {templates.map((t) => (
              <li key={t.id} className="card">
                <div className="mb-1 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
                  <span className="mr-auto font-medium">{t.name}</span>
                  <button className="icon-btn" aria-label={`Excluir modelo ${t.name}`} onClick={async () => {
                    if (confirm('Excluir este modelo?') && await write(supabase.from('projects').delete().eq('id', t.id))) void data.reload();
                  }}><Trash2 size={16} strokeWidth={1.5} /></button>
                </div>
                <p className="mb-3 text-sm text-fg3">{data.stepsOf(t.id).length} marcos · {t.template_tasks.length} tarefas</p>
                <ul className="mb-4 space-y-1 text-sm text-fg2">
                  {data.stepsOf(t.id).map((s) => <li key={s.id}>{s.title}{s.offset_days != null && <span className="figure text-fg3"> · dia {s.offset_days}</span>}</li>)}
                </ul>
                <button className="btn-secondary" onClick={() => setCreating({ template: t })}>Usar modelo</button>
              </li>
            ))}
          </ul>
        </>
      )}

      {creating && (
        <ProjectForm data={data} templates={templates} template={creating.template} onClose={() => setCreating(null)}
          onSaved={(id) => { setCreating(null); setParams({ p: id }); }} />
      )}
    </>
  );
}

function ProjectCard({ project: p, data, today, onOpen }: { project: Project; data: ProjectsData; today: string; onOpen: () => void }) {
  const steps = data.stepsOf(p.id);
  const tasks = data.tasksOf(p.id);
  const prog = projectProgress(tasks, steps);
  const { health } = projectHealth(p, prog.pct, today);
  const plan = projectUpcomingPlan(steps, tasks, 2, 2, 3);
  const hasUpcoming = plan.nextSteps.length > 0 || plan.looseSubsteps.length > 0;

  return (
    <li className="min-w-0">
      <button
        type="button"
        className="card glow flex h-full w-full min-w-0 flex-col overflow-hidden p-0 text-left"
        onClick={onOpen}
      >
        {/* LMS Colored Top Visual Banner */}
        <div
          className="relative flex w-full items-center justify-between gap-2 px-5 py-4"
          style={{ background: `linear-gradient(135deg, ${p.color}48 0%, ${p.color}16 100%)` }}
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sunken/75 px-2.5 py-1 text-[11px] font-medium text-fg backdrop-blur">
            <Calendar size={12} strokeWidth={1.8} aria-hidden="true" style={{ color: p.color }} />
            {p.due_date ? `Prazo ${short(p.due_date)}` : 'Sem prazo'}
          </span>
          <span className={`badge ${p.status === 'paused' ? 'bg-raised text-fg2' : HEALTH_BADGE[health]}`}>
            {p.status === 'paused' ? STATUS_LABEL.paused : HEALTH_LABEL[health]}
          </span>
        </div>

        {/* Body: Progress % + Title + Description */}
        <div className="flex w-full flex-1 flex-col p-5">
          <div className="mb-3">
            <div className="mb-1.5 flex items-baseline gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={prog.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Progresso de ${p.name}`}>
                <div className="meter-fill h-full rounded-full" style={{ width: `${Math.max(prog.pct, prog.total > 0 ? 3 : 0)}%`, background: p.color }} />
              </div>
              <span className="figure shrink-0 text-sm font-bold text-fg">{prog.pct}%</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-fg3">
              <span>
                {prog.total === 0 ? 'Sem etapas cadastradas' : prog.by === 'steps' ? `${prog.done} de ${prog.total} etapas` : `${prog.done} de ${prog.total} subetapas`}
              </span>
              {p.budget != null && <span className="figure">{formatIn(Number(p.budget), p.budget_currency ?? 'BRL')}</span>}
            </div>
          </div>

          <h3 className="truncate text-base font-semibold text-fg">{p.name}</h3>
          {p.description && <p className="mt-1 line-clamp-2 text-xs leading-5 text-fg3">{p.description}</p>}

          {/* Upcoming Steps (Etapas) & Substeps (Subetapas) */}
          <div className="mt-4 flex-1 border-t border-line pt-3.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-fg2">Próximas etapas e subetapas</span>
              {(plan.remainingSteps > 0 || plan.remainingTasks > 0) && (
                <span className="figure text-[11px] text-fg3">
                  {plan.remainingSteps > 0 ? `${plan.remainingSteps} et.` : ''}{plan.remainingSteps > 0 && plan.remainingTasks > 0 ? ' · ' : ''}{plan.remainingTasks > 0 ? `${plan.remainingTasks} sub.` : ''}
                </span>
              )}
            </div>

            {!hasUpcoming ? (
              <div className="rounded-xl bg-raised/60 px-3 py-2.5 text-xs text-fg3">
                {prog.total > 0 && prog.pct >= 100
                  ? 'Todas as etapas e subetapas concluídas'
                  : 'Toque para abrir e cadastrar etapas e subetapas'}
              </div>
            ) : (
              <div className="space-y-2.5">
                {plan.nextSteps.map((item) => (
                  <div key={item.step.id} className="rounded-xl bg-raised/55 p-2.5">
                    <div className="flex items-center gap-2 text-xs font-medium text-fg">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{item.step.title}</span>
                      {item.step.due_date && <span className="figure shrink-0 text-[10px] text-fg3">{short(item.step.due_date)}</span>}
                      {item.totalSubsteps > 0 && (
                        <span className="figure shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10px] text-fg3">
                          {item.doneSubsteps}/{item.totalSubsteps}
                        </span>
                      )}
                    </div>
                    {item.substeps.length > 0 && (
                      <ul className="mt-1.5 space-y-1 border-l border-line-strong pl-3">
                        {item.substeps.map((sub) => (
                          <li key={sub.id} className="flex items-center gap-1.5 text-[11px] text-fg2">
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${sub.status === 'in_progress' ? 'bg-[#f5b700]' : 'bg-fg3/60'}`} aria-hidden="true" />
                            <span className="truncate">{sub.title}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}

                {plan.looseSubsteps.length > 0 && (
                  <ul className="space-y-1.5 rounded-xl bg-raised/45 p-2.5">
                    {plan.looseSubsteps.map((sub) => (
                      <li key={sub.id} className="flex items-center gap-2 text-xs text-fg2">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${sub.status === 'in_progress' ? 'bg-[#f5b700]' : sub.priority === 'high' ? 'bg-negative' : 'bg-fg3/60'}`} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{sub.title}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}

function Analysis({ data, today }: { data: ProjectsData; today: string }) {
  const live = data.projects.rows.filter((p) => !p.is_template && !p.archived_at);
  const allTasks = live.flatMap((p) => data.tasksOf(p.id));
  const weeks = burnup(allTasks, today, 12);
  const doneIn = (from: string) => allTasks.filter((t) => {
    const d = t.completed && t.completed_at ? toDay(new Date(t.completed_at)) : null;
    return d !== null && d >= from && d <= addDays(from, 6);
  }).length;
  const perWeek = weeks.map((w) => ({ label: short(w.week), value: doneIn(w.week), detail: `${w.done} de ${w.scope} feitas até aqui` }));
  const rows = live.filter((p) => p.status !== 'completed').map((p) => {
    const prog = projectProgress(data.tasksOf(p.id), data.stepsOf(p.id));
    const h = projectHealth(p, prog.pct, today);
    return { label: p.name, value: prog.pct, detail: h.expected != null ? `${HEALTH_LABEL[h.health].toLowerCase()} · esperado ${h.expected}%` : HEALTH_LABEL[h.health].toLowerCase() };
  }).sort((a, b) => b.value - a.value);
  const counts = (Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => ({ s, n: live.filter((p) => p.status === s).length }));
  if (!live.length) return <div className="card"><Empty icon={<FolderKanban size={18} strokeWidth={1.5} />}>Crie um projeto para ver a análise</Empty></div>;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card grid grid-cols-2 gap-4 sm:grid-cols-4 lg:col-span-2">
        {counts.map(({ s, n }) => <Stat key={s} label={STATUS_LABEL[s]} value={n} />)}
      </div>
      <ColumnChart title="Tarefas concluídas por semana" subtitle="Todos os projetos, últimas 12 semanas" points={perWeek} unit="tarefas" />
      <DonutChart
        title="Projetos por status"
        subtitle="Distribuição atual da carteira"
        centerLabel="Projetos"
        format={(n) => String(Math.round(n))}
        rows={counts.map(({ s, n }) => ({ label: STATUS_LABEL[s], value: n }))}
      />
      <section className="card lg:col-span-2">
        <div className="mb-4">
          <div className="font-medium">Progresso por projeto</div>
          <div className="text-[13px] leading-5 text-fg3">Comparado ao tempo já passado até o prazo</div>
        </div>
        {rows.length ? <RankedBars rows={rows} unit="%" format={(n) => String(Math.round(n))} /> : <p className="text-sm text-fg3">Nenhum projeto aberto.</p>}
      </section>
    </div>
  );
}

const COLORS = ['#ea580c', '#0ea5e9', '#22c55e', '#a855f7', '#eab308', '#ec4899', '#64748b'];

export function ProjectForm({ data, project, templates = [], template, onClose, onSaved }: {
  data: ProjectsData; project?: Project; templates?: Project[]; template?: Project; onClose: () => void; onSaved: (id: string) => void;
}) {
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'active');
  const [priority, setPriority] = useState<Priority>(project?.priority ?? 'medium');
  const [start, setStart] = useState(project?.start_date ?? toDay(new Date()));
  const [due, setDue] = useState(project?.due_date ?? '');
  const [budget, setBudget] = useState(project?.budget != null ? String(project.budget) : '');
  const [budgetCurrency, setBudgetCurrency] = useState<Currency>(project?.budget_currency ?? 'BRL');
  const [color, setColor] = useState(project?.color ?? template?.color ?? COLORS[0]);
  const [templateId, setTemplateId] = useState(template?.id ?? '');
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const parsedBudget = budget.trim() ? Number(budget.replace(',', '.')) : null;
    const row = {
      name, description: description || null, status, priority, start_date: start, due_date: due || null, color,
      budget: parsedBudget != null && Number.isFinite(parsedBudget) ? parsedBudget : null,
      budget_currency: budgetCurrency,
    };
    if (project) {
      await data.patchProject(project.id, row);
      onSaved(project.id);
      return;
    }
    const { data: created, error } = await supabase.from('projects').insert(row).select('id').single();
    if (error || !created) { alert(`Não foi possível salvar: ${error?.message}`); setSaving(false); return; }
    const tpl = templates.find((t) => t.id === templateId);
    if (tpl) {
      const plan = fromTemplate(tpl, data.stepsOf(tpl.id), start);
      const { data: steps } = plan.steps.length
        ? await supabase.from('project_steps').insert(plan.steps.map((s) => ({ ...s, project_id: created.id }))).select('id,order_index')
        : { data: [] as { id: string; order_index: number }[] };
      const stepId = (i: number | null) => (i == null ? null : steps?.find((s) => s.order_index === i)?.id ?? null);
      if (plan.tasks.length) {
        const { data: tasks } = await supabase.from('tasks')
          .insert(plan.tasks.map((t) => ({ title: t.title, description: t.description, priority: t.priority, project_step_id: stepId(t.step) }))).select('id');
        if (tasks?.length) await write(supabase.from('project_tasks').insert(tasks.map((t, position) => ({ project_id: created.id, task_id: t.id, position }))));
      }
    }
    await data.reload();
    onSaved(created.id);
  }

  return (
    <Modal title={project ? 'Editar projeto' : 'Novo projeto'} onClose={onClose}>
      <form onSubmit={save}>
        {!project && templates.length > 0 && (
          <Field label="A partir de um modelo">
            <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">Em branco</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></Field>
        <Field label="Descrição"><textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Início"><input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} required /></Field>
          <Field label="Prazo (opcional)"><input className="input" type="date" value={due} min={start} onChange={(e) => setDue(e.target.value)} /></Field>
          <Field label="Situação">
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
              {(Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </Field>
          <Field label="Prioridade">
            <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={`Orçamento (${symbolOf(budgetCurrency)}, opcional)`}>
            <input className="input figure" inputMode="decimal" placeholder="Ex.: 2500" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </Field>
          <FieldGroup label="Moeda do orçamento">
            <div className="segmented w-full">
              {CURRENCIES.map((c) => (
                <button key={c.code} type="button" className={`flex-1 ${budgetCurrency === c.code ? 'tab-active' : 'tab'}`} aria-pressed={budgetCurrency === c.code} onClick={() => setBudgetCurrency(c.code)}>
                  {c.symbol}
                </button>
              ))}
            </div>
          </FieldGroup>
        </div>
        <div className="mb-4" role="group" aria-label="Cor">
          <span className="mb-1.5 block text-[13px] leading-5 text-fg2">Cor</span>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Cor ${c}`} aria-pressed={c === color} onClick={() => setColor(c)}
                className={`h-7 w-7 rounded-full ${c === color ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface' : ''}`} style={{ background: c }} />
            ))}
          </div>
        </div>
        <button className="btn-primary w-full" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
      </form>
    </Modal>
  );
}
