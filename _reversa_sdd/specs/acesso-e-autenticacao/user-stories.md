# Histórias de usuário — acesso-e-autenticacao

> Redator Reversa · 🟢/🟡/🔴. Cada história referencia RF/RN da `spec.md`.

## US-AUT-01 Entrar com senha (RF-01) 🟢
Como membro da gestão ou conta da casa, quero entrar com e-mail e senha para acessar o sistema.
```gherkin
Cenário: login válido de conta da casa
  Dado uma conta station ativa sem must_change_password
  Quando informo e-mail e senha corretos
  Então o estágio passa a "ready"

Cenário: credencial inválida
  Dado uma conta existente
  Quando informo senha errada e o Auth responde 400
  Então vejo a mensagem de credenciais inválidas e nenhuma sessão é criada

Cenário: limite de tentativas
  Quando o Auth responde HTTP 429
  Então vejo a mensagem "too many attempts"
```

## US-AUT-02 Confirmar acesso de gestão por código de e-mail (RF-03) 🟢
```gherkin
Cenário: segunda etapa concluída
  Dado um manager com sessão de senha e mfa_satisfied=false
  Quando peço o código, recebo o e-mail e informo o código de 6 dígitos
  Então o estágio passa a "ready"

Cenário: código sem pedido registrado
  Dado que alguém tem o e-mail mas não a senha
  Quando tenta verifyOtp sem begin_email_verification
  Então mfa_satisfied continua falso e o acesso de gestão é negado

Cenário: excesso de pedidos
  Dado 5 pedidos de código nos últimos 15 minutos
  Quando peço o sexto
  Então recebo too_many_code_requests ("too many codes")

Cenário: código não enviado automaticamente
  Quando abro a tela de código
  Então nenhum e-mail é enviado até eu acionar "enviar"
```

## US-AUT-03 Trocar a senha temporária (RF-04, RF-05) 🟢
```gherkin
Cenário: primeira troca
  Dado must_change_password=true
  Quando informo nova senha de 10+ caracteres com letra e dígito, repetida corretamente
  Então a senha é atualizada, must_change_password vira false e entro no sistema

Cenário: senha fraca
  Quando informo "abc123"
  Então vejo "password too weak" e nada é alterado
```

## US-AUT-04 Ser deslogado por inatividade ou desativação (RF-06) 🟢
```gherkin
Cenário: inatividade
  Dado security.session_idle_minutes = 15
  Quando fico 15 minutos sem interação
  Então sou deslogado com a mensagem de inatividade

Cenário: conta desativada durante o uso
  Dado uma sessão em "ready"
  Quando a gestão desativa minha conta
  Então em até 60 s is_active_staff() retorna false e sou deslogado

Cenário: falha de rede no polling
  Quando is_active_staff() não responde (data=null)
  Então não sou deslogado
```

## US-AUT-05 Criar conta da casa (RF-08) 🟢
```gherkin
Cenário: criar station
  Dado que sou Admin com MFA satisfeito
  Quando crio uma conta station com home_lodge_id, e-mail e senha forte
  Então o usuário Auth é criado com e-mail confirmado e a linha em staff tem must_change_password=true

Cenário: falha ao gravar staff
  Quando o insert em staff falha após criar o usuário Auth
  Então o usuário Auth é removido (compensação)

Cenário: criar developer
  Quando tento criar role=developer
  Então a Edge Function recusa

Cenário: chamador sem gestão
  Quando um station chama admin-users
  Então recebo 403 not_authorised
```

## US-AUT-06 Redefinir senha e desativar usuário (RF-08) 🟢
```gherkin
Cenário: reset por Admin
  Dado um usuário com login
  Quando redefino a senha com uma senha forte
  Então must_change_password vira true e a nova senha vale

Cenário: reset de usuário sem login
  Quando o alvo não tem user_id
  Então recebo 400 no_login

Cenário: desativação
  Quando desativo um usuário com login
  Então staff.active=false, o posto aberto é encerrado e o Auth recebe ban de 876000h
```

## US-AUT-07 Auditar leitura de perfil (RF-11) 🟢
```gherkin
Cenário: abertura de perfil registrada
  Quando abro o perfil de um residente
  Então uma linha em access_log registra ator, residente e contexto "profile"

Cenário: log imutável
  Quando alguém tenta UPDATE ou DELETE em audit_log
  Então recebo audit_log_is_immutable (42501)
```

## US-AUT-08 Mensagem de recusa correta (EB-06) 🟢 bug confirmado
```gherkin
Cenário: recusa por falta de permissão
  Dado que uma RPC levanta "not_authorised"
  Quando o erro chega ao front
  Então deveria aparecer errors.notAuthorised
  # Comportamento atual (bug): aparece errors.notAuthor "Author only…"
```
