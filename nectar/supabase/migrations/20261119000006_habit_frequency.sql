-- Habits that are done N times a week on any days, and a manual order.
alter table public.habits
  add column frequency text not null default 'days' check (frequency in ('days', 'weekly')),
  add column times_per_week int check (times_per_week between 1 and 7),
  add column sort_order int not null default 0,
  add constraint habits_weekly_needs_count check (frequency = 'days' or times_per_week is not null);
