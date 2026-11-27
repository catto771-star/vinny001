-- Phase 3: Cross-module integrations
-- [4] Multi-currency & multi-account Financial Goals + explicit progress basis
-- [5] Projects linked to Knowledge notes & Finance transactions + optional budget
-- [6] Timeboxing in Agenda (events linked to tasks)

-- 1. Goals: currency, multiple linked bank accounts, and progress_from_zero toggle
alter table public.goals
  add column if not exists currency text not null default 'BRL'
    check (currency in ('BRL', 'USD', 'EUR'));

alter table public.goals
  add column if not exists linked_bank_ids uuid[] not null default '{}';

alter table public.goals
  add column if not exists progress_from_zero boolean;

-- Backfill existing single linked_bank_id into linked_bank_ids
update public.goals
  set linked_bank_ids = array[linked_bank_id]
  where linked_bank_id is not null
    and cardinality(linked_bank_ids) = 0;

-- 2. Projects: optional budget & currency
alter table public.projects
  add column if not exists budget numeric;

alter table public.projects
  add column if not exists budget_currency text not null default 'BRL'
    check (budget_currency in ('BRL', 'USD', 'EUR'));

-- 3. Knowledge blocks & Transactions linked to a Project
alter table public.knowledge_blocks
  add column if not exists project_id uuid references public.projects(id) on delete set null;

create index if not exists idx_knowledge_blocks_project_id
  on public.knowledge_blocks(user_id, project_id)
  where project_id is not null;

alter table public.transactions
  add column if not exists project_id uuid references public.projects(id) on delete set null;

create index if not exists idx_transactions_project_id
  on public.transactions(user_id, project_id)
  where project_id is not null;

-- 4. Events linked to a Task for Agenda timeboxing
alter table public.events
  add column if not exists task_id uuid references public.tasks(id) on delete set null;

create index if not exists idx_events_task_id
  on public.events(user_id, task_id)
  where task_id is not null;
