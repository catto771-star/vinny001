import { useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useTable, write } from '../../lib/useTable';
import { serialQueue } from '../../lib/serial';
import type { Project, ProjectTask, Step } from '../../lib/projects';

export interface Link { project_id: string; task_id: string; position: number }

const TASK_COLUMNS = 'id,title,description,status,completed,completed_at,priority,due_date,due_all_day,tags,is_archived,created_at,project_step_id,position';

/** Everything the project screens read, with optimistic updates written in order. */
export function useProjects() {
  const projects = useTable<Project>('projects', '*', { column: 'created_at' });
  const steps = useTable<Step>('project_steps', '*', { column: 'order_index' });
  const links = useTable<Link>('project_tasks', 'project_id,task_id,position');
  const tasks = useTable<ProjectTask & { position?: number | null }>('tasks', TASK_COLUMNS);
  const queue = useRef(serialQueue()).current;

  const tasksOf = (projectId: string) => {
    const ids = new Set(links.rows.filter((l) => l.project_id === projectId).map((l) => l.task_id));
    return tasks.rows.filter((t) => ids.has(t.id));
  };
  const stepsOf = (projectId: string) => steps.rows.filter((s) => s.project_id === projectId).sort((a, b) => a.order_index - b.order_index);

  async function reload() {
    await Promise.all([projects.reload(), steps.reload(), links.reload(), tasks.reload()]);
  }

  function patchTask(id: string, patch: Partial<ProjectTask>) {
    tasks.setRows((rows) => rows.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    return queue(() => write(supabase.from('tasks').update(patch).eq('id', id)));
  }
  function patchStep(id: string, patch: Partial<Step>) {
    steps.setRows((rows) => rows.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    return queue(() => write(supabase.from('project_steps').update(patch).eq('id', id)));
  }
  function patchProject(id: string, patch: Partial<Project>) {
    projects.setRows((rows) => rows.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    return queue(() => write(supabase.from('projects').update(patch).eq('id', id)));
  }

  /** Creates a task inside a project. */
  async function addTask(projectId: string, row: Partial<ProjectTask>) {
    const { data, error } = await supabase.from('tasks').insert(row).select('id').single();
    if (error || !data) { alert(`Não foi possível salvar: ${error?.message}`); return null; }
    const ok = await write(supabase.from('project_tasks').insert({ project_id: projectId, task_id: data.id }));
    await Promise.all([tasks.reload(), links.reload()]);
    return ok ? data.id as string : null;
  }

  return { projects, steps, links, tasks, tasksOf, stepsOf, reload, patchTask, patchStep, patchProject, addTask, queue };
}

export type ProjectsData = ReturnType<typeof useProjects>;

/** A day as the timestamp the task screens store: 23:59 local, all day. */
export function dueFromDay(day: string): string | null {
  if (!day) return null;
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59).toISOString();
}
