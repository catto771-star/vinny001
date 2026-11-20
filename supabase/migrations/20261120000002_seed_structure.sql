-- Estrutura física e parâmetros iniciais (spec v1.1, s.14 itens 8, 10, 11, 12, 16).
-- É a lista inicial; Manager/Owner editam depois pelo sistema.

insert into public.lodges (code, name, short_name, has_dinner, has_laundry) values
  ('AMIENS', 'Amiens St.', 'Amiens', true, false),
  ('CONNOLLY', 'Connolly', 'Connolly', false, true);

-- Amiens: 9 quartos, 37 camas.
with amiens as (select id from public.lodges where code = 'AMIENS'),
spec(code, beds, ord) as (values
  ('1', 4, 1), ('2', 4, 2), ('3', 3, 3), ('4', 6, 4), ('5', 2, 5),
  ('6', 2, 6), ('7', 6, 7), ('8', 4, 8), ('9', 6, 9)
),
ins as (
  insert into public.rooms (lodge_id, kind, code, sort_order)
  select amiens.id, 'room', spec.code, spec.ord from amiens, spec
  returning id, code
)
insert into public.beds (room_id, number)
select ins.id, n
from ins join spec on spec.code = ins.code
cross join lateral generate_series(1, spec.beds) n;

-- Connolly: 24 quartos (38 camas) e 5 apartamentos (6 camas). Não existe quarto 13.
with connolly as (select id from public.lodges where code = 'CONNOLLY'),
spec(kind, code, beds, ord) as (values
  ('room', '1', 2, 10), ('room', '1.1', 2, 11), ('room', '2', 2, 20), ('room', '3', 1, 30),
  ('room', '4', 2, 40), ('room', '5', 2, 50), ('room', '6', 2, 60), ('room', '7', 2, 70),
  ('room', '8', 2, 80), ('room', '9', 1, 90), ('room', '10', 2, 100), ('room', '11', 2, 110),
  ('room', '12', 2, 120), ('room', '14', 2, 140), ('room', '15', 1, 150), ('room', '16', 1, 160),
  ('room', '17', 1, 170), ('room', '18', 1, 180), ('room', '19', 1, 190), ('room', '20', 1, 200),
  ('room', '21', 1, 210), ('room', '22', 2, 220), ('room', '23', 2, 230), ('room', '24', 1, 240),
  ('apartment', '1', 1, 1010), ('apartment', '2', 2, 1020), ('apartment', '3', 1, 1030),
  ('apartment', '4', 1, 1040), ('apartment', '5', 1, 1050)
),
ins as (
  insert into public.rooms (lodge_id, kind, code, sort_order)
  select connolly.id, spec.kind::public.room_kind, spec.code, spec.ord from connolly, spec
  returning id, kind, code
)
insert into public.beds (room_id, number)
select ins.id, n
from ins join spec on spec.code = ins.code and spec.kind::public.room_kind = ins.kind
cross join lateral generate_series(1, spec.beds) n;

-- Parâmetros (valid_from no passado distante = valem desde o início).
insert into public.parameters (key, value, valid_from) values
  ('presence.check_times', '["12:00", "18:00", "22:00"]', '2026-01-01T00:00:00Z'),
  ('presence.no_show_monthly_alert', '3', '2026-01-01T00:00:00Z'),
  ('shift.day_start', '"07:00"', '2026-01-01T00:00:00Z'),
  ('shift.night_start', '"19:00"', '2026-01-01T00:00:00Z'),
  ('shift.float_hours', '{"start": "12:00", "end": "24:00"}', '2026-01-01T00:00:00Z'),
  ('shift.minimum_coverage', '{"office_per_shift_per_lodge": 1, "float": {"start": "12:00", "end": "24:00", "count": 1}}', '2026-01-01T00:00:00Z'),
  ('rounds.hours', '["00:00","02:00","04:00","06:00","08:00","10:00","12:00","14:00","16:00","18:00","20:00","22:00"]', '2026-01-01T00:00:00Z'),
  ('records.correction_window_hours', '72', '2026-01-01T00:00:00Z'),
  ('fridge.range_celsius', '{"min": 0, "max": 5}', '2026-01-01T00:00:00Z'),
  ('maintenance.default_deadline_hours', '{"urgent": 24, "normal": 168, "low": 720}', '2026-01-01T00:00:00Z'),
  ('maintenance.reminder_hours', '24', '2026-01-01T00:00:00Z'),
  ('security.session_idle_minutes', '15', '2026-01-01T00:00:00Z'),
  ('security.require_mfa_management', 'true', '2026-01-01T00:00:00Z'),
  ('alerts.email', '{"enabled": false, "types": {"fridge_out_of_range": false, "maintenance_overdue": false, "no_show_pending": false, "no_show_monthly_limit": false, "coverage_below_minimum": false}}', '2026-01-01T00:00:00Z');
