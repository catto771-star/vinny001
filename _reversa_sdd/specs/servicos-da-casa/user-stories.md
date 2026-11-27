# Histórias de usuário — servicos-da-casa

## US-SRV-01 Usar a máquina de lavar (RF-01) 🟢
```gherkin
Cenário: iniciar lavagem para um residente
  Dado uma máquina ativa livre em Connolly
  Quando inicio "A · Wash" para um residente
  Então surge nota "Wash started — A · Wash" mencionando o residente e a máquina fica ocupada

Cenário: máquina ocupada
  Dado uma utilização aberta
  Quando inicio outra na mesma máquina
  Então recebo machine_busy

Cenário: finalizar
  Quando finalizo a utilização
  Então surge a nota de término e finalizar de novo não duplica nada
```

## US-SRV-02 Registrar temperatura da geladeira (RF-02) 🟢
```gherkin
Cenário: leitura dentro da faixa
  Dado faixa 0–5 °C
  Quando registro 4,0
  Então a leitura é gravada com snapshot da faixa e a tarefa "Fridge temperature" do turno é assinada

Cenário: fora da faixa
  Quando registro 8,5
  Então é criada fridge_out_of_range para a gestão (push se habilitado)

Cenário: campo vazio
  Quando salvo sem temperatura
  Então o botão fica desabilitado; via RPC retorna temperature_required

Cenário: valor impossível
  Quando envio 60
  Então recebo invalid_temperature
```

## US-SRV-03 Marcar o Dinner (RF-03) 🟢
```gherkin
Cenário: marcar quem pegou
  Dado o serviço do dia aberto
  Quando toco "took" para um residente
  Então served=true e conta como Seen Night

Cenário: desfazer
  Quando toco de novo
  Então grava served=false (não apaga)

Cenário: serviço fechado
  Dado Dinner fechado
  Quando uma conta da casa tenta alterar
  Então recebo dinner_closed

Cenário: dia ainda não iniciado
  Quando marco para dia futuro
  Então recebo dinner_not_started
```

## US-SRV-04 Fechar o Dinner (RF-03) 🟢
```gherkin
Cenário: fechamento antes das 22:00
  Quando a gestão tenta fechar às 21:30
  Então recebo dinner_not_finished

Cenário: quantidades inválidas
  Quando informo sobra negativa
  Então recebo invalid_quantities

Cenário: reedição
  Dado Dinner já fechado por um manager
  Quando um manager tenta reeditar
  Então recebo dinner_already_closed; um owner consegue
```

## US-SRV-05 Receber entrega de alimentos (RF-04) 🟢
```gherkin
Cenário: fornecedor exige lote e validade
  Dado Ripley's com require_batch e require_best_before
  Quando registro sem lote
  Então recebo batch_required

Cenário: entrega do Tesco
  Dado fornecedor com links_order
  Quando registro a entrega
  Então a gestão recebe delivery_received e a entrega aparece "aguardando vínculo"

Cenário: validade próxima
  Dado delivery.expiry_alert_days=3
  Quando a validade é daqui a 2 dias
  Então a gestão recebe delivery_expiring

Cenário: fornecedor inativo
  Quando escolho fornecedor inativo
  Então recebo supplier_inactive

Cenário: casa sem Dinner
  Quando registro em casa sem has_dinner
  Então recebo service_not_available
```

## US-SRV-06 Ver alertas na central (RF-05) 🟢
```gherkin
Cenário: central de notificações
  Dado fridge_out_of_range e delivery_expiring criadas
  Quando a gestão abre /notifications
  Então vê os textos formatados e pode marcar como lida sem resolver a origem
```
