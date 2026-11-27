# C4 Nível 3 — Componentes

> Containers detalhados: SPA React, PostgreSQL (camada RPC) e Edge Functions. 🟢 confirmado · 🟡 inferido

## 1. SPA React

```mermaid
C4Component
    title SPA React — Componentes
    Container_Boundary(spa, "SPA React") {
        Component(main, "main.tsx", "Bootstrap", "Providers, registra sw.js")
        Component(app, "App.tsx / Gate", "React Router", "Roteia por AuthStage e papel")
        Component(authp, "AuthProvider", "Contexto", "Sessão, MFA, inatividade, is_active_staff, server_now offset")
        Component(i18n, "i18n/index.tsx + en-IE.ts", "Catálogo único (somente en-IE)", "translate(), LOCALES=[en-IE]")
        Component(layout, "Layout / BottomNav / navGroups", "Navegação", "Menu por papel, troca de Lodge (activeLodge)")
        Component(pages, "pages/*", "~30 telas", "Today, Handover, Seen, Residents, Fridge, Dinner, Laundry, Deliveries, Purchases, Rota, Hours, Users, Reports, Audit, Settings, Structure...")
        Component(comps, "components/*", "UI compartilhada", "BedBoard, ResidentPicker, StaffPicker, Dialog, Toast, HomeDashboard, ShiftRuler")
        Component(lib_time, "lib/time.ts", "Fuso", "Europe/Dublin, dia operacional 07h")
        Component(lib_err, "lib/errors.ts", "Mapa de erros", "regex sobre mensagem do banco -> chave i18n")
        Component(lib_dom, "lib/presence|occurrences|services|management", "Regras de UI", "Derivações espelho do banco")
        Component(lib_cont, "lib/continuity.ts + Continuity.tsx", "Offline", "Folha de continuidade impressa/offline")
        Component(lib_push, "lib/push.ts", "Web Push", "Assina push, grava em push_subscriptions")
        Component(client, "lib/supabase.ts", "supabase-js", "Cliente único (storageKey dslodge.auth)")
    }
    Rel(main, app, "monta")
    Rel(app, authp, "usa stage")
    Rel(app, layout, "renderiza")
    Rel(layout, pages, "Outlet")
    Rel(pages, comps, "usa")
    Rel(pages, lib_dom, "usa")
    Rel(pages, lib_err, "traduz erros")
    Rel(pages, i18n, "t()")
    Rel(pages, lib_time, "formata datas")
    Rel(pages, client, "rpc() / from()")
    Rel(authp, client, "auth, rpc")
    Rel(lib_push, client, "insere assinatura")
    Rel(pages, lib_cont, "Continuity")
```

Responsabilidades por módulo funcional (ver `_reversa_sdd/modules/`): acesso-e-autenticacao (AuthProvider, Login, EmailCode, ChangePassword), moradores-e-presenca (Seen, BedMap, Residents, ResidentProfile, Absences, NoShows, DailySheet, PrintSheet), ocorrencias-e-passagem-de-turno (Handover, Maintenance, Warnings, Tasks), servicos-da-casa (Fridge, Deliveries, Dinner, Laundry), compras-e-fornecedores (Purchases), equipe-escala-e-horas (Rota, Hours, Vacations, Users), painel-relatorios-e-auditoria (Today, Reports, Audit, HomeDashboard), configuracoes-e-cadastros (Settings, Structure), continuidade-offline (Continuity, sw.js), notificacoes-e-push (Notifications, push.ts), interface-e-i18n (i18n, theme, Dialog, Toast).

## 2. Camada de banco (PostgreSQL)

```mermaid
C4Component
    title PostgreSQL — Componentes
    Container_Boundary(pg, "PostgreSQL 16") {
        Component(helpers, "Funções de contexto", "SQL STABLE", "current_staff_id/role, is_active_staff, is_management, can_see_lodge, can_write_lodge, mfa_satisfied, house_scope")
        Component(time, "Funções de tempo", "SQL", "server_now, operational_day(_start/_end), slot_instant, shift_of")
        Component(rls, "Políticas RLS", "POLICY", "RLS ligado nas tabelas de negócio (políticas em 12 migrações); leitura por escopo de Lodge")
        Component(rpcs, "RPCs de negócio", "plpgsql SECURITY DEFINER", "admit/transfer, mark_*, open_handover_shift, save_rota_shift, set_shop_*, record_fridge_*, report_*")
        Component(audit, "Auditoria", "triggers audit_row + audit_immutable", "audit_log append-only; search_audit / search_access_log")
        Component(notify, "Notificações", "notifications + notify_push", "push_keys, push_recipients, my_notifications")
        Component(params, "Parâmetros", "parameters + param_value", "set_system_parameter, valid_from")
        Component(guards, "Guardas de estrutura", "triggers/exceções", "stays_check_bed, structure_guard; staff_overlap levantado em save_rota_shift")
    }
    Rel(rpcs, helpers, "autoriza")
    Rel(rpcs, time, "calcula dia/turno")
    Rel(rpcs, audit, "dispara triggers")
    Rel(rpcs, notify, "gera avisos")
    Rel(rpcs, params, "lê limites")
    Rel(rls, helpers, "usa")
    Rel(guards, rpcs, "protege")
```

## 3. Edge Functions

```mermaid
C4Component
    title Edge Functions — Componentes
    Container_Boundary(edge, "Supabase Edge (Deno)") {
        Component(a1, "admin-users handler", "Deno.serve", "Valida JWT, papel e MFA; create/reset_password/set_active")
        Component(a2, "send-push handler", "Deno.serve", "Verifica x-push-secret, resolve destinatários, envia, remove assinaturas 404/410")
        Component(a3, "message() formatter", "TS", "Título/corpo/URL por kind (handover_tag, maintenance_opened, warning_recorded, shift_hours_review, fridge_out_of_range)")
    }
    Rel(a2, a3, "usa")
```
