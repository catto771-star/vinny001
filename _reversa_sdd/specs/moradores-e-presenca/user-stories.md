# Histórias de usuário — moradores-e-presenca

## US-MOR-01 Admitir um novo residente (RF-01) 🟢
```gherkin
Cenário: admissão de residente novo
  Dado que sou conta da casa Amiens e a cama 3 do quarto 2 está livre
  Quando informo nome, PASS ID inédito e confirmo
  Então uma estadia "active" é criada e navego para o perfil

Cenário: PASS ID duplicado
  Dado um residente com PASS ID "ab123"
  Quando admito outro com "AB123"
  Então recebo pass_id_exists e nada é criado

Cenário: cama fora de serviço
  Dado uma cama out_of_service
  Quando tento admitir nela
  Então recebo bed_out_of_service
```

## US-MOR-02 Readmitir ex-residente (RF-02) 🟢
```gherkin
Cenário: reaproveitar cadastro
  Dado um ex-residente sem estadia aberta
  Quando digito o PASS ID (3+ caracteres)
  Então vejo última casa e data de saída e posso "usar cadastro"

Cenário: residente já internado
  Dado um residente com estadia aberta
  Quando digito o PASS ID
  Então a admissão é bloqueada (already_resident)
```

## US-MOR-03 Decidir e efetivar Out (RF-05) 🟢
```gherkin
Cenário: decidir Out
  Dado uma estadia ativa
  Quando a equipe registra Out com motivo
  Então o status vira out_pending

Cenário: Out sem motivo
  Quando registro Out sem motivo
  Então recebo reason_required

Cenário: efetivar só pela gestão
  Dado out_pending
  Quando uma conta station tenta effect_out
  Então a ação é negada
  E quando um Admin efetiva, a estadia vira ended com end_reason=out
```

## US-MOR-04 Reocupar cama cancelada (RF-07) 🟢 / intenção 🔴
```gherkin
Cenário: cama com Out decidido é reocupada
  Dado a cama X com estadia out_pending
  Quando admito outro residente na cama X
  Então a estadia anterior é encerrada (end_reason=out) sem passar pela gestão
```

## US-MOR-05 Transferir residente (RF-06) 🟢
```gherkin
Cenário: transferência
  Dado uma estadia ativa na casa A e cama livre na casa B
  Quando transfiro
  Então a estadia de A termina com end_reason=transfer e abre nova em B ligada por transfer_from_stay_id

Cenário: origem não ativa
  Dado uma estadia out_pending
  Quando tento transferir
  Então recebo stay_not_active
```

## US-MOR-06 Fazer a ronda do Room Check (RF-09) 🟢
```gherkin
Cenário: marcar e lançar
  Dado uma folha aberta para o slot das 12:00
  Quando marco todos os residentes e lanço
  Então o run vira launched e, se 12:00 é slot de ronda, surge "Room Check Done" no Handover

Cenário: lançar com não marcados
  Quando lanço com residentes sem marca
  Então recebo unmarked_residents

Cenário: slot futuro
  Quando abro um slot além da janela
  Então recebo check_in_future

Cenário: marcar ausente sem ausência
  Quando marco "absent" sem ausência ativa
  Então recebo no_active_absence
```

## US-MOR-07 Registrar ausência e antecipar retorno (RF-10) 🟢
```gherkin
Cenário: ausência sem sobreposição
  Quando registro ausência com retorno previsto posterior ao início
  Então ela fica ativa e protege a cama do No Show

Cenário: sobreposição
  Dado uma ausência aberta para a estadia
  Quando registro outra que se sobrepõe
  Então recebo absence_overlaps

Cenário: marcar Seen durante ausência
  Quando marco "seen" para quem está ausente
  Então o sistema oferece antecipar a presença (end_absence)
```

## US-MOR-08 Confirmar No Show (RF-12) 🟢
```gherkin
Cenário: antes do fim do dia
  Quando tento confirmar antes de (fim do dia − 30 min)
  Então recebo day_not_finished

Cenário: rondas pendentes
  Dado slots não lançados
  Quando tento confirmar
  Então recebo checks_pending

Cenário: confirmação com alerta mensal
  Dado presence.no_show_monthly_alert = 3 e o residente já tem 2 no mês
  Quando confirmo o terceiro
  Então é criada a notificação no_show_monthly_limit para a gestão

Cenário: desfazer
  Quando um Admin desfaz com motivo
  Então o No Show vira undone e deixa de contar
```

## US-MOR-09 Registrar avistamento (Seen) (RF-11) 🟢
```gherkin
Cenário: avistamento válido
  Dado um residente presente na casa
  Quando registro "seen" agora
  Então o residente conta como Seen no turno corrente

Cenário: residente em outra casa
  Quando registro para residente que não está na casa
  Então recebo resident_not_in_lodge
```
