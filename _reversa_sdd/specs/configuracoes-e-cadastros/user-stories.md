# Histórias de usuário — configuracoes-e-cadastros

## US-CFG-01 Trocar minha senha (RF-02) 🟢
```gherkin
Cenário: troca com reautenticação
  Dado que estou logado
  Quando informo senha atual correta e nova senha aceitável diferente da atual
  Então a senha muda e minhas outras sessões são encerradas

Cenário: senha atual errada
  Quando informo a senha atual incorreta
  Então vejo "current password wrong" e nada muda

Cenário: nova igual à atual
  Quando repito a senha atual
  Então vejo "same as current"
```

## US-CFG-02 Ajustar parâmetros do sistema (RF-03) 🟢
```gherkin
Cenário: faixa da geladeira
  Quando salvo min=-1 e max=6
  Então uma nova vigência é inserida e o histórico anterior permanece

Cenário: faixa inválida
  Quando salvo min=6 e max=2
  Então recebo invalid_parameter

Cenário: chave fora da lista
  Quando chamo set_system_parameter com "security.require_mfa_management"
  Então recebo unknown_parameter

Cenário: sem permissão
  Quando uma conta da casa chama set_system_parameter
  Então recebo not_authorised
```

## US-CFG-03 Cadastrar quartos e camas (RF-04) 🟢
```gherkin
Cenário: novo quarto
  Quando adiciono quarto "12" com 4 camas
  Então nascem camas numeradas 1 a 4

Cenário: duplicado
  Dado quarto "12" na casa
  Quando adiciono "12" de novo
  Então recebo room_exists

Cenário: remover cama ocupada
  Quando removo cama com estadia aberta
  Então recebo bed_occupied

Cenário: limite
  Quando peço 13 camas
  Então recebo too_many_beds
```

## US-CFG-04 Editar casas, geladeiras e máquinas (RF-04) 🟢
```gherkin
Cenário: renomear casa
  Quando renomeio com nome ≤60 e curto ≤30
  Então a lista de casas do app é atualizada

Cenário: máquina em uso
  Quando desativo máquina com utilização aberta
  Então recebo machine_busy

Cenário: não criar casa
  Quando procuro "adicionar casa"
  Então a opção não existe (apenas editar)
```

## US-CFG-05 Gerir tags (RF-07) 🟢
```gherkin
Cenário: criar e ordenar
  Quando crio tag "Visitor log" com cor azul e a subo na lista
  Então a ordem muda e o código é "visitor_log"

Cenário: limite
  Dado 20 tags
  Quando crio outra
  Então recebo too_many_tags
```

## US-CFG-06 Escolher alertas de push (RF-08) 🟢
```gherkin
Cenário: desligar categoria
  Quando desligo "maintenance:urgent"
  Então deixo de receber push dessa categoria (preferência explícita vence o padrão)
```

## US-CFG-07 Bloquear datas de férias (RF-09) 🟢
```gherkin
Cenário: bloqueio
  Quando bloqueio 24/12 a 02/01 com nota
  Então register_vacation nesse intervalo falha com dates_locked

Cenário: desbloquear
  Quando desbloqueio
  Então active=false e o calendário volta ao normal
```

## US-CFG-06b Isolamento por casa (RF-10) 🟢
```gherkin
Cenário: conta da casa vê só a sua
  Dado conta Amiens
  Quando consulta tabela com lodge_id de Connolly
  Então a política restritiva devolve zero linhas

Cenário: Float aberto
  Dado turno Float aberto
  Então aparece nas duas casas
```
