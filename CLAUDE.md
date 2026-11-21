# Project conventions (override anything below that conflicts)

- **Language:** everything is in English: code (identifiers, comments, file names), commit messages, branch names, docs, CHANGELOG, PR text.
- **Only in-game user-facing text is in Brazilian Portuguese** (UI labels, character dialogue, goal/shop/ranking copy). Keep it in dedicated i18n/string files, never mixed into logic.
- **Branches:** English, kebab-case, e.g. `stage-1-test-scene`, `stage-2-character`, `stage-3-goals`, `stage-4-shop-wardrobe`, `stage-5-online-ranking`, `stage-6-notifications-pwa`.
- **Changelog:** `CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); update the `[Unreleased]` section with every user-visible change.
- **Versioning:** [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`); release tags are `vX.Y.Z`.

---

# DECISIONS AND STATUS (DECISÕES E STATUS)

## Status

| Stage | Branch | Version | Status |
|---|---|---|---|
| 0 Plan (folders, Firestore, rules, character pack, rendering) | `main` | — | **Done** |
| 1 Test scene: placeholder goat + day/night ambient light | `stage-1-test-scene` | 0.1.0 | **Done** (released) |
| 2 Character pack, layers, expressions, animations | `stage-2-character` | 0.2.0 | Implemented, awaiting iPhone test |
| 3 Recurring goals, weekly review, rewards, altitude (no backend) | `stage-3-goals` | 0.3.0 | Implemented, awaiting iPhone test |
| 4 Evolution, shop, wardrobe | `stage-4-shop-wardrobe` | 0.4.0 | Implemented, awaiting iPhone test |
| 5 Login, pairing, realtime ranking, caresses | `stage-5-online-ranking` | 0.5.0 | Implemented, awaiting iPhone test |
| 6 Notifications and PWA polish (official publish) | `stage-6-notifications-pwa` | 1.0.0 | Implemented, awaiting iPhone test; official publish and `v1.0.0` only after approval |

Flow: stage branches start from `develop`, merge back into `develop`, release to `main` with tag `vX.Y.Z` and a `CHANGELOG.md` entry. Firebase Hosting is configured from stage 1 for **preview channels only** (see `docs/firebase-setup.md`); the official live deploy is stage 6.

## Decisions

1. **Goals are visible to the partner.** They live in `couples/{coupleId}/goals/{goalId}` with an `ownerUid` field: any member reads, only the owner writes. (Moved out of `users/{uid}` to keep the rules to a single `get()`.)
2. **Daily cap is enforced by Firestore rules only** (Spark plan, no Cloud Functions). The cap is per person.
3. **Altitude is calibrated by time, not by number.** Reference player: 10 points/day at 5 m/point = 50 m/day. Targets: young ≈ 14 days → **700 m**, adult ≈ 60 days → **3000 m**, legendary ≈ 165 days (~5.5 months) → **8250 m**. Meters per point is a fixed constant (5), not derived from the live cap, so changing the couple's cap speeds progress up or down but never rescales existing altitude. Altitude is computed from `awardedPoints` (after cap and bonus). Unlock milestones are defined in days × 50 m: 3, 7, 14, 30, 45, 60, 90, 120, 165 days → 150, 350, 700, 1500, 2250, 3000, 4500, 6000, 8250 m (provisional, in `core/progression/altitude.config.ts`). With the max +30% streak bonus and the 15-point cap, the fastest possible player reaches "young" in ~8 days.
4. **Offline completions are recalculated at sync.** The queue is processed in `completedAt` order, one batch per completion: read `days/{uid_dayKey}`, set `awardedPoints = min(base + bonus, capRemaining)` (can be 0), write completion + increment `days` + increment weekly score together. A completion is never discarded for hitting the cap. Rules validate the batch with `getAfter()`: new day total = old total + `awardedPoints` and ≤ cap; `basePoints` matches the difficulty; `awardedPoints` ≤ base × 1.3 (rounded up). Completions that sync after the grace window (decision 5) are kept locally as "late": personal coins/energy only, 0 ranking points, 0 altitude.
5. **Weeks are closed by time, not by anyone.** There is no `closed` field and no one marks it. `weekKey` is the Monday date `yyyy-MM-dd` (so rules can build a timestamp with `timestamp.date()`). The couple stores a fixed `utcOffsetMinutes` (−180 for America/Sao_Paulo). Rules allow writes to `days/*`, `completions/*` and `weeks/{weekKey}/scores/*` only while `request.time < periodEnd + 48h` (grace for offline sync); afterwards those documents are read-only. The weekly winner is derived on read from the final scores. DST zones drift by at most 1 h, absorbed by the grace.
6. **Invite code:** 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no I, O, 0, 1), single use, expires in **30 minutes** (constant, adjustable), regenerable. `invites/{code}` allows `get` only, never `list`.
7. **Verified email is required** (`request.auth.token.email_verified == true`) to write couple data and to create/use invites. Impact: (a) rules tests must build contexts with `{ email_verified: true }` plus a negative test with `false` for every couple write; (b) the app needs an "I verified my email" button that calls `user.reload()` and `getIdToken(true)`, otherwise the cached token stays unverified for up to 1 h; (c) on iOS the verification link opens in Safari, not in the installed PWA, so the user has to come back to the app manually; (d) the Auth emulator needs users flagged as verified for end-to-end tests.
8. **Evolution is driven by altitude only** (`minAltitude` per stage). Achievement unlocks apply to new characters and items, not to stages.
9. **No local-to-Firebase data migration.** Stages 1–4 use a throwaway local store; stage 5 starts clean. Only the offline sync queue survives as a mechanism.

