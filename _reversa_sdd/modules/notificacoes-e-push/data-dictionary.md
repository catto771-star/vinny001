# Dicionário de dados — notificacoes-e-push

## Tabelas 🟢
### `public.notifications` (`20261120000006_presence.sql:179-187`)
| Coluna | Tipo | Obrig. | Padrão | Notas |
|---|---|---|---|---|
| id | bigint identity PK | sim | auto | |
| kind | text | sim | — | sem CHECK; ver tipos abaixo |
| audience | text | sim | `'management'` | CHECK `management` \| `lodge` |
| lodge_id | uuid FK lodges | não | — | |
| resident_id | uuid FK residents | não | — | |
| payload | jsonb | sim | `{}` | forma depende do kind |
| created_at | timestamptz | sim | now() | |

### `public.notification_reads` (`:189-194`)
| Coluna | Tipo | Obrig. | Notas |
|---|---|---|---|
| notification_id | bigint FK | sim | PK composta |
| staff_id | uuid FK staff | sim | PK composta |
| read_at | timestamptz | sim | now() |

### `public.push_prefs` (`20261125000023_handover_tags_push.sql:26-31`)
| Coluna | Tipo | Notas |
|---|---|---|
| staff_id | uuid FK | PK composta |
| key | text | CHECK `^(tag:[a-z_]+\|maintenance:(urgent\|normal\|low)\|warning\|shift_hours_review\|fridge_out_of_range)$` |
| enabled | boolean | sem linha = padrão (`push_default`) |

### `public.push_subscriptions` (`:33-42`)
| Coluna | Tipo | Obrig. | Notas |
|---|---|---|---|
| id | uuid PK | sim | gen_random_uuid() |
| staff_id | uuid FK | sim | |
| endpoint | text UNIQUE | sim | CHECK `^https://` (dado sensível do aparelho; não reproduzido) |
| p256dh, auth | text | sim | material criptográfico da assinatura (não reproduzido) |
| device | text | não | "iPhone"/"iPad"/"Browser" (`push.ts:38`), truncado em 80 |
| created_at | timestamptz | sim | now() |
| last_used_at | timestamptz | não | atualizado após envio (`index.ts:52`) |

## Funções/RPCs 🟢
| Função | Acesso | Âncora |
|---|---|---|
| `my_notifications(p_limit int)` | authenticated | `20261125000029_house_scope.sql:1552` (substitui `20261120000010:441`) |
| `unread_notifications_count()` | authenticated | `20261125000029:1567` |
| `mark_notification_read(p_id bigint)` | authenticated | `20261120000010:455` |
| `my_push_prefs()` → jsonb [{key,label,group,enabled}] | gestão | `20261125000023:172` |
| `set_push_pref(p_key, p_enabled)` | gestão | `:193` |
| `save_push_subscription(endpoint,p256dh,auth,device)` | gestão | `:206` |
| `remove_push_subscription(endpoint)` | authenticated | `:223` |
| `push_keys(kind,payload)` / `push_default(key)` / `push_recipients(id)` | interno | `:132/145/158` |
| `notify_push()` trigger | interno | `20261125000024_push_hook.sql:3` |

## Tipos de notificação (`kind`) 🟢
| kind | Origem (migration) | Payload (chaves) | Texto in-app | Push? |
|---|---|---|---|---|
| no_show_monthly_limit | `presence.sql:743`; `house_scope:410` | no_show_id, month_count, operational_day, first_name, last_name | `services.ts:42` | não |
| maintenance_opened | `occurrences.sql:576`; `house_scope:466` | ticket_id, location, priority | `:40` | sim (`maintenance:<prio>`) |
| fridge_out_of_range | `services.sql:76`; `beta_operations:301` | reading_id, temperature, min, max, fridge_id, fridge_name | `:38` | sim |
| coverage_below_minimum | `management:301`; `range_limits:71`; `beta_profiles:133` | gaps, from, to | `:44` | não |
| vacation_conflict | `management:466`; `beta_management:521` | vacation_id, staff_id, conflicts, name | `:46` | não |
| shift_hours_review | `handover_shifts:150`; `float_shift:123`; `shift_times:78` | shift_id, name, function | `:48` | sim |
| handover_tag | `handover_tags_push:106`; `handover_coauthors:70`; `house_scope:128` | entry_id, tags[], excerpt(≤140) | `:54` | sim (`tag:<code>`) |
| warning_recorded | trigger `warning_notify` (`handover_tags_push:122`) | warning_id, type, name | `:56` | sim |
| delivery_received | `r15.sql:205` | delivery_id, supplier, product, received_by… | `:50` | não |
| delivery_expiring | `r15.sql:209` | delivery_id, supplier, product, expiry | `:52` | não |
| (desconhecido) | — | — | `notifications.unknown` = "Notice" (`:58`) | não |

## Chaves de preferência (rótulos em `my_push_prefs`) 🟢
`tag:<code>` (grupo handover, rótulo = `handover_tags.label`), `warning` "Warnings" (100), `maintenance:urgent|normal|low` (200-202), `shift_hours_review` "Hours to confirm" (300), `fridge_out_of_range` "Fridge out of range" (301).

## Constantes 🟢
| Nome | Valor | Âncora |
|---|---|---|
| Limite de listagem | 100 (UI), clamp 1–200 (SQL), padrão 50 | `Notifications.tsx:16`, `house_scope:1560` |
| Janela de não lidas | 30 dias | `house_scope:1575` |
| Poll do badge | 60 000 ms | `Layout.tsx:210` |
| TTL do push | 3600 s | `send-push/index.ts:50` |
| Tag do push | `n<id>` | `:50` |
| Cabeçalho de autenticação do hook | `x-push-secret` | `index.ts:30`, `push_hook.sql:19` |
| Variáveis de ambiente (nomes) | `PUSH_HOOK_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; cliente `VITE_VAPID_PUBLIC_KEY` | — |
| Estados de push | unsupported, needs-install, denied, off, on | `push.ts:17` |
| TAG_LABEL | incident, emergency ("Gardaí / Ambulance"), health, damage, conduct, visitor, delivery, general | `index.ts:7-10` |
