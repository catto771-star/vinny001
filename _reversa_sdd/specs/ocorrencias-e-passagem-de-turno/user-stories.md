# Histórias de usuário — ocorrencias-e-passagem-de-turno

## US-OCO-01 Registrar nota no Livro Ata (RF-01, RF-02) 🟢
```gherkin
Cenário: nota com autor responsável (conta da casa)
  Dado que sou conta da casa com turno Office aberto
  Quando escrevo a nota, escolho "filled by" e até 3 coautores e envio
  Então a nota é gravada ligada ao turno com filled_by escolhido

Cenário: sem filled by na conta da casa
  Quando tento enviar sem escolher "filled by"
  Então o botão fica desabilitado

Cenário: mais de 3 coautores
  Quando envio 4 coautores
  Então recebo too_many_authors
```

## US-OCO-02 Justificar registro atrasado (RF-01) 🟢
```gherkin
Cenário: atraso sem motivo
  Dado um fato do turno anterior e usuário não gestor
  Quando envio sem motivo
  Então recebo late_reason_required

Cenário: gestão dispensa motivo
  Quando um Admin registra o mesmo fato
  Então a nota é aceita sem motivo
```

## US-OCO-03 Marcar tags com aviso à gestão (RF-01, RF-08) 🟢
```gherkin
Cenário: tag notificável
  Quando envio nota com a tag "incident"
  Então surge notificação handover_tag para a gestão

Cenário: tag inexistente
  Quando envio tag invisível ou desconhecida
  Então recebo invalid_tag
```

## US-OCO-04 Corrigir ou anular nota (RF-03) 🟢
```gherkin
Cenário: autor dentro da janela
  Dado uma nota criada há 10 h pelo mesmo usuário
  Quando corrijo o texto
  Então só o body é alterado

Cenário: janela encerrada
  Dado nota criada há mais de 72 h
  Quando um não gestor tenta anular
  Então recebo correction_window_closed

Cenário: anulação exige motivo
  Quando anulo sem motivo
  Então recebo reason_required
```

## US-OCO-05 Registrar ronda (RF-04) 🟢
```gherkin
Cenário: ronda registrada uma vez
  Quando toco no chip das 14:00
  Então nasce "Room Check Done"; um segundo toque devolve already_recorded

Cenário: ronda futura
  Quando toco em slot além da janela
  Então recebo round_in_future
```

## US-OCO-06 Abrir, fechar e passar o turno (RF-05) 🟢
```gherkin
Cenário: abrir turno Office
  Quando abro turno com a pessoa escalada
  Então surge "Shift opened — Nome"

Cenário: turno já aberto
  Dado Office já aberto na casa
  Quando abro outro
  Então recebo shift_already_open

Cenário: fechar com passagem
  Quando fecho informando quem assume
  Então o turno fica pending de horas e o próximo turno abre no mesmo horário

Cenário: divergência com a Rota
  Dado abertura 20 min após o planejado
  Quando fecho o turno
  Então a gestão recebe shift_hours_review
```

## US-OCO-07 Abrir e acompanhar chamado de manutenção (RF-09) 🟢
```gherkin
Cenário: clique duplo
  Quando envio o mesmo request_key duas vezes
  Então recebo duplicate:true e apenas um ticket existe

Cenário: Office resolve
  Dado Office da casa do ticket
  Quando marco resolved
  Então é aceito; qualquer outro status ou prazo → not_authorised

Cenário: lembrete
  Dado ticket vencido sem resposta há 24 h
  Quando a gestão abre o app
  Então o lembrete aparece com Resolvido / Em andamento / Em espera / Depois
```

## US-OCO-08 Registrar Warning e Final Warning (RF-10) 🟢
```gherkin
Cenário: FW única por estadia
  Dado FW ativa na estadia
  Quando registro outra FW
  Então recebo final_warning_active

Cenário: desativar FW
  Quando um Admin desativa com motivo
  Então active=false com autor, hora e motivo

Cenário: desativar warning simples
  Quando tento desativar um warning
  Então recebo warning_not_active
```

## US-OCO-09 Buscar no Livro Ata (RF-06) 🟢
```gherkin
Cenário: filtro por residente
  Quando filtro pelo residente X
  Então vejo entradas que o mencionam, sem as anuladas

Cenário: período excessivo
  Quando escolho mais de 92 dias
  Então recebo range_too_large
```
