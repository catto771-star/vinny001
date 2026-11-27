# ADR-0004: Dia operacional (07:00) e relógio fixo em Europe/Dublin com hora do servidor

- **Status:** aceito (retroativo, reconstruído do histórico Git e do código)
- **Data (commit):** 2026-11-20
- **Evidências:** 71b4bbc (Fase 0: relógio de Dublin e dia operacional), migration 20261120000003_server_time.sql
- **Confiança:** 🟢

## Contexto
Casas na Irlanda operam por turnos que atravessam a meia-noite; relatórios e presença precisam de um 'dia' coerente independente do fuso do dispositivo.

## Decisão
Funções `operational_day`, `operational_day_start/end`, `shift_of`, `slot_instant`; no front `src/lib/time.ts` converte hora de parede de Dublin e usa o offset do servidor (`server_now()`). Turnos Day/Night usam 07h/19h literais; parâmetros `shift.day_start/night_start` existem mas não são lidos (questions.md).

## Consequências
Totais semanais divergem conforme a âncora (Rota 00:00 vs Hours 07:00) — pendência registrada. Tolerância de 5 minutos para horários futuros em várias RPCs.
