-- Autonomous assistant: user-selected AI model (default Claude Sonnet 4 via OpenRouter)
-- and persistent assistant memories for continuous learning with the user.

alter table public.user_settings
  add column if not exists assistant_model text not null default 'anthropic/claude-sonnet-4';

create table if not exists public.assistant_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null default 'preferencia'
    check (category in ('rotina', 'financas', 'saude', 'projetos', 'preferencia', 'aprendizado')),
  content text not null,
  source text not null default 'assistant'
    check (source in ('assistant', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assistant_memories_user_updated_idx
  on public.assistant_memories (user_id, updated_at desc);

alter table public.assistant_memories enable row level security;

drop policy if exists own on public.assistant_memories;
create policy own on public.assistant_memories
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
