-- Schema for every module of the app. Each table belongs to one user and is
-- protected by row level security: a user reads and writes only their rows.

create extension if not exists pgcrypto;

-- Keeps updated_at current on every update.
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
create table public.user_settings (
  user_id uuid primary key references auth.users on delete cascade default auth.uid(),
  display_name text,
  timezone text not null default 'America/Sao_Paulo',
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  reminders_advance_minutes int[] not null default '{15}',
  tasks_advance_minutes int[] not null default '{30}',
  habits_digest_time time not null default '08:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------
create table public.task_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  name text not null,
  color text not null default '#64748b',
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  title text not null,
  description text,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed')),
  completed boolean not null default false,
  completed_at timestamptz,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  due_date timestamptz,
  due_all_day boolean not null default false,
  tags text[] not null default '{}',
  is_archived boolean not null default false,
  project_step_id uuid,
  position int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_user_due on public.tasks (user_id, due_date);

-- A template that generates one task on each matching day.
create table public.task_recurring_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  title text not null,
  description text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  tags text[] not null default '{}',
  -- 0 = Sunday ... 6 = Saturday. Empty means every day.
  recurrence_days int[] not null default '{}',
  time_of_day time,
  start_date date not null default current_date,
  end_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.task_recurrences (
  id uuid primary key default gen_random_uuid(),
  recurring_template_id uuid not null references public.task_recurring_templates on delete cascade,
  task_id uuid not null references public.tasks on delete cascade,
  generated_date date not null,
  unique (recurring_template_id, generated_date)
);

-- ---------------------------------------------------------------------------
-- Habits and health
-- ---------------------------------------------------------------------------
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  name text not null,
  description text,
  -- boolean: done or not. quantity/duration: done when value reaches target.
  -- measurable: logs a value (km, kg...); done when any value is logged.
  habit_type text not null default 'boolean' check (habit_type in ('boolean', 'quantity', 'duration', 'measurable')),
  unit text not null default 'vezes',
  target_value numeric default 1,
  monthly_goal int not null default 30,
  -- 0 = Sunday ... 6 = Saturday. Null means every day.
  schedule_days int[],
  schedule_time time,
  color text not null default '#0ea5e9',
  metric_config jsonb not null default '{}',
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.habit_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  habit_id uuid not null references public.habits on delete cascade,
  completed_date date not null,
  value numeric not null default 1,
  metric_values jsonb not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  unique (habit_id, completed_date)
);

create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  measured_at timestamptz not null default now(),
  metric text not null,
  value numeric not null,
  source text not null default 'manual',
  notes text
);

create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  name text not null,
  modality text not null default 'strength',
  habit_id uuid references public.habits on delete set null,
  is_active boolean not null default true,
  started_at date not null default current_date,
  ended_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workout_plan_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  plan_id uuid not null references public.workout_plans on delete cascade,
  label text not null,
  modality text,
  weekdays int[] not null default '{}',
  order_index int not null default 0,
  target_distance_m int,
  target_duration_s int,
  target_pace text,
  notes text
);

create table public.workout_plan_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  session_id uuid not null references public.workout_plan_sessions on delete cascade,
  name text not null,
  muscle_group text,
  sets int,
  reps text,
  load_kg numeric,
  order_index int not null default 0
);

create table public.diet_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  name text not null,
  kcal_rest int,
  kcal_training int,
  protein_g int,
  carbs_g int,
  fat_g int,
  is_active boolean not null default true,
  started_at date not null default current_date,
  ended_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.diet_plan_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  plan_id uuid not null references public.diet_plans on delete cascade,
  name text not null,
  time_of_day time,
  description text,
  order_index int not null default 0
);

-- ---------------------------------------------------------------------------
-- Reminders
-- ---------------------------------------------------------------------------
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  title text not null,
  datetime timestamptz not null,
  completed boolean not null default false,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  alarm_enabled boolean not null default false,
  recurring_template_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reminders_user_datetime on public.reminders (user_id, datetime);

