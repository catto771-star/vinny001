import { useState, type FormEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, ChevronLeft, ChevronRight, Flag, Play, CheckCircle2, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { formatDay, sentence, toDay } from '../../lib/dates';
import {
  COLUMNS, HEALTH_LABEL, STATUS_LABEL, burnup, diffDays, kanban, moveTo, projectHealth, projectProgress, toTemplate, trajectory,
  type Column, type Project, type ProjectTask, type Step,
} from '../../lib/projects';
import { PRIORITY_LABEL, type Priority } from '../../lib/tasks';
import { ColumnChart } from '../../components/Charts';
import { Empty, Field, Modal, PageHeader, Stat } from '../../components/ui';
import { dueFromDay, type ProjectsData } from './useProjects';
import { HEALTH_TONE, ProjectForm } from './Projects';

const VIEWS = ['Quadro', 'Marcos', 'Trajetória'] as const;
type View = (typeof VIEWS)[number];
const DOT: Record<Priority, string> = { high: 'bg-negative', medium: 'bg-brand', low: 'bg-fg3' };
const short = (day: string) => `${Number(day.slice(8))}/${day.slice(5, 7)}`;
const taskDay = (t: ProjectTask) => (t.due_date ? toDay(new Date(t.due_date)) : null);

export default function ProjectView({ project: p, data, today, onBack }: { project: Project; data: ProjectsData; today: string; onBack: () => void }) {
  const [view, setView] = useState<View>('Quadro');
  const [editing, setEditing] = useState(false);
  const [taskOpen, setTaskOpen] = useState<Partial<ProjectTask> | null>(null);
  const tasks = data.tasksOf(p.id);
  const steps = data.stepsOf(p.id);
  const prog = projectProgress(tasks, steps);
  const { health, expected } = projectHealth(p, prog.pct, today);
  const left = p.due_date ? diffDays(today, p.due_date) : null;

  async function saveAsTemplate() {
    const tpl = toTemplate(p, steps, tasks);
    const { data: created, error } = await supabase.from('projects')
      .insert({ name: `${p.name} (modelo)`, description: p.description, color: p.color, priority: p.priority, status: 'planning', is_template: true, template_tasks: tpl.template_tasks })
      .select('id').single();
    if (error || !created) { alert(`Não foi possível salvar: ${error?.message}`); return; }
    if (tpl.steps.length) await write(supabase.from('project_steps').insert(tpl.steps.map((s) => ({ ...s, project_id: created.id }))));
    await data.reload();
    alert('Modelo salvo. Ele aparece na aba Modelos.');
  }
  async function remove() {
    if (!confirm(`Excluir o projeto e as ${tasks.length} tarefas dele? Isso não pode ser desfeito.`)) return;
    if (tasks.length) await write(supabase.from('tasks').delete().in('id', tasks.map((t) => t.id)));
    if (await write(supabase.from('projects').delete().eq('id', p.id))) { onBack(); void data.reload(); }
  }

  return (
    <>
      <button className="btn-ghost -ml-2 mb-2" onClick={onBack}><ArrowLeft size={16} strokeWidth={1.5} />Projetos</button>
      <PageHeader
        title={p.name}
        subtitle={[STATUS_LABEL[p.status], p.description].filter(Boolean).join(' · ')}
        tabs={VIEWS} tab={view} onTab={(v) => setView(v as View)}
        action={<button className="btn-secondary" onClick={() => setEditing(true)}>Editar</button>}
      />
      <div className="card mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Progresso" value={`${prog.pct}%`} accent hint={prog.by === 'steps' ? `${prog.done}/${prog.total} marcos` : `${prog.done}/${prog.total} tarefas`} />
        <Stat label="Situação" value={<span className={HEALTH_TONE[health]}>{p.status === 'paused' ? STATUS_LABEL.paused : HEALTH_LABEL[health]}</span>}
          hint={expected != null && health !== 'late' ? `esperado ${expected}% até hoje` : undefined} />
        <Stat label="Prazo" value={p.due_date ? short(p.due_date) : '—'}
          hint={left == null || p.status === 'completed' ? undefined : left < 0 ? `${-left} dias de atraso` : left === 0 ? 'vence hoje' : `faltam ${left} dias`} />
        <Stat label="Marcos" value={steps.filter((s) => s.completed).length} unit={`/ ${steps.length}`} />
      </div>

      {view === 'Quadro' && <Board project={p} tasks={tasks} steps={steps} data={data} today={today} onOpen={setTaskOpen} />}
      {view === 'Marcos' && <Milestones project={p} tasks={tasks} steps={steps} data={data} today={today} />}
      {view === 'Trajetória' && <Trail project={p} tasks={tasks} steps={steps} today={today} />}

      <div className="mt-8 flex flex-wrap gap-2 border-t border-line pt-4">
        {p.status !== 'completed' && <button className="btn-secondary" onClick={() => data.patchProject(p.id, { status: 'completed' })}><CheckCircle2 size={16} strokeWidth={1.5} />Concluir projeto</button>}
        <button className="btn-ghost" onClick={saveAsTemplate}>Salvar como modelo</button>
        <button className="btn-ghost" onClick={() => { void data.patchProject(p.id, { archived_at: p.archived_at ? null : new Date().toISOString() }); if (!p.archived_at) onBack(); }}>
          {p.archived_at ? 'Desarquivar' : 'Arquivar'}
        </button>
        <button className="btn-ghost ml-auto text-negative" onClick={remove}>Excluir</button>
      </div>

      {editing && <ProjectForm data={data} project={p} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
      {taskOpen && <TaskForm task={taskOpen} project={p} steps={steps} data={data} onClose={() => setTaskOpen(null)} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

function Board({ project, tasks, steps, data, today, onOpen }: {
  project: Project; tasks: ProjectTask[]; steps: Step[]; data: ProjectsData; today: string; onOpen: (t: Partial<ProjectTask>) => void;
}) {
  const board = kanban(tasks);
  const [over, setOver] = useState<Column | null>(null);
  const [title, setTitle] = useState('');
  const move = (t: ProjectTask, c: Column) => { if (columnIndex(t) !== COLUMNS.findIndex((x) => x.key === c)) void data.patchTask(t.id, moveTo(c, new Date())); };
  const columnIndex = (t: ProjectTask) => COLUMNS.findIndex((x) => board[x.key].includes(t));

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const value = title.trim();
    setTitle('');
    await data.addTask(project.id, { title: value });
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {COLUMNS.map(({ key, label }, ci) => (
        <section
          key={key} aria-label={label}
          className={`card flex min-h-48 flex-col p-3 transition-colors duration-150 ${over === key ? 'outline outline-1 outline-brand' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(key); }}
          onDragLeave={() => setOver(null)}
          onDrop={(e) => {
            e.preventDefault(); setOver(null);
            const t = tasks.find((x) => x.id === e.dataTransfer.getData('text/plain'));
            if (t) move(t, key);
          }}
        >
          <div className="mb-3 flex items-center gap-2 px-1">
            <span className="label mr-auto">{label}</span>
            <span className="figure text-xs text-fg3">{board[key].length}</span>
          </div>
          <ul className="space-y-2">
            {board[key].map((t) => {
              const step = steps.find((s) => s.id === t.project_step_id);
              const day = taskDay(t);
              return (
                <li
                  key={t.id} draggable
                  onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; }}
                  className="cursor-grab rounded-xl border border-line bg-raised/60 p-3 active:cursor-grabbing"
                >
                  <button className={`block w-full text-left text-sm ${t.completed ? 'text-fg3 line-through' : ''}`} onClick={() => onOpen(t)}>{t.title}</button>
                  <div className="mt-2 flex items-center gap-2 text-xs text-fg3">
                    <span className={`h-1.5 w-1.5 rounded-full ${DOT[t.priority]}`} title={`Prioridade ${PRIORITY_LABEL[t.priority].toLowerCase()}`} />
                    {day && <span className={`figure ${!t.completed && day < today ? 'text-negative' : ''}`}>{short(day)}</span>}
                    {step && <span className="truncate"><Flag size={11} strokeWidth={1.5} className="mr-0.5 inline" />{step.title}</span>}
                    <span className="ml-auto flex gap-0.5">
                      {ci > 0 && <button className="icon-btn h-6 w-6" onClick={() => move(t, COLUMNS[ci - 1].key)} aria-label={`Mover ${t.title} para ${COLUMNS[ci - 1].label}`}><ChevronLeft size={14} strokeWidth={1.5} /></button>}
                      {ci < 2 && <button className="icon-btn h-6 w-6" onClick={() => move(t, COLUMNS[ci + 1].key)} aria-label={`Mover ${t.title} para ${COLUMNS[ci + 1].label}`}>{ci === 0 ? <Play size={12} strokeWidth={1.5} /> : <ChevronRight size={14} strokeWidth={1.5} />}</button>}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          {key === 'pending' && (
            <form onSubmit={add} className="mt-2 flex gap-1">
              <input className="input py-1.5 text-sm" placeholder="Nova tarefa" aria-label="Nova tarefa do projeto" value={title} onChange={(e) => setTitle(e.target.value)} />
              <button className="icon-btn" aria-label="Adicionar tarefa"><Plus size={16} strokeWidth={1.5} /></button>
            </form>
          )}
          {board[key].length === 0 && key !== 'pending' && <p className="px-1 py-6 text-center text-xs text-fg3">Arraste tarefas para cá</p>}
        </section>
      ))}
    </div>
  );
}

function TaskForm({ task, project, steps, data, onClose }: { task: Partial<ProjectTask>; project: Project; steps: Step[]; data: ProjectsData; onClose: () => void }) {
  const [title, setTitle] = useState(task.title ?? '');
  const [description, setDescription] = useState(task.description ?? '');
  const [priority, setPriority] = useState<Priority>(task.priority ?? 'medium');
  const [day, setDay] = useState(task.due_date ? toDay(new Date(task.due_date)) : '');
  const [stepId, setStepId] = useState(task.project_step_id ?? '');

  async function save(e: FormEvent) {
    e.preventDefault();
    const keepTime = task.due_date && !task.due_all_day && toDay(new Date(task.due_date)) === day;
    const row = {
      title, description: description || null, priority, project_step_id: stepId || null,
      due_date: keepTime ? task.due_date! : dueFromDay(day), due_all_day: keepTime ? false : !!day,
    };
    if (task.id) void data.patchTask(task.id, row);
    else await data.addTask(project.id, row);
    onClose();
  }
  async function remove() {
    if (task.id && confirm('Excluir esta tarefa?') && await write(supabase.from('tasks').delete().eq('id', task.id))) {
      void data.reload();
      onClose();
    }
  }
  return (
    <Modal title={task.id ? 'Tarefa do projeto' : 'Nova tarefa'} onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Título"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus /></Field>
        <Field label="Descrição"><textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Data"><input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
          <Field label="Prioridade">
            <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option>
            </select>
          </Field>
        </div>
        <Field label="Marco">
          <select className="input" value={stepId} onChange={(e) => setStepId(e.target.value)}>
            <option value="">Nenhum</option>
            {steps.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </Field>
        <p className="mb-4 text-xs text-fg3">As tarefas do projeto também aparecem em Tarefas e na Agenda quando têm data.</p>
        <div className="flex gap-2">
          {task.id && <button type="button" className="btn-ghost text-negative" onClick={remove}>Excluir</button>}
          <button className="btn-primary ml-auto">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

function Milestones({ project, tasks, steps, data, today }: { project: Project; tasks: ProjectTask[]; steps: Step[]; data: ProjectsData; today: string }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [editing, setEditing] = useState<Step | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (await write(supabase.from('project_steps').insert({ project_id: project.id, title, due_date: due || null, order_index: steps.length }))) {
      setTitle(''); setDue('');
      void data.steps.reload();
    }
  }
  function swap(i: number, j: number) {
    if (j < 0 || j >= steps.length) return;
    void data.patchStep(steps[i].id, { order_index: j });
    void data.patchStep(steps[j].id, { order_index: i });
    steps.forEach((s, k) => { if (k !== i && k !== j && s.order_index !== k) void data.patchStep(s.id, { order_index: k }); });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section className="card" aria-label="Marcos">
        {steps.length === 0 && <Empty icon={<Flag size={18} strokeWidth={1.5} />}>Marcos são as etapas do projeto, com data. Adicione o primeiro ao lado.</Empty>}
        <ol className="relative">
          {steps.map((s, i) => {
            const mine = tasks.filter((t) => t.project_step_id === s.id && !t.is_archived);
            const late = !s.completed && s.due_date && s.due_date < today;
            return (
              <li key={s.id} className="relative flex gap-3 pb-5 last:pb-0">
                {i < steps.length - 1 && <span className="absolute top-6 bottom-0 left-[9px] w-px bg-line" aria-hidden />}
                <input type="checkbox" className="relative mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]" checked={s.completed} aria-label={s.title}
                  onChange={() => data.patchStep(s.id, { completed: !s.completed, completed_at: s.completed ? null : new Date().toISOString() })} />
                <div className="min-w-0 flex-1">
                  <button className={`text-left text-sm hover:underline ${s.completed ? 'text-fg3 line-through' : ''}`} onClick={() => setEditing(s)}>{s.title}</button>
                  <div className="figure text-xs text-fg3">
                    {s.due_date ? <span className={late ? 'text-negative' : ''}>{sentence(formatDay(s.due_date))}</span> : 'sem data'}
                    {mine.length > 0 && ` · ${mine.filter((t) => t.completed).length}/${mine.length} tarefas`}
                  </div>
                  {s.description && <p className="mt-1 text-sm text-fg2">{s.description}</p>}
                </div>
                <div className="flex shrink-0">
                  <button className="icon-btn h-7 w-7" disabled={i === 0} onClick={() => swap(i, i - 1)} aria-label={`Subir ${s.title}`}><ArrowUp size={14} strokeWidth={1.5} /></button>
                  <button className="icon-btn h-7 w-7" disabled={i === steps.length - 1} onClick={() => swap(i, i + 1)} aria-label={`Descer ${s.title}`}><ArrowDown size={14} strokeWidth={1.5} /></button>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
      <form className="card h-fit" onSubmit={add}>
        <div className="label mb-3">Novo marco</div>
        <Field label="Título do marco"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required /></Field>
        <Field label="Data do marco (opcional)"><input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <button className="btn-primary w-full">Adicionar marco</button>
      </form>
      {editing && <StepForm step={editing} data={data} onClose={() => setEditing(null)} />}
    </div>
  );
}

function StepForm({ step, data, onClose }: { step: Step; data: ProjectsData; onClose: () => void }) {
  const [title, setTitle] = useState(step.title);
  const [description, setDescription] = useState(step.description ?? '');
  const [due, setDue] = useState(step.due_date ?? '');
  return (
    <Modal title="Editar marco" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); void data.patchStep(step.id, { title, description: description || null, due_date: due || null }); onClose(); }}>
        <Field label="Título"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus /></Field>
        <Field label="Descrição"><textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Data"><input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost text-negative" onClick={async () => {
            if (confirm('Excluir este marco? As tarefas dele continuam no projeto.') && await write(supabase.from('project_steps').delete().eq('id', step.id))) {
              void data.reload(); onClose();
            }
          }}>Excluir</button>
          <button className="btn-primary ml-auto">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Trajectory
// ---------------------------------------------------------------------------

const KIND: Record<string, string> = { start: 'Início', task: 'Tarefa concluída', step: 'Marco atingido', due: 'Prazo' };

function Trail({ project, tasks, steps, today }: { project: Project; tasks: ProjectTask[]; steps: Step[]; today: string }) {
  const weeks = burnup(tasks, today, 8);
  const events = trajectory(project, tasks, steps);
  const upcoming = steps.filter((s) => !s.completed && s.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <ColumnChart title="Tarefas feitas (acumulado)" subtitle="Por semana; a dica mostra o total de tarefas no projeto"
          points={weeks.map((w) => ({ label: short(w.week), value: w.done, detail: `de ${w.scope} no escopo` }))} unit="tarefas" />
        {upcoming.length > 0 && (
          <section className="card">
            <div className="label mb-3">Próximos marcos</div>
            <ul className="space-y-2 text-sm">
              {upcoming.map((s) => {
                const d = diffDays(today, s.due_date!);
                return (
                  <li key={s.id} className="flex gap-2">
                    <span className="mr-auto">{s.title}</span>
                    <span className={`figure text-xs ${d < 0 ? 'text-negative' : 'text-fg3'}`}>{d < 0 ? `${-d} dias atrasado` : d === 0 ? 'hoje' : `em ${d} dias`}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
      <section className="card h-fit" aria-label="Linha do tempo">
        <div className="label mb-3">Linha do tempo</div>
        <ol className="space-y-3">
          {events.map((e, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${e.kind === 'step' ? 'bg-brand' : e.kind === 'start' ? 'bg-fg2' : 'bg-positive'}`} />
              <div className="min-w-0">
                <div className="truncate">{e.title}</div>
                <div className="text-xs text-fg3">{KIND[e.kind]} · {sentence(formatDay(toDay(new Date(e.at))))}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
