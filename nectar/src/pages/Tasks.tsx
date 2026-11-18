import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckSquare, Repeat } from 'lucide-react';
import { Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTable, write } from '../lib/useTable';
import { bucketTasks, PRIORITY_LABEL, taskStats, type Priority, type Task } from '../lib/tasks';
import { formatDay, formatTime, toDay, weekday, weekdayShort } from '../lib/dates';
import { Empty, Field, FieldGroup, ListSkeleton, Modal, PageHeader, Stat, WeekdayPicker } from '../components/ui';

const TABS = ['Hoje', 'Tarefas', 'Recorrentes', 'Análise'] as const;
type Tab = (typeof TABS)[number];

interface Tag { id: string; name: string; color: string }
interface Template {
  id: string; title: string; description: string | null; priority: Priority; tags: string[];
  recurrence_days: number[]; time_of_day: string | null; start_date: string; end_date: string | null; is_active: boolean;
}

const PRIORITY_DOT: Record<Priority, string> = { high: 'bg-negative', medium: 'bg-brand', low: 'bg-fg3' };

export default function Tasks() {
  const [tab, setTab] = useState<Tab>('Hoje');
  const tasks = useTable<Task>('tasks', '*', { column: 'due_date' });
  const tags = useTable<Tag>('task_tags', '*', { column: 'name' });
  const templates = useTable<Template>('task_recurring_templates', '*', { column: 'created_at' });
  const [editing, setEditing] = useState<Partial<Task> | null>(null);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const now = new Date();

  useGenerateRecurring(templates.rows, tasks.reload);

  const visible = useMemo(() => tasks.rows.filter((t) =>
    (!tagFilter || t.tags.includes(tagFilter)) &&
    (!search || t.title.toLowerCase().includes(search.toLowerCase()))), [tasks.rows, tagFilter, search]);
  const buckets = bucketTasks(visible, now);
  const stats = taskStats(tasks.rows, now);

  async function toggle(task: Task) {
    const completed = !task.completed;
    tasks.setRows((rows) => rows.map((t) => (t.id === task.id ? { ...t, completed } : t)));
    await write(supabase.from('tasks').update({
      completed, status: completed ? 'completed' : 'pending', completed_at: completed ? new Date().toISOString() : null,
    }).eq('id', task.id));
    void tasks.reload();
  }

  const list = (title: string, items: Task[], tone = '') => items.length > 0 && (
    <section className="mb-4">
      <div className={`label mb-2 flex gap-2 ${tone}`}>{title}<span className="figure text-fg3">{items.length}</span></div>
      <ul className="card divide-y divide-line p-0">
        {items.map((t) => <TaskRow key={t.id} task={t} tags={tags.rows} onToggle={() => toggle(t)} onOpen={() => setEditing(t)} />)}
      </ul>
    </section>
  );

  return (
    <>
      <PageHeader
        title="Tarefas"
        subtitle={formatDay(toDay(now))}
        tabs={TABS}
        tab={tab}
        onTab={(t) => setTab(t as Tab)}
        action={<button className="btn-primary" onClick={() => setEditing({})}><Plus size={16} strokeWidth={1.5} />Nova tarefa</button>}
      />
      {tasks.error && <p className="mb-4 text-sm text-negative">{tasks.error}</p>}

      {tab === 'Hoje' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <div>
            <div className="card mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Abertas" value={stats.open} />
              <Stat label="Atrasadas" value={stats.overdue} />
              <Stat label="Para hoje" value={stats.dueToday} />
              <Stat label="Feitas hoje" value={stats.completedToday} />
            </div>
            {list('Atrasadas', buckets.overdue, 'text-negative')}
            {list('Hoje', buckets.today)}
            {tasks.loading ? <ListSkeleton /> : !buckets.overdue.length && !buckets.today.length && <div className="card mb-4"><Empty icon={<CheckSquare size={18} strokeWidth={1.5} />}>Nada atrasado nem para hoje</Empty></div>}
            {list('Feitas hoje', buckets.done.filter((t) => t.completed_at && toDay(new Date(t.completed_at)) === toDay(now)), 'text-positive')}
          </div>
          <PriorityCard stats={stats} />
        </div>
      )}

      {tab === 'Tarefas' && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <input className="input max-w-xs" placeholder="Buscar tarefa" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className={tagFilter ? 'tab' : 'tab-active'} onClick={() => setTagFilter(null)}>Todas</button>
            {tags.rows.map((g) => (
              <button key={g.id} className={tagFilter === g.name ? 'tab-active' : 'tab'} onClick={() => setTagFilter(g.name)}>
                <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: g.color }} />{g.name}
              </button>
            ))}
          </div>
          {list('Atrasadas', buckets.overdue, 'text-negative')}
          {list('Hoje', buckets.today)}
          {list('Próximas', buckets.upcoming)}
          {list('Sem data', buckets.noDate)}
          {list('Concluídas', buckets.done.slice(0, 30), 'text-positive')}
          {tasks.loading ? <ListSkeleton /> : !visible.length && <div className="card"><Empty icon={<CheckSquare size={18} strokeWidth={1.5} />} action={<button className="btn-secondary" onClick={() => setEditing({})}>Nova tarefa</button>}>{search || tagFilter ? 'Nenhuma tarefa com esse filtro' : 'Nenhuma tarefa ainda'}</Empty></div>}
        </>
      )}

      {tab === 'Recorrentes' && <RecurringTab templates={templates.rows} reload={templates.reload} />}

      {tab === 'Análise' && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="card">
            <div className="label mb-4">Concluídas nos últimos 7 dias</div>
            <div className="flex h-40 items-end gap-2">
              {stats.completedLast7.map((d) => {
                const max = Math.max(1, ...stats.completedLast7.map((x) => x.count));
                return (
                  <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-xs text-fg3">{d.count}</span>
                    <div className="w-full rounded-t bg-brand" style={{ height: `${(d.count / max) * 100}%`, minHeight: 2 }} />
                    <span className="text-xs text-fg3">{weekdayShort(weekday(d.day))}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <PriorityCard stats={stats} />
        </div>
      )}

      {editing && (
        <TaskForm
          task={editing}
          tags={tags.rows}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void tasks.reload(); void tags.reload(); }}
        />
      )}
    </>
  );
}

