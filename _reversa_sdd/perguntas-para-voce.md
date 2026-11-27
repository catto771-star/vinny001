# Perguntas para você (em linguagem simples)

Responda pelo número, por exemplo: "1 = A, 2 = B, 3 = não sei". "Não sei" é uma resposta válida: eu escolho a opção mais segura e aviso.

---

## Bloco 1: Privacidade e segurança (mais importantes)

**1. Dados dos moradores guardados para uso sem internet.**
Hoje, o celular ou computador guarda uma lista com nomes, datas de nascimento e PASS ID para o caso de faltar internet. Essa lista nunca é apagada, nem quando a pessoa sai do sistema.
- A) Apagar a lista quando a pessoa sair do sistema (mais seguro).
- B) Apagar sozinha depois de alguns dias sem uso.
- C) Deixar como está, porque o aparelho é só da casa.

**2. Histórico de ações (quem fez o quê).**
O histórico guarda tudo para sempre, inclusive dados pessoais dos moradores. Cresce sem limite.
- A) Guardar por um tempo fixo (por exemplo, 2 ou 7 anos) e depois apagar ou resumir.
- B) Guardar para sempre.
- C) Preciso perguntar ao seu chefe ou ao jurídico.
Se escolher A, qual seria o prazo?

**3. Desligar a segunda etapa do login (código por e-mail) para gerentes.**
Existe uma opção que desliga essa segunda etapa para a gestão. Quem pode desligar? Em que casos?
- A) Só o dono da conta (Owner).
- B) Admin e Owner.
- C) Ninguém: a segunda etapa é obrigatória sempre.

**4. Saída automática por inatividade.**
Hoje, quem fica parado é desconectado apenas pelo navegador, o que um técnico pode contornar.
- A) Aceitar assim.
- B) Quero que o servidor também desconecte após certo tempo parado.

**5. A conta "Developer" (a sua).**
Como ela é criada hoje não está documentado. Quem deve poder criar ou apagar contas desse tipo?
- A) Só você, direto no banco.
- B) Qualquer Owner.

**6. Quando você publica uma mudança no banco de dados, como volta atrás se der problema?**
Hoje não existe "botão de desfazer" nem backup documentado.
- A) Vou configurar backups automáticos no Supabase.
- B) Prefiro que você crie um roteiro de como desfazer cada mudança.
- C) Não sei o que é melhor.

---

## Bloco 2: Moradores e camas

**7. Ao colocar alguém numa cama marcada como "Bed cancelled", a saída do morador anterior vale automaticamente.**
Antes, quem confirmava a saída era o Admin. Hoje, qualquer pessoa que admite o novo morador acaba confirmando.
- A) Está certo assim (mais rápido).
- B) Só o Admin deveria poder liberar a cama.

**8. Marcar de novo um morador que já foi marcado como presente (Seen ou Room Check).**
Hoje dá para marcar outra vez e o sistema aceita.
- A) Deve avisar e não deixar.
- B) Pode, mas deve ficar registrado que mudou.
- C) Deixar como está.

**9. Desfazer uma marcação apaga de verdade o registro.**
Fica só no histórico de ações. Antes, a regra dizia "nunca apagar".
- A) Está bem, porque o histórico guarda.
- B) Deve virar "anulado" e continuar visível.

**10. Advertência final (Final Warning).**
Hoje ela vale por estadia. Se o morador sai e volta, a advertência "zera".
- A) Zera, porque é uma nova estadia.
- B) Deve valer para a pessoa, sempre.

**11. A conta da recepção (usada pela equipe no turno).**
Ela pode admitir um morador pelo mapa de camas, mas não consegue editar os dados dele depois. Quer padronizar?
- A) Pode admitir e editar.
- B) Não pode nenhum dos dois, só a gestão.
- C) Pode admitir, mas só a gestão edita (como está).

**12. Busca de ex-moradores.**
O sistema mostra no máximo 500 pessoas. Isso basta?
- A) Sim.
- B) Quero busca sem limite.

---

## Bloco 3: Ocorrências, manutenção e passagem de turno

**13. Chamado de manutenção reaberto.**
Quando um chamado fechado é reaberto, ele continua mostrando a data em que foi resolvido antes.
- A) Limpar a data ao reabrir.
- B) Manter a data antiga como histórico.

**14. Anular uma nota de ronda.**
Quando uma nota de ronda (verificação das camas) é anulada, não dá para fazer outra nova naquele mesmo horário.
- A) Está certo, para não duplicar.
- B) Deve liberar para refazer.

**15. Editar uma nota do Handover.**
Se alguém corrige o texto e tinha mencionado outra pessoa, a menção não muda junto.
- A) A menção deve acompanhar a edição.
- B) Deixar como está.

