# Histórias de usuário — notificacoes-e-push

## US-NTF-01 Receber push de chamado urgente (RF-02..RF-06) 🟢
```gherkin
Cenário: push habilitado
  Dado um Admin com push ligado e "maintenance:urgent" por padrão
  Quando um chamado urgente é criado
  Então o trigger chama send-push e o aparelho exibe a notificação com link para /maintenance

Cenário: preferência desligada
  Dado o Admin desligou "maintenance:urgent"
  Quando um chamado urgente é criado
  Então ele não é destinatário do push (a notificação continua na central)

Cenário: falha do push
  Quando send-push falha
  Então o registro da notificação permanece (exceção engolida)
```

## US-NTF-02 Ativar push no aparelho (RF-07, RF-08) 🟢
```gherkin
Cenário: iPhone fora do PWA
  Dado um iPhone sem o app instalado
  Então o estado é "needs-install"

Cenário: permissão negada
  Quando nego a permissão do navegador
  Então o estado é "denied" e vejo mensagem específica

Cenário: ativar
  Quando ativo em Settings > Notifications
  Então a assinatura é gravada com endpoint https e chaves válidas
  E um endpoint repetido é reatribuído ao staff atual

Cenário: assinatura inválida
  Quando envio endpoint sem https
  Então recebo invalid_subscription
```

## US-NTF-03 Ver a central de notificações (RF-10) 🟢
```gherkin
Cenário: lista e badge
  Dado 3 notificações não lidas
  Quando abro /notifications
  Então vejo até 100 itens e o badge mostra 3 (janela de 30 dias)

Cenário: marcar lida
  Quando toco em uma notificação
  Então ela fica lida (otimista) sem resolver o item de origem

Cenário: não gestão
  Quando um usuário não gestor abre /notifications
  Então a rota não aparece no menu
```

## US-NTF-04 Escolher o que notificar (RF-09) 🟢
```gherkin
Cenário: tag por tag
  Quando ligo "tag:incident" e desligo "tag:health"
  Então o push segue as preferências explícitas

Cenário: padrão
  Dado nenhuma preferência
  Então vale push_default (tags com notify_default e os 4 alertas padrão)
```

## US-NTF-05 Clicar na notificação (RF-06) 🟢
```gherkin
Cenário: janela aberta
  Dado o app aberto
  Quando clico na notificação
  Então a janela é focada e navega para data.url

Cenário: app fechado
  Quando clico
  Então uma nova janela abre em data.url (padrão /notifications)
```
