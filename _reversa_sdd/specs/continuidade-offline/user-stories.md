# Histórias de usuário — continuidade-offline

## US-CON-01 Imprimir a folha de continuidade (RF-04) 🟢
```gherkin
Cenário: folha ao vivo
  Dado que estou online e autenticado
  Quando abro /continuity
  Então vejo as casas com quartos, camas, nomes, tag FW e a caixa "Outside"
  E posso imprimir em preto e branco

Cenário: cama com Out decidido
  Dado estadia out_pending
  Então a linha aparece como "cancelled" e sem caixa "Outside"
```

## US-CON-02 Abrir sem internet (RF-02, RF-05) 🟢
```gherkin
Cenário: aparelho offline sem sessão
  Dado que o aparelho está offline e há snapshot guardado
  Quando abro /continuity
  Então vejo a folha guardada com aviso de que é uma cópia guardada

Cenário: sem cópia
  Dado que nunca houve snapshot
  Quando abro /continuity offline
  Então não há dados a mostrar
```

## US-CON-03 Manter a cópia fresca (RF-03) 🟢
```gherkin
Cenário: refresh automático
  Dado qualquer tela aberta
  Quando passa 1 hora
  Então o snapshot é regravado

Cenário: falha de rede com navigator.onLine verdadeiro
  Quando fetchSnapshot falha
  Então o app trata como offline e mantém o cache
```

## US-CON-04 Abrir o app sem rede (RF-06) 🟢
```gherkin
Cenário: shell em cache
  Dado que já abri o app online
  Quando abro offline qualquer rota
  Então recebo o "/" em cache e o React Router resolve a rota

Cenário: chamadas ao Supabase
  Quando o app tenta falar com o Supabase offline
  Então a chamada falha (nunca é cacheada)
```

## US-CON-05 Instalar como PWA (RF-07) 🟢
```gherkin
Cenário: instalação
  Quando instalo o app
  Então abre em modo standalone em /?source=pwa

Cenário: conta da casa no app instalado
  Quando uma conta station abre o app instalado
  Então vê a mensagem de que o app instalado é só para Admin
```
