-- One diary entry per day, and a note cannot link to itself.
alter table public.diary_entries add constraint diary_one_per_day unique (user_id, date);
alter table public.knowledge_connections add constraint knowledge_no_self_link check (source_block_id <> target_block_id);
create index knowledge_blocks_area on public.knowledge_blocks (user_id, area_id);
