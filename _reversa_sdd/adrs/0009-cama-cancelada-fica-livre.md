# ADR-0009: Cama com saída decidida (out_pending, 'cancelada') fica livre para novo residente

- **Status:** aceito (retroativo, reconstruído do histórico Git e do código)
- **Data (commit):** 2026-11-26
- **Evidências:** c2211f6 (Revisão 16), migration 20261126000038_r16.sql
- **Confiança:** 🟢 mecanismo; 🟡 intenção de ignorar a confirmação da gestão

## Contexto
Cancelar uma cama é decisão de qualquer da equipe, confirmada pela gestão; até a confirmação, a cama bloqueava a ocupação.

## Decisão
`release_cancelled_bed` encerra (`ended`, `end_reason='out'`) a estadia em `out_pending` ao admitir ou transferir outro residente para a mesma cama. A Home conta a cama como livre e mostra o residente em `out_pending`.

## Consequências
A saída é efetivada sem passar por `effect_out` (gestão) — risco/regra a confirmar (questions.md).
