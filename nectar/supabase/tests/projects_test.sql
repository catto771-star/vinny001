-- Project milestones and links stay with their owner.
\set ON_ERROR_STOP on
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'b1@test'),
  ('00000000-0000-0000-0000-0000000000b2', 'b2@test') on conflict do nothing;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into public.projects (id, name, is_template, template_tasks)
  values ('00000000-0000-0000-0000-00000000b0b1', 'Mudança', true, '[{"title":"Orçar frete","step":0}]');
insert into public.project_steps (project_id, title, offset_days) values ('00000000-0000-0000-0000-00000000b0b1', 'Embalar', 7);
do $$
begin
  insert into public.project_steps (project_id, title, offset_days) values ('00000000-0000-0000-0000-00000000b0b1', 'Antes', -1);
  raise exception 'a negative offset was accepted';
exception when check_violation then null;
end $$;
do $$
begin
  if (select start_date from public.projects where name = 'Mudança') <> current_date then raise exception 'start_date default'; end if;
end $$;
-- Another user cannot see the project nor hang a task on it.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$
begin
  if exists (select 1 from public.projects) or exists (select 1 from public.project_steps) then raise exception 'project leaked'; end if;
end $$;
insert into public.tasks (id, title) values ('00000000-0000-0000-0000-00000000b0b2', 'Minha');
do $$
begin
  insert into public.project_tasks (project_id, task_id) values ('00000000-0000-0000-0000-00000000b0b1', '00000000-0000-0000-0000-00000000b0b2');
  raise exception 'linked a task to a project of another user';
exception when insufficient_privilege then null;
end $$;
reset role;
