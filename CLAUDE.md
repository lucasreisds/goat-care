# Project conventions (override anything below that conflicts)

- **Language:** everything is in English: code (identifiers, comments, file names), commit messages, branch names, docs, CHANGELOG, PR text.
- **Only in-game user-facing text is in Brazilian Portuguese** (UI labels, character dialogue, goal/shop/ranking copy). Keep it in dedicated i18n/string files, never mixed into logic.
- **Branches:** English, kebab-case, e.g. `stage-1-test-scene`, `stage-2-character`, `stage-3-goals`, `stage-4-shop-wardrobe`, `stage-5-online-ranking`, `stage-6-notifications-pwa`.
- **Changelog:** `CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); update the `[Unreleased]` section with every user-visible change.
- **Versioning:** [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`); release tags are `vX.Y.Z`.

---

# Original project prompt (written in Portuguese)

Crie um PWA mobile-first chamado "goat-care" (Vite + TypeScript +
PixiJS), inspirado no app Finch: um pet de autocuidado em que o jogador
cumpre METAS PRÓPRIAS para cuidar de uma CABRA DAS MONTANHAS BÍPEDE.
Otimizado para iOS Safari instalado na Tela de Início. Uso online por
2 pessoas (uma dupla), com ranking competitivo entre elas.
Interface e textos em português do Brasil.

== ARQUITETURA DE PERSONAGENS (requisito central) ==
- O código NÃO pode ter nada específico da cabra. Cada personagem é um
  "pacote" data-driven com: manifesto (tamanho do sprite, animações,
  expressões, estágios de evolução), pontos de ancoragem por quadro
  (cabeça, entre os chifres, topo da cabeça, pescoço, tronco, mão,
  pernas, pés) e slots compatíveis
- Itens (roupas, acessórios) se encaixam por NOME de ancoragem e
  declaram em quais personagens funcionam (genéricos servem a todos)
- Estrutura pronta para novos personagens no futuro, com desbloqueio por
  conquistas ou moedas
- A cabra é o primeiro pacote
- O personagem fica em PONTO FIXO no cenário, com animações no lugar

== NOMES ==
- No onboarding, cada pessoa escolhe um nome para o seu personagem (até
  16 caracteres), com botão de sortear um nome sugerido
- O nome pode ser alterado depois nas configurações
- Guardar o nome do personagem no perfil da pessoa, separado do nome de
  exibição dela e por personagem (não dentro do pacote do personagem),
  para suportar vários personagens no futuro
- Usar o nome nas falas do personagem, nos check-ins de humor, nos
  carinhos e no ranking (ex.: "Pico, da Ana")

== DIREÇÃO DE ARTE (hi-bit pixel art) ==
- Referência de estilo: Owlboy (pixel art detalhada, paleta rica com hue
  shifting, contorno colorido, animação fluida com squash & stretch e
  movimento secundário). Use só como referência de princípios, sem
  copiar nenhum asset
- Sprite de 64x64 px, 2 a 4 quadros por animação, complementados por
  movimento em código (orelhas, barbicha, rabinho, cachecol)
- Camadas: corpo (por estágio) > roupa > expressão > acessórios, com
  ancoragem por quadro
- Cena com resolução interna em retrato (~180x320), escalada com
  image-rendering: pixelated
- Placeholders gerados por código (paleta + grade de pixels), com
  estrutura de assets e nomes de arquivo prontos para trocar pela arte
  final feita à mão

== CABRA DAS MONTANHAS ==
- Bípede, em pé. Evolução em 4 estágios marcada principalmente pelos
  CHIFRES (filhote, jovem, adulto, forma especial lendária)
- Expressões: neutro, feliz, sonolento, triste, apaixonado, comendo
  (mascando), surpreso. Pupila horizontal, orelhas e barbicha expressivas
- Animações: parada (respiração, piscadas, movimento secundário),
  comemorando (cabeçada ou pulinho), comendo/mascando, dormindo
- Slots do guarda-roupa: cabeça, pescoço, tronco, mão, pernas, pés
- Regra de encaixe de chapéu: fica ENTRE os chifres (ponto de ancoragem
  próprio)

== CENÁRIO E ILUMINAÇÃO DINÂMICA (inspirada no Sea of Stars, em código) ==
- Luz ambiente por camada multiply conforme a hora real do aparelho,
  com transições suaves de amanhecer e entardecer
- Luzes pontuais aditivas com tremulação (lampião, lareira)
- Raios de sol com partículas de poeira
- Tingir a cabra com a luz quente do ambiente
- DIA: pico de montanha ao ar livre (grama, flores, neve ao fundo,
  parallax de montanhas, vento na grama)