create table public.reminder_recurring_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  title text not null,
  time_of_day time not null,
  -- 0 = Sunday ... 6 = Saturday. Empty means every day.
  recurrence_days int[] not null default '{}',
  start_date date not null default current_date,
  end_date date,
  alarm_enabled boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reminders
  add constraint reminders_template_fk foreign key (recurring_template_id)
  references public.reminder_recurring_templates on delete set null;

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  name text not null,
  description text,
  status text not null default 'active' check (status in ('planning', 'active', 'paused', 'completed')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  progress int not null default 0 check (progress between 0 and 100),
  due_date date,
  is_template boolean not null default false,
  template_source_id uuid references public.projects on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  project_id uuid not null references public.projects on delete cascade,
  title text not null,
  due_date date,
  completed boolean not null default false,
  order_index int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.tasks
  add constraint tasks_step_fk foreign key (project_step_id)
  references public.project_steps on delete set null;

create table public.project_tasks (
  project_id uuid not null references public.projects on delete cascade,
  task_id uuid not null references public.tasks on delete cascade,
  position int not null default 0,
  primary key (project_id, task_id)
);

create table public.project_tags (
  project_id uuid not null references public.projects on delete cascade,
  tag_id uuid not null references public.task_tags on delete cascade,
  primary key (project_id, tag_id)
);

-- ---------------------------------------------------------------------------
-- Goals
-- ---------------------------------------------------------------------------
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  title text not null,
  goal_type text not null default 'custom' check (goal_type in ('financial', 'habit', 'project', 'custom')),
  status text not null default 'active' check (status in ('active', 'completed', 'paused')),
  target_value numeric,
  current_value numeric not null default 0,
  progress int not null default 0 check (progress between 0 and 100),
  start_date date not null default current_date,
  target_date date,
  linked_habit_id uuid references public.habits on delete set null,
  linked_project_id uuid references public.projects on delete set null,
  cover_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Finances
-- ---------------------------------------------------------------------------
create table public.banks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  name text not null,
  initial_balance numeric(14, 2) not null default 0,
  color text,
  created_at timestamptz not null default now()
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  bank_id uuid references public.banks on delete set null,
  name text not null,
  card_type text not null default 'credit' check (card_type in ('credit', 'debit')),
  credit_limit numeric(14, 2),
  closing_day int check (closing_day between 1 and 31),
  due_day int check (due_day between 1 and 31),
  created_at timestamptz not null default now()
);

create table public.installment_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  card_id uuid references public.cards on delete set null,
  description text not null,
  category text,
  subcategory text,
  total_amount numeric(14, 2) not null,
  installments_count int not null check (installments_count > 0),
  first_installment_date date not null,
  status text not null default 'active' check (status in ('active', 'finished', 'cancelled')),
  created_at timestamptz not null default now()
);

create table public.transaction_recurring_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  description text not null,
  type text not null check (type in ('income', 'expense')),
  amount numeric(14, 2) not null,
  category text,
  payment_method text,
  bank_id uuid references public.banks on delete set null,
  card_id uuid references public.cards on delete set null,
  -- Days of the month the charge falls on.
  recurrence_days int[] not null default '{1}',
  start_date date not null default current_date,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  description text not null,
  type text not null check (type in ('income', 'expense')),
  amount numeric(14, 2) not null check (amount >= 0),
  date date not null default current_date,
  category text,
  subcategory text,
  payment_method text,
  bank_id uuid references public.banks on delete set null,
  card_id uuid references public.cards on delete set null,
  is_pending boolean not null default false,
  installment_purchase_id uuid references public.installment_purchases on delete cascade,
  installment_number int,
  is_advance_payment boolean not null default false,
  recurring_template_id uuid references public.transaction_recurring_templates on delete set null,
  created_at timestamptz not null default now()
);
create index transactions_user_date on public.transactions (user_id, date);

