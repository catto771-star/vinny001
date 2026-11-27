# Histórias de usuário — equipe-escala-e-horas

## US-EQP-01 Montar a escala semanal (RF-01) 🟢
```gherkin
Cenário: turno Office válido
  Dado um porter ativo
  Quando salvo um turno Office de 07:00 a 19:00 em Amiens
  Então o turno fica em rascunho

Cenário: papel incompatível
  Quando escalo um manager como Office
  Então recebo role_not_allowed

Cenário: sobreposição
  Dado a mesma pessoa com outro turno no período
  Quando salvo
  Então recebo staff_overlap

Cenário: função manager para qualquer papel (lacuna)
  Quando salvo função "manager" para um porter via RPC
  Então o banco aceita (restrição só no front)
```

## US-EQP-02 Publicar a escala (RF-02, RF-04) 🟢
```gherkin
Cenário: publicação com buracos
  Dado a semana sem turno Office para a noite de Connolly
  Quando publico
  Então os rascunhos são publicados com planned_* e a gestão recebe coverage_below_minimum

Cenário: intervalo grande
  Quando publico mais de 62 dias
  Então recebo erro de intervalo
```

## US-EQP-03 Dividir um turno com cobertura (RF-03) 🟢
```gherkin
Cenário: saída antecipada
  Dado turno publicado 07:00–19:00
  Quando divido às 15:00 com cobertura por outra pessoa
  Então o original termina às 15:00 e a cobertura publicada vai de 15:00 a 19:00 sem planned_*

Cenário: horário fora do turno
  Quando divido fora do intervalo
  Então recebo invalid_split_time
```

## US-EQP-04 Conferir horas (RF-05, RF-07) 🟢
```gherkin
Cenário: confirmar real
  Dado turno do Handover fechado com divergência de 20 min
  Quando clico "Confirmar real"
  Então o turno da Rota recebe as horas reais e hours_status=confirmed

Cenário: confirmar tudo que bate
  Quando uso "Confirmar tudo que bate"
  Então só as linhas sem mismatch são confirmadas

Cenário: horas lançadas à parte
  Quando lanço intervalo de 25 h
  Então recebo interval_too_long
```

## US-EQP-05 Assinar tarefas do turno (RF-08) 🟢
```gherkin
Cenário: assinatura pela pessoa do turno
  Dado conta da casa com turno Office aberto
  Quando assino "Check fire panel"
  Então a assinatura é gravada como a pessoa do turno

Cenário: turno futuro
  Quando assino tarefa de turno que começa em mais de 5 min
  Então recebo shift_not_started

Cenário: tarefa pendente atrasada
  Dado tarefa sem assinatura no turno de ontem
  Quando abro Tasks
  Então ela aparece como "atrasada há …" e posso assiná-la
```

## US-EQP-06 Criar tarefas (RF-08) 🟢
```gherkin
Cenário: extra do dia
  Quando a gestão cria extra para uma pessoa
  Então ela aparece no turno e pode ser reatribuída ao turno todo se a pessoa estiver fora

Cenário: modelo recorrente sem dias
  Quando crio modelo sem dias da semana
  Então vale todos os dias
```

## US-EQP-07 Gerir usuários (RF-09) 🟢
```gherkin
Cenário: editar mantendo versão
  Dado dois Admins editando a mesma pessoa
  Quando o segundo salva com versão antiga
  Então recebe stale_version

Cenário: trocar papel entre grupos
  Quando tento transformar um porter (sem login) em manager (com login)
  Então a UI não permite (troca só dentro do grupo)

Cenário: ficha da pessoa
  Quando abro a pessoa
  Então vejo funções, próximas escalas, turnos, notas e horas do mês
```
