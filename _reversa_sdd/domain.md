# Domínio — DS Lodge

> Detetive Reversa · doc_level=completo. Escala: 🟢 confirmado no código/histórico · 🟡 inferido · 🔴 lacuna. Referências: `Mnn` = migration em `supabase/migrations/` (número do arquivo).

## 1. Glossário
| Termo | Significado | Fonte | Conf. |
|---|---|---|---|
| **Lodge / casa** | Residência (hoje 2 casas ativas; sem UI para criar/desativar). Tem flags `has_dinner`, `has_laundry`. | `lodges`, M01/M34 | 🟢 |
| **Room / Apartment / Bed** | Quarto (`room`) ou apartamento (`apartment`) com camas numeradas; cama `in_use` ou `out_of_service`; quarto/cama podem ser inativos. | M01, M34, M35 | 🟢 |
| **Resident** | Pessoa abrigada, identificada por **PASS ID** único (sem diferenciar maiúsculas). | `residents`, M37 | 🟢 |
| **Stay (estadia)** | Período de um residente numa cama: `active`, `out_pending`, `ended`; transferência encerra e cria nova estadia ligada (`transfer_from_stay_id`). | M01 | 🟢 |
| **Out / Cancelar cama** | Decisão de saída: qualquer da equipe a registra (`out_pending`, com motivo); a gestão efetiva (`effect_out`). Na UI diz-se "cama cancelada". | M01, M38 | 🟢 |
| **Dia operacional** | Dia que começa às 07:00 (Dublin) e vai até as 07:00 seguinte. | M03, `time.ts` | 🟢 |
| **Day / Night shift** | Turnos 07h–19h e 19h–07h (valores literais no banco). | M06, M07 | 🟢 |
| **Room Check** | Ronda de presença por horário (`presence.check_times`); gera `room_check_runs` e marcas `seen/not_seen/absent`; "lançar" (`launch`) fecha a folha. | M06 | 🟢 |
| **Seen** | Evidência de que o residente foi visto (check por turno Day/Night, avistamento avulso `record_sighting`). | M06, 259cf08 | 🟢 |
| **Absence** | Ausência registrada (início, retorno previsto/efetivo); "protege" a cama do No Show. | M06 | 🟢 |
| **No Show** | Dia operacional sem nenhuma evidência para um residente, confirmado pela equipe depois do fim do dia; só gestão desfaz. | M06 | 🟢 |
| **Handover (Livro Ata)** | Registro por turno: notas, rondas, manutenção, warnings, laundry, abertura/fecho de turno, com menções (`@`), tags e coautores. | M07, M18, M23, M27 | 🟢 |
| **Filled in by** | Pessoa real que preenche quando o login é a conta da casa. | M16/M29 | 🟢 |
| **Station / conta da casa** | Login institucional de cada casa; vê/grava só a sua. | M15, M29 | 🟢 |
| **Admin** | Rótulo de UI para manager/owner (gestão); `developer` é papel técnico. | en-IE, M01 | 🟢 |
| **Staff (UI)** | Rótulo de UI do papel `porter`. | en-IE | 🟢 |
| **Office / Float** | Funções de turno: Office fixa numa casa; Float cobre as duas (turno Float é global e visível em ambas). | M25 | 🟢 |
| **Rota / Roster** | Escala de turnos (`rota_shifts`: draft/published/cancelled). | M11, M29 | 🟢 |
| **Hours** | Horas trabalhadas: plano (Rota) × confirmado (turno do Handover). | M18, M25 | 🟢 |
| **Holidays / Vacations** | Férias da equipe (`under_review/approved/cancelled`), com conflito e calendário anual. | M17 | 🟢 |
| **Warning / Final Warning (FW)** | Advertências ao residente, ligadas à estadia e a uma nota do Handover; FW é ativa/desativada. | M07, M37 | 🟢 |
| **Maintenance ticket** | Chamado por casa, prioridade `urgent/normal/low`, prazo, eventos, lembretes (snooze). | M07 | 🟢 |
| **Daily Tasks** | Modelos recorrentes por turno/dia da semana e tarefas pontuais; assinadas por pessoa do turno. | M08, M19 | 🟢 |
| **Fridge / Food Delivery** | Leitura de temperatura por geladeira com faixa; recebimento de entregas com validade e fornecedor. | M10 | 🟢 |
| **Dinner / Laundry** | Jantar (marca só quem pegou) e lavanderia (máquinas, início/fim aparece no Handover). | M10, e1e3003 | 🟢 |
| **Supplier / Tesco order** | Fornecedores (campos obrigatórios, `links_order`); pedidos da lista fixa do Tesco. | M17, M37 | 🟢 |
| **Continuity** | Folha offline por casa para chamada de incêndio/emergência. | `Continuity.tsx` | 🟡 |
| **Parameters** | Parâmetros do sistema com vigência (`valid_from`), editáveis pela gestão. | M01, M30, M32 | 🟢 |

