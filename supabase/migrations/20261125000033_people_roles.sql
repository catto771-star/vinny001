-- Revisão 13: pessoas não pertencem a uma casa. Staff (Porter/Float), Cleaner, Manager e Owner atuam nas duas casas;
-- só a conta de casa (station) guarda a sua.
update public.staff set home_lodge_id = null where role <> 'station' and home_lodge_id is not null;
alter table public.staff add constraint staff_home_only_station check (home_lodge_id is null or role = 'station');
notify pgrst, 'reload schema';
