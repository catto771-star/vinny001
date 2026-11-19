-- Projects: a start date and color; milestones record when they were done and,
-- in templates, how many days after the start they fall. A template keeps its
-- tasks here, so they never show up in the task list.
alter table public.projects
  add column start_date date not null default current_date,
  add column color text not null default '#ea580c',
  add column template_tasks jsonb not null default '[]';

alter table public.project_steps
  add column description text,
  add column completed_at timestamptz,
  add column offset_days int check (offset_days >= 0);
