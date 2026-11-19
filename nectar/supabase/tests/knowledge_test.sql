-- Diary: one entry a day. Connections: no self links, private to the owner.
\set ON_ERROR_STOP on
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'd1@test'),
  ('00000000-0000-0000-0000-0000000000d2', 'd2@test') on conflict do nothing;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
insert into public.diary_entries (date, content, mood) values ('2026-11-18', 'Dia bom', 4);
do $$
begin
  insert into public.diary_entries (date, content) values ('2026-11-18', 'De novo');
  raise exception 'two diary entries on one day';
exception when unique_violation then null;
end $$;
insert into public.knowledge_blocks (id, title) values ('00000000-0000-0000-0000-00000000d0d1', 'A'), ('00000000-0000-0000-0000-00000000d0d2', 'B');
insert into public.knowledge_connections (source_block_id, target_block_id) values ('00000000-0000-0000-0000-00000000d0d1', '00000000-0000-0000-0000-00000000d0d2');
do $$
begin
  insert into public.knowledge_connections (source_block_id, target_block_id) values ('00000000-0000-0000-0000-00000000d0d1', '00000000-0000-0000-0000-00000000d0d1');
  raise exception 'a note linked to itself';
exception when check_violation then null;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d2';
do $$
begin
  if exists (select 1 from public.knowledge_connections) or exists (select 1 from public.diary_entries) then raise exception 'knowledge leaked'; end if;
end $$;
-- Another user can write the same day in their own diary.
insert into public.diary_entries (date, content) values ('2026-11-18', 'Outro');
reset role;
