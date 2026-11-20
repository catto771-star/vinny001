-- Modelo de Daily Tasks de Amiens (spec v1.1, s.14 item 10), nos três idiomas.
-- Horários só como referência. Connolly começa como cópia do modelo de Amiens (a ajustar depois).
-- Valem desde 01/01/2026 (created_at) para não criar atrasos artificiais.

with model(shift, weekdays, title, sort_order, suggested_time) as (values
  ('day', null, '{"pt-PT": "Cross-check do PASS / lista de residentes", "en-IE": "Cross-check PASS / residents list", "pl-PL": "Weryfikacja PASS / listy mieszkańców"}', 1, '07:30'),
  ('day', '{1}', '{"pt-PT": "Enviar Weekly Returns", "en-IE": "Send Weekly Returns", "pl-PL": "Wyślij Weekly Returns"}', 2, '09:00'),
  ('day', null, '{"pt-PT": "Limpeza de cozinha, despensa e WC da equipe", "en-IE": "Clean kitchen, pantry and staff WC", "pl-PL": "Sprzątanie kuchni, spiżarni i WC personelu"}', 3, '08:00'),
  ('day', null, '{"pt-PT": "Limpeza da frente da casa", "en-IE": "Clean the front of the house", "pl-PL": "Sprzątanie przed budynkiem"}', 4, '09:30'),
  ('day', null, '{"pt-PT": "Temperatura da geladeira", "en-IE": "Fridge temperature", "pl-PL": "Temperatura lodówki"}', 5, '10:00'),
  ('day', '{2}', '{"pt-PT": "Bell Test / Fire Drill", "en-IE": "Bell Test / Fire Drill", "pl-PL": "Bell Test / Fire Drill"}', 6, '11:00'),
  ('day', '{5}', '{"pt-PT": "Apoio na limpeza com roupa de cama", "en-IE": "Help with bed linen cleaning", "pl-PL": "Pomoc przy praniu pościeli"}', 7, '11:00'),
  ('day', '{7}', '{"pt-PT": "Retirar o lixo dos quartos", "en-IE": "Take out the rubbish from the rooms", "pl-PL": "Wynieść śmieci z pokoi"}', 8, '11:00'),
  ('day', null, '{"pt-PT": "Limpeza de cozinha, Office e hall", "en-IE": "Clean kitchen, Office and hall", "pl-PL": "Sprzątanie kuchni, biura i holu"}', 9, '13:00'),
  ('day', '{1,4,7}', '{"pt-PT": "Limpeza da geladeira", "en-IE": "Clean the fridge", "pl-PL": "Mycie lodówki"}', 10, '14:00'),
  ('day', '{2,5}', '{"pt-PT": "Destrancar os contentores de lixo para a coleta", "en-IE": "Unlock the bins for collection", "pl-PL": "Otworzyć kontenery na odbiór śmieci"}', 11, '07:30'),
  ('day', null, '{"pt-PT": "Conferir validades e repor stock", "en-IE": "Check expiry dates and restock", "pl-PL": "Sprawdzić daty ważności i uzupełnić zapasy"}', 12, '15:00'),
  ('day', null, '{"pt-PT": "E-mails, Handover e formulários", "en-IE": "Emails, Handover and forms", "pl-PL": "E-maile, Handover i formularze"}', 13, '17:30'),
  ('night', null, '{"pt-PT": "Conferir PASS / lista / Handover", "en-IE": "Check PASS / list / Handover", "pl-PL": "Sprawdzić PASS / listę / Handover"}', 14, '19:30'),
  ('night', null, '{"pt-PT": "Repor papel higiénico", "en-IE": "Restock toilet paper", "pl-PL": "Uzupełnić papier toaletowy"}', 15, '20:00'),
  ('night', null, '{"pt-PT": "Limpeza de cozinha, despensa e WC", "en-IE": "Clean kitchen, pantry and WC", "pl-PL": "Sprzątanie kuchni, spiżarni i WC"}', 16, '21:00'),
  ('night', null, '{"pt-PT": "Assinar o Fire Book e verificar as saídas de emergência", "en-IE": "Sign the Fire Book and check emergency exits", "pl-PL": "Podpisać Fire Book i sprawdzić wyjścia ewakuacyjne"}', 17, '23:00'),
  ('night', null, '{"pt-PT": "Temperatura da geladeira", "en-IE": "Fridge temperature", "pl-PL": "Temperatura lodówki"}', 18, '23:30'),
  ('night', null, '{"pt-PT": "Limpeza da frente da casa", "en-IE": "Clean the front of the house", "pl-PL": "Sprzątanie przed budynkiem"}', 19, '00:30'),
  ('night', '{4}', '{"pt-PT": "Preparar jogos de roupa de cama", "en-IE": "Prepare bed linen sets", "pl-PL": "Przygotować komplety pościeli"}', 20, '01:00'),
  ('night', null, '{"pt-PT": "Validades e stock", "en-IE": "Expiry dates and stock", "pl-PL": "Daty ważności i zapasy"}', 21, '02:00'),
  ('night', null, '{"pt-PT": "Imprimir lista e Handover e atualizar todos os formulários", "en-IE": "Print list and Handover and update all forms", "pl-PL": "Wydrukować listę i Handover oraz uzupełnić formularze"}', 22, '04:00'),
  ('night', null, '{"pt-PT": "Limpeza de hall, escadas e cozinha", "en-IE": "Clean hall, stairs and kitchen", "pl-PL": "Sprzątanie holu, schodów i kuchni"}', 23, '05:00'),
  ('night', null, '{"pt-PT": "Café da manhã pronto", "en-IE": "Breakfast ready", "pl-PL": "Śniadanie gotowe"}', 24, '06:30')
)
insert into public.task_templates (lodge_id, shift, weekdays, title, sort_order, suggested_time, created_at)
select l.id, m.shift, m.weekdays::integer[], m.title::jsonb, m.sort_order, m.suggested_time, '2026-01-01T00:00:00Z'
from model m cross join public.lodges l
where l.code in ('AMIENS', 'CONNOLLY');