**16. Aviso de lembrete de manutenção.**
Existe uma configuração em Settings para dizer de quantas em quantas horas lembrar, mas ela é ignorada (sempre 24 horas).
- A) Fazer a configuração funcionar.
- B) Remover a configuração da tela.

**17. Horário dos turnos (dia e noite).**
O sistema usa 7h e 19h fixos, mesmo existindo configuração. Esses horários mudam algum dia?
- A) Não, são fixos. Remover a configuração.
- B) Podem mudar. Fazer a configuração funcionar.

**18. Frases rápidas (quick phrases).**
Existe uma lista de frases prontas que ninguém usa na tela.
- A) Remover.
- B) Mostrar no Handover para a equipe escolher.

---

## Bloco 4: Serviços da casa e compras

**19. Alerta de produto perto de vencer.**
Na tela, o aviso é de 2 dias antes. No servidor, de 3 dias (configurável). Qual vale?
- A) A configuração do servidor (3 dias, ajustável).
- B) Sempre 2 dias.

**20. Erro ao lançar temperatura de geladeira ou entrega.**
Hoje não dá para corrigir um lançamento errado.
- A) Permitir corrigir, ficando registrado.
- B) Permitir anular.
- C) Não permitir.

**21. Entrega ligada ao pedido errado.**
Não dá para desligar uma entrega de um pedido.
- A) Permitir desligar (só Admin).
- B) Deixar como está.

**22. Pedidos já entregues.**
Hoje ainda dá para mudar as linhas de um pedido já entregue.
- A) Bloquear mudanças depois de entregue.
- B) Permitir, mas só Admin.

**23. Relatório de compras.**
Pedidos em rascunho (status "Created") entram no total gasto.
- A) Só contar pedidos já feitos ("Placed") em diante.
- B) Contar tudo, como está.

**24. Lista fixa de itens do Tesco.**
Hoje não dá para desativar um item.
- A) Permitir desativar.
- B) Deixar como está.

**25. Sistema antigo de produtos e compras.**
Existe no banco um modelo antigo (produtos, movimentações) sem nenhuma tela.
- A) Pode ser apagado.
- B) Ainda será usado no futuro.

**26. Notificações sem aviso no celular (push).**
Algumas notificações aparecem só dentro do sistema: limite mensal de No Show, falta de cobertura, conflito de férias e entregas recebidas ou perto de vencer.
- A) Mandar aviso no celular para todas.
- B) Só para as mais urgentes (diga quais).
- C) Deixar como está.

---

## Bloco 5: Equipe e horários

**27. Turnos que se sobrepõem.**
Ao confirmar as horas de um turno, o sistema pode criar um que se sobrepõe a outro.
- A) Bloquear.
- B) Avisar, mas permitir.

**28. Cobertura da escala.**
Hoje o sistema só alerta se não houver ninguém em um turno. Não alerta se houver gente demais ou de menos.
- A) Alertar também quando for menos do que o mínimo.
- B) Está bom assim.

**29. A semana da escala (Rota) começa à meia-noite, e a das horas (Hours) às 7h.**
- A) Padronizar nas 7h.
- B) Padronizar à meia-noite.
- C) Deixar como está.

**30. Modelos de tarefas diárias.**
Hoje não dá para desativar um modelo pela tela.
- A) Criar o botão.
- B) Deixar como está.

---

## Bloco 6: Configurações e aparência

**31. Criar ou desativar uma casa nova.**
Não existe tela para isso. Só 47/48 Amiens e Connolly.
- A) Não precisamos disso.
- B) Criar a tela (o sistema já suporta mais casas por trás).

**32. Idiomas.**
O banco foi preparado para inglês, português e polonês, mas a tela só usa inglês.
- A) Só inglês (remover o resto).
- B) Voltar a oferecer outros idiomas no futuro.

**33. Cores com pouco contraste.**
Alguns botões (aviso em amarelo e perigo em vermelho no tema escuro) são difíceis de ler.
- A) Corrigir as cores.
- B) Deixar como está.

**34. Quando outro desenvolvedor mexer no banco, quem garante que o isolamento entre as casas continua certo?**
Hoje não há uma rotina automática que teste isso.
- A) Quero uma rotina automática no GitHub.
- B) Vou lembrar de rodar os testes.

**35. Relatórios em CSV (Audit).**
O arquivo exporta só as linhas que estão na tela, com títulos em inglês.
- A) Exportar tudo o que o filtro encontrar.
- B) Deixar como está.

---

## Como vou usar suas respostas
- As respostas de bloco 2, 3 e 4 viram correções de código, feitas com teste primeiro.
- As de bloco 1 e 6 definem a política de segurança e entram na documentação.
- Quanto ao que fica pendente (problema 4, Manager promover usuários): registrado como decisão sua, "Manager tem autonomia completa". Atualizo o documento de permissões nesse sentido.
