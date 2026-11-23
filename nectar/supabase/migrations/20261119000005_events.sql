-- Appointments of the agenda. A later step can mirror Google Calendar into it.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz,
  all_day boolean not null default false,
  location text,
  notes text,
  source text not null default 'manual',
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at is null or end_at >= start_at)
);
create index events_user_start on public.events (user_id, start_at);

create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();

alter table public.events enable row level security;
create policy events_owner on public.events for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