- NOITE: cabana de montanha aconchegante (lampião quente, janela com
  lua, estrelas e neve caindo, feno e cobertor)
- Concluir uma meta dispara um efeito de luz com partículas
- Performance: limitar a 30 fps, pausar com a aba oculta, poucas luzes
  simultâneas

== METAS (núcleo do jogo) ==
- Criação 100% livre: título, dificuldade (fácil, média, difícil),
  lembrete opcional
- Metas RECORRENTES: criadas uma vez, repetem automaticamente. Frequência:
  todos os dias, dias específicos da semana, X vezes por semana (em
  qualquer dia) ou pontual (com ou sem data)
- REVISÃO SEMANAL opcional na segunda-feira: mostra o resumo da semana e
  permite manter, editar, pausar ou arquivar cada meta e criar novas. Se
  a pessoa ignorar, as metas continuam como estavam
- Edições, pausas e novas metas passam a valer a partir do dia seguinte
- Metas pausadas não quebram a sequência de dias nem contam como falha
- Limite de 10 metas ativas por pessoa
- Concluir gera energia, moedas e ALTITUDE: a cabra sobe a montanha
  conforme o progresso, e cada marco de altitude desbloqueia cenário e
  itens novos
- Check-in de humor diário com resposta do personagem
- Resumo semanal de progresso
- O dia e a semana viram conforme o fuso horário da dupla (padrão
  America/Sao_Paulo); a semana começa na segunda

== RANKING (dupla) ==
- Pontos por dificuldade: fácil = 1, média = 3, difícil = 5
- Metas de "X vezes por semana" pontuam a cada conclusão, sempre
  respeitando o teto diário
- TETO DIÁRIO DE PONTOS escolhido pelos usuários: é uma configuração da
  dupla (padrão 15), que só muda quando os DOIS confirmam, e passa a
  valer a partir do dia seguinte
- Bônus de constância pequeno e limitado (ex.: +10% a cada 3 dias
  seguidos, com máximo)
- Placar SEMANAL que zera toda segunda, com histórico das semanas
  anteriores
- Visualização: as duas cabras subindo a mesma montanha lado a lado com
  a altitude da semana, em tempo real
- Sem punição: o personagem nunca morre, só fica quietinho/sonolento

== CONEXÃO ONLINE E CONTAS ==
- Firebase: Authentication com E-MAIL E SENHA (com recuperação de senha
  por e-mail e verificação de e-mail), Firestore em tempo real e Hosting.
  NÃO use link mágico nem login com Google por redirecionamento, pois
  funcionam mal no PWA instalado no iOS
- Credenciais em .env. Explique passo a passo como criar o projeto no
  Firebase
- Pareamento da dupla por código de convite de 6 caracteres
- "Carinhos": mensagens rápidas pré-definidas e presentes de itens entre
  os dois, em tempo real (sem chat livre por enquanto)
- Regras do Firestore seguras: só os dois da dupla leem e escrevem os
  dados compartilhados, e cada um só grava as próprias conclusões e metas

== PWA ==
- Manifest, ícones, service worker, offline básico (marcar metas offline
  e sincronizar depois), meta tags para iOS
- Notificações ficam para uma etapa final: explique as limitações do iOS
  (só funcionam com o app na Tela de Início) antes de implementar

== COMO TRABALHAR ==
Antes de codar, mostre: o plano, a estrutura de dados do Firestore, as
regras de segurança, o formato do "pacote de personagem" e a arquitetura
de renderização (camadas de sprite e de luz). Entregue em etapas
pequenas, rodando e validando cada uma:
1. Cena de teste: cabra placeholder + luz ambiente dia/noite
2. Pacote de personagem, camadas, expressões e animações
3. Metas recorrentes, revisão semanal, recompensas e altitude (ainda sem
   backend)
4. Evolução, lojinha e guarda-roupa
5. Login, pareamento, ranking visual em tempo real e carinhos
6. Notificações e acabamento do PWA
Ao final de cada etapa, diga como testar no iPhone e como publicar na
hospedagem gratuita do Firebase.

== AMBIENTE ==
Estou no Windows (nativo, sem WSL), projeto em C:\dev\goat-care, fora do
OneDrive. Use comandos compatíveis com PowerShell/Windows e verifique
se Git e Node (LTS) estão instalados antes de começar.

== PRIMEIRO PASSO ==
Antes de qualquer código: salve este prompt inteiro em um arquivo
CLAUDE.md na raiz do projeto, inicialize um repositório Git e me mostre
só o PLANO: estrutura de pastas, estrutura de dados do Firestore, regras
de segurança, formato do "pacote de personagem" e arquitetura de
renderização (camadas de sprite e de luz). Não escreva código ainda.