10. **Rewards (stage 3 defaults, easy to retune in `core/progression/rewards.ts`):** coins = 2 per base point and energy = 1 per base point (both follow the goal's own value and ignore the daily cap, so a capped day never feels wasted); altitude = 5 m per awarded point (so the cap also limits the climb); awarded points = round(base × (1 + streak bonus)) cut down to what is left of the daily cap. A goal can be completed at most once per day; goals created today start tomorrow. Streak = consecutive days with at least one completion, counted up to yesterday; days with nothing scheduled are neutral.
11. **Weekly review** is offered on Mondays for the previous week, only if enabled and not yet handled; closing it in any way marks it handled and leaves every goal untouched.

12. **Shop and wardrobe (stage 4):** the coin balance = coins earned − `inventory[*].paid`, never stored. Achievement items are owned automatically once the achievement is met (achievements are derived from state, in `core/progression/achievements.ts`); "first-week" = completions on 7 different days. What is worn lives in `wardrobe[characterId][slot]`, one item per slot, and is ignored if the item is no longer owned or compatible. Old saves without `inventory`/`wardrobe` load with empty defaults.

13. **Online data layout (stage 5):** `users/{uid}` is private (`coupleId` plus a `state` map with profile, moods, weekly reviews, inventory, wardrobe, gifts sent and late completions). Everything shared lives under `couples/{coupleId}`: `members/{uid}` (the card the partner sees: names, total altitude, outfit, owned items), `goals/{goalId}`, `completions/{uid_goalId_dayKey}` (the id enforces one completion per goal per day), `days/{uid_dayKey}` and `weeks/{weekKey}/scores/{uid}` (counters that only move in the same batch as a new completion, each carrying `lastCompletionId` so the rules can cross-check with `getAfter()`), and `caresses/{id}`. A person belongs to at most one couple; leaving a couple is not supported yet.
14. **A couple can start with one member.** Whoever creates it plays right away and invites the partner later from Menu > Dupla. Joining consumes the invite, adds the member and sets `users/{uid}.coupleId` in one batch.
15. **Daily cap changes:** the couple stores `dailyCap`, `capNext { value, from }` and `capProposal { value, by }`. One member proposes, only the OTHER can accept, and accepting sets `capNext.from` to tomorrow (rules check it against `request.time`) while folding a change already in force into `dailyCap`. Range 5 to 50; a couple of one cannot change it.
16. **Gifts:** a gift is a `caresses` document of kind `gift` whose `ref` is an item id. The sender pays the item's coin price (`giftsSent`, subtracted from the balance like a purchase); the receiver gets the item in the inventory with `paid: 0`. Coins stay client-side and are not validated by rules (they are personal, not competitive).
17. **State source in stage 5:** the app composes `GameState` from Firestore listeners (persistent local cache) instead of `localStorage`. Only the completion sync queue is kept in `localStorage` (`goat-care/queue/{uid}`), because completions must be recalculated in a transaction at sync time (decision 4). The weekly ranking is derived live from the week's completions; `weeks/*/scores` is read for the history.
18. **Local testing:** `npm run emulators` (Auth + Firestore, needs Java 21) with `npm run dev:emulators` (mode `emulator`, project `demo-goat-care`, reads `.env.emulator`), and `npm run test:rules` for the security rules. Rules are deployed with `firebase deploy --only firestore:rules`.

13. **Notifications (stage 6):** push is Web Push via FCM, sent by a scheduled GitHub Actions job (`scripts/notify/send.ts`, every 5 min) because the Spark plan has no Cloud Functions; the job uses the Admin SDK with a service-account secret. Devices register in `users/{uid}/devices/{id}`. Goal reminders are sent once per goal per day (marker in `couples/{id}/reminders`), dropped if more than 3 h late; caresses are marked `pushedAt`. iOS only supports push for the installed Home Screen app (16.4+), needs a tap for permission and has no local scheduling. The official publish (`npm run deploy:live`) and the `v1.0.0` tag wait for the user's go-ahead.

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