function PriorityCard({ stats }: { stats: ReturnType<typeof taskStats> }) {
  return (
    <div className="card h-fit">
      <div className="label mb-3">Abertas por prioridade</div>
      {(['high', 'medium', 'low'] as Priority[]).map((p) => (
        <div key={p} className="mb-2 flex items-center gap-2 text-sm">
          <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT[p]}`} />
          <span className="w-14">{PRIORITY_LABEL[p]}</span>
          <div className="h-1.5 flex-1 rounded bg-raised">
            <div className={`h-1.5 rounded ${PRIORITY_DOT[p]}`} style={{ width: `${stats.open ? (stats.openByPriority[p] / stats.open) * 100 : 0}%` }} />
          </div>
          <span className="w-6 text-right">{stats.openByPriority[p]}</span>
        </div>
      ))}
    </div>
  );
}

function TaskRow({ task, tags, onToggle, onOpen }: { task: Task; tags: Tag[]; onToggle: () => void; onOpen: () => void }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <input type="checkbox" className="h-4 w-4" checked={task.completed} onChange={onToggle} aria-label={`Concluir ${task.title}`} />
      <button className="min-w-0 flex-1 text-left" onClick={onOpen}>
        <div className={`truncate text-sm ${task.completed ? 'text-fg3 line-through' : ''}`}>{task.title}</div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-fg3">
          <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[task.priority]}`} />
          {task.due_date && <span>{formatDay(toDay(new Date(task.due_date)))}{!task.due_all_day && ` · ${formatTime(task.due_date)}`}</span>}
          {task.tags.map((name) => {
            const tag = tags.find((g) => g.name === name);
            return <span key={name} className="rounded px-1.5" style={{ background: `${tag?.color ?? '#64748b'}22`, color: tag?.color ?? '#64748b' }}>{name}</span>;
          })}
        </div>
      </button>
    </li>
  );
}

function TaskForm({ task, tags, onClose, onSaved }: { task: Partial<Task>; tags: Tag[]; onClose: () => void; onSaved: () => void }) {
  const due = task.due_date ? new Date(task.due_date) : null;
  const [title, setTitle] = useState(task.title ?? '');
  const [description, setDescription] = useState(task.description ?? '');
  const [priority, setPriority] = useState<Priority>(task.priority ?? 'medium');
  const [date, setDate] = useState(due ? toDay(due) : '');
  const [time, setTime] = useState(due && !task.due_all_day ? formatTime(task.due_date!) : '');
  const [selected, setSelected] = useState<string[]>(task.tags ?? []);
  const [newTag, setNewTag] = useState('');

  async function save(e: FormEvent) {
    e.preventDefault();
    let due_date: string | null = null;
    if (date) {
      const [y, m, d] = date.split('-').map(Number);
      const [hh, mm] = (time || '23:59').split(':').map(Number);
      due_date = new Date(y, m - 1, d, hh, mm).toISOString();
    }
    const allTags = [...selected];
    if (newTag.trim()) {
      const name = newTag.trim();
      if (!tags.some((g) => g.name === name)) await write(supabase.from('task_tags').insert({ name }));
      if (!allTags.includes(name)) allTags.push(name);
    }
    const row = { title, description: description || null, priority, due_date, due_all_day: !!date && !time, tags: allTags };
    const ok = task.id
      ? await write(supabase.from('tasks').update(row).eq('id', task.id))
      : await write(supabase.from('tasks').insert(row));
    if (ok) onSaved();
  }

  async function remove() {
    if (task.id && confirm('Excluir esta tarefa?') && await write(supabase.from('tasks').delete().eq('id', task.id))) onSaved();
  }

  return (
    <Modal title={task.id ? 'Editar tarefa' : 'Nova tarefa'} onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Título"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus /></Field>
        <Field label="Descrição"><textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Data"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Hora (opcional)"><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!date} /></Field>
        </div>
        <Field label="Prioridade">
          <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {(['high', 'medium', 'low'] as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select>
        </Field>
        <Field label="Tags">
          <div className="mb-2 flex flex-wrap gap-1">
            {tags.map((g) => {
              const on = selected.includes(g.name);
              return (
                <button type="button" key={g.id} className={on ? 'tab-active' : 'tab'}
                  onClick={() => setSelected(on ? selected.filter((n) => n !== g.name) : [...selected, g.name])}>{g.name}</button>
              );
            })}
          </div>
          <input className="input" placeholder="Nova tag" value={newTag} onChange={(e) => setNewTag(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          {task.id && <button type="button" className="btn-ghost text-negative" onClick={remove}>Excluir</button>}
          <button className="btn-primary ml-auto">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

/** Creates today's task for each active recurring template, once. */
function useGenerateRecurring(templates: Template[], reload: () => Promise<void>) {
  useEffect(() => {
    if (!templates.length) return;
    const today = toDay(new Date());
    const due = templates.filter((t) => t.is_active && t.start_date <= today && (!t.end_date || t.end_date >= today) &&
      (t.recurrence_days.length === 0 || t.recurrence_days.includes(weekday(today))));
    if (!due.length) return;
    (async () => {
      const { data } = await supabase.from('task_recurrences').select('recurring_template_id').eq('generated_date', today);
      const done = new Set((data ?? []).map((r: { recurring_template_id: string }) => r.recurring_template_id));
      let created = false;
      for (const t of due.filter((x) => !done.has(x.id))) {
        const [y, m, d] = today.split('-').map(Number);
        const [hh, mm] = (t.time_of_day ?? '23:59').split(':').map(Number);
        const { data: task } = await supabase.from('tasks').insert({
          title: t.title, description: t.description, priority: t.priority, tags: t.tags,
          due_date: new Date(y, m - 1, d, hh, mm).toISOString(), due_all_day: !t.time_of_day,
        }).select('id').single();
        if (task) {
          // The unique key stops a second tab from generating the same day twice.
          const { error } = await supabase.from('task_recurrences').insert({ recurring_template_id: t.id, task_id: task.id, generated_date: today });
          if (error) await supabase.from('tasks').delete().eq('id', task.id);
          else created = true;
        }
      }
      if (created) await reload();
    })();
  }, [templates, reload]);
}

function RecurringTab({ templates, reload }: { templates: Template[]; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<Partial<Template> | null>(null);
  return (
    <>
      <div className="mb-4 flex"><button className="btn-primary ml-auto" onClick={() => setEditing({})}><Plus size={16} strokeWidth={1.5} />Nova recorrente</button></div>
      {templates.length === 0 && <div className="card"><Empty icon={<Repeat size={18} strokeWidth={1.5} />}>Nenhuma tarefa recorrente. Ela aparece sozinha em Hoje nos dias escolhidos</Empty></div>}
      <ul className="grid gap-2">
        {templates.map((t) => (
          <li key={t.id}>
            <button className="card flex w-full items-center gap-3 text-left" onClick={() => setEditing(t)}>
              <div className="flex-1">
                <div className={t.is_active ? '' : 'text-fg3'}>{t.title}</div>
                <div className="text-xs text-fg3">
                  {t.recurrence_days.length ? t.recurrence_days.map(weekdayShort).join(', ') : 'todo dia'}
                  {t.time_of_day && ` · ${t.time_of_day.slice(0, 5)}`}{!t.is_active && ' · pausada'}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
      {editing && <TemplateForm template={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} />}
    </>
  );
}

function TemplateForm({ template, onClose, onSaved }: { template: Partial<Template>; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(template.title ?? '');
  const [days, setDays] = useState<number[]>(template.recurrence_days ?? []);
  const [time, setTime] = useState(template.time_of_day?.slice(0, 5) ?? '');
  const [priority, setPriority] = useState<Priority>(template.priority ?? 'medium');
  const [active, setActive] = useState(template.is_active ?? true);

  async function save(e: FormEvent) {
    e.preventDefault();
    const row = { title, recurrence_days: days, time_of_day: time || null, priority, is_active: active };
    const ok = template.id
      ? await write(supabase.from('task_recurring_templates').update(row).eq('id', template.id))
      : await write(supabase.from('task_recurring_templates').insert(row));
    if (ok) onSaved();
  }
  async function remove() {
    if (template.id && confirm('Excluir esta recorrência? As tarefas já criadas ficam.') &&
      await write(supabase.from('task_recurring_templates').delete().eq('id', template.id))) onSaved();
  }

  return (
    <Modal title={template.id ? 'Editar recorrente' : 'Nova recorrente'} onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Título"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus /></Field>
        <FieldGroup label="Dias (nenhum = todo dia)"><WeekdayPicker value={days} onChange={setDays} /></FieldGroup>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Hora (opcional)"><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
          <Field label="Prioridade">
            <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {(['high', 'medium', 'low'] as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
          </Field>
        </div>
        <label className="mb-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Ativa</label>
        <div className="flex gap-2">
          {template.id && <button type="button" className="btn-ghost text-negative" onClick={remove}>Excluir</button>}
          <button className="btn-primary ml-auto">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}