create table public.transaction_recurring_skips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  recurring_template_id uuid not null references public.transaction_recurring_templates on delete cascade,
  skipped_date date not null,
  unique (recurring_template_id, skipped_date)
);

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  from_bank_id uuid not null references public.banks on delete cascade,
  to_bank_id uuid not null references public.banks on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  date date not null default current_date,
  description text,
  check (from_bank_id <> to_bank_id)
);

create table public.card_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  card_id uuid not null references public.cards on delete cascade,
  year int not null,
  month int not null check (month between 1 and 12),
  amount numeric(14, 2) not null,
  paid_at date not null default current_date,
  bank_id uuid references public.banks on delete set null,
  unique (card_id, year, month)
);

-- ---------------------------------------------------------------------------
-- Knowledge, diary and captures
-- ---------------------------------------------------------------------------
create table public.knowledge_areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  name text not null,
  emoji text,
  color text,
  description text,
  parent_area_id uuid references public.knowledge_areas on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.knowledge_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  area_id uuid references public.knowledge_areas on delete set null,
  title text not null,
  content jsonb not null default '[]',
  content_text text not null default '',
  summary text,
  tags text[] not null default '{}',
  importance int not null default 3 check (importance between 1 and 5),
  is_pinned boolean not null default false,
  is_favorite boolean not null default false,
  source_type text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.knowledge_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  source_block_id uuid not null references public.knowledge_blocks on delete cascade,
  target_block_id uuid not null references public.knowledge_blocks on delete cascade,
  connection_type text not null default 'related',
  description text,
  strength numeric not null default 0.5,
  auto_generated boolean not null default false,
  unique (source_block_id, target_block_id)
);

create table public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  date date not null default current_date,
  title text,
  content text not null default '',
  mood int check (mood between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.brain_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  title text,
  content text not null,
  summary text,
  processed_into text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Assistant: chat history and automations
-- ---------------------------------------------------------------------------
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  content text not null,
  is_user boolean not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  title text not null,
  prompt text not null,
  -- Days of the week (0 = Sunday) and time the automation runs.
  weekdays int[] not null default '{}',
  time_of_day time not null,
  is_active boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers and row level security for every table
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'user_settings', 'tasks', 'task_recurring_templates', 'habits', 'workout_plans',
    'diet_plans', 'reminders', 'reminder_recurring_templates', 'projects', 'project_steps',
    'goals', 'transaction_recurring_templates', 'knowledge_areas', 'knowledge_blocks',
    'diary_entries', 'brain_entries', 'automations'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',
      t || '_touch', t);
  end loop;

  -- Tables with their own user_id column.
  foreach t in array array[
    'user_settings', 'task_tags', 'tasks', 'task_recurring_templates', 'habits',
    'habit_completions', 'body_measurements', 'workout_plans', 'workout_plan_sessions',
    'workout_plan_exercises', 'diet_plans', 'diet_plan_meals', 'reminders',
    'reminder_recurring_templates', 'projects', 'project_steps', 'goals', 'banks', 'cards',
    'installment_purchases', 'transaction_recurring_templates', 'transactions',
    'transaction_recurring_skips', 'transfers', 'card_invoice_payments', 'knowledge_areas',
    'knowledge_blocks', 'knowledge_connections', 'diary_entries', 'brain_entries',
    'chat_messages', 'automations'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_owner', t);
  end loop;
end $$;

-- Link tables have no user_id: they are visible when the parent row is.
alter table public.task_recurrences enable row level security;
create policy task_recurrences_owner on public.task_recurrences for all to authenticated
  using (exists (select 1 from public.task_recurring_templates r
                 where r.id = recurring_template_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.task_recurring_templates r
                      where r.id = recurring_template_id and r.user_id = auth.uid()));

alter table public.project_tasks enable row level security;
create policy project_tasks_owner on public.project_tasks for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

alter table public.project_tags enable row level security;
create policy project_tags_owner on public.project_tags for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