## 2. Regras de negócio implícitas
### Residentes e estadias
1. PASS ID é obrigatório na admissão e único sem distinguir maiúsculas (`pass_id_required`, `pass_id_exists`); readmissão de ex-residente via `find_former_resident` (M37). 🟢
2. Um residente não pode ter duas estadias abertas (`already_resident`, índices `stays_one_open_per_*`); uma cama não aceita duas estadias abertas. 🟢
3. Horários de admissão/saída/transferência não podem estar no futuro (tolerância de 5 minutos) nem antes da admissão (`admitted_in_future`, `invalid_out_time`, `invalid_transfer_time`). 🟢
4. Cancelar a cama exige motivo; retirar o cancelamento só pela gestão ou por quem decidiu (`withdraw_out`); efetivar só pela gestão (`effect_out`). 🟢
5. Ao admitir/transferir alguém para uma cama em `out_pending`, a saída anterior é efetivada automaticamente (M38) — sem confirmação da gestão. 🟡 (intenção não documentada; ver questions.md)
6. Camas `out_of_service` não aceitam admissão (`bed_out_of_service`); um quarto tem no máximo 12 camas, contadas incluindo inativas. 🟡 (a numeração conta camas removidas)

### Presença
7. O No Show só pode ser confirmado depois de `fim do dia − 30 min` e com todas as rondas do dia concluídas (`day_not_finished`, `checks_pending`); candidato é quem não tem evidência; um No Show confirmado por residente/dia. 🟢
8. Ao atingir `presence.no_show_monthly_alert` (padrão 3) no mês, gera notificação `no_show_monthly_limit` para a gestão. 🟢
9. Ausência protege a cama (contabilizada como "protected_by_absence"); ausências do mesmo residente não podem se sobrepor (`absence_overlaps`), mas a checagem não é protegida por constraint de exclusão. 🟡
10. Marcações de Room Check têm janela de correção; `clear_mark` e `launch` exigem estado coerente; o lançamento pode acontecer fora do horário (Beta 2). 🟢

### Ocorrências e turnos
11. Nota do Handover não pode ter horário futuro; atrasos fora do turno exigem justificativa (`late_reason`) da lista `handover.late_reasons`. 🟢
12. Até 3 coautores, sem repetir nem incluir o preenchedor; apenas porter/manager/owner/developer ativos aceitos como "filled by"/coautor/passagem. 🟢
13. Corrigir/anular nota: gestão sempre; demais só o autor dentro da janela `records.correction_window_hours`; anular exige motivo e o índice único por horário de ronda continua ocupado pela ronda anulada. 🟢 / 🟡 para o efeito no índice
14. Uma única Final Warning ativa por estadia (`final_warning_active`); só a gestão a desativa, com motivo; Warning/FW gera nota no Handover e notificação. 🟢
15. Manutenção: prazo padrão por prioridade vem de `maintenance.default_deadline_hours`; lembretes após 24 h (valor literal); resolvido guarda `resolved_at/by` e reabertura mantém o histórico. 🟢 / 🟡 (parâmetro `maintenance.reminder_hours` não lido)
16. Turno de Handover: um aberto por casa (Float: um global); abrir exige horário entre agora−24 h e agora+5 min; fechar exige horário ≥ abertura; passar o serviço abre automaticamente o turno do próximo; divergência >15 min do plano da Rota gera revisão de horas. 🟢
17. Horas: turno fechado fica `pending` até a gestão confirmar (máx. 24 h, não futuro); a confirmação ajusta ou cria o turno da Rota. 🟢

### Serviços
18. Leitura de geladeira fora da faixa (`fridge.range_celsius`) gera notificação `fridge_out_of_range` (push). 🟢
19. Entrega de alimentos: validade vs `delivery.expiry_alert_days` gera `delivery_expiring`; fornecedor com `links_order` dispara alerta para a gestão vincular a um pedido. 🟢 / 🟡 (cliente usa 2 dias fixos)
20. Dinner: só marca quem pegou; "não serviu" tem duas definições (ausência de marca na UI × `served=false` no resumo). 🟡
21. Não há correção/anulação de leituras de temperatura nem de entregas (só nova linha). 🟡

### Equipe e Rota
22. Função × papel: `cleaner`↔cleaner; `office` só porter; `float` porter ou manager; sobreposição de turnos da mesma pessoa recusa (`staff_overlap`); cobertura mínima por janela é checada por interseção parcial. 🟢 / 🟡
23. Pessoas não pertencem a casa (Revisão 13); só `station` guarda `home_lodge_id` (constraint `staff_home_only_station`). 🟢
24. Conta `developer` não é criada pelo app; só um developer edita outro developer (RLS). 🟢
25. Senha: forte na edge function e no front (regras ligeiramente diferentes quanto a acentos); troca obrigatória no primeiro login (`must_change_password`). 🟢

### Compras
26. Pedido Tesco: `created→placed→awaiting→delivered`; `delivered` é terminal; vincular entrega exige fornecedor com `links_order` e pedido `placed/awaiting`; entrega vinculada gera nota "Tesco order … delivered" no Handover. 🟢
27. Relatório de compras soma todos os pedidos do período (inclusive `created`) e devolve contagem por status. 🟢

### Governança
28. Nada é apagado: correções são novos registros (anulado, desfeito, cancelado, inativo); exceção: `clear_mark`. 🟢
29. Toda mudança relevante é auditada (`audit_row`); consulta de auditoria e do log de acesso só pela gestão; parâmetros têm histórico por vigência. 🟢
30. Valores do negócio (preços) ficam em `_reversa_sdd/_pricing/`, ignorado no Git. 🟢

## 3. Lacunas de domínio 🔴
- Significado/uso de `residents.is_demo` e quem o marca. Política de retenção de `notifications` e de snapshots offline. Papel real de `quick_phrases` (sem consumidor). Ver `questions.md`.
