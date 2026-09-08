# Journal des décisions — sohub-claude-visualizer

Append-only : on ajoute des entrées, on n'en réécrit jamais. Les tickets suivants y ajoutent
les leurs. C'est ici que vit ce qui explique et justifie — donc ce qui n'a rien à faire dans
`CLAUDE.md`.

---

## 2026-09-07 — Construire l'outil malgré l'existence d'outils de consommation

**Décision** — construire l'outil.

**Alternative écartée** — s'en remettre à un outil tiers de suivi de consommation
(type `ccusage`), qui lit les mêmes fichiers.

**Objection soulevée et réponse** — objection : la consommation de tokens par session et par
projet est déjà couverte par des outils existants ; ce qui ne l'est pas, c'est l'arbre agents /
sous-agents avec leur tâche et leur statut. Réponse de l'utilisateur : il n'a aujourd'hui
aucune visibilité, et c'est bien le « qui fait quoi » qui l'intéresse. Décision prise, sujet
clos.

---

## 2026-09-07 — Le temps réel est dans la v1

**Décision** — la v1 couvre à parts égales la surveillance pendant un run et l'analyse à
froid après coup.

**Alternative écartée** — une v1 en consultation seule, avec un bouton rafraîchir, le live
reporté à une v2.

**Objection soulevée et réponse** — objection : le temps réel est le poste de coût principal
(surveiller des fichiers en écriture, pousser vers l'interface) et le premier candidat au
hors-scope. Réponse de l'utilisateur : les deux usages comptent autant. Décision prise, sujet
clos.

---

## 2026-09-07 — Serveur local et navigateur, pas d'application de bureau

**Décision** — `npm start` démarre un serveur local ; la consultation se fait dans le
navigateur.

**Alternative écartée** — Electron ; Tauri ; une interface en terminal.

**Objection soulevée et réponse** — objection : Electron pour lire des fichiers locaux est
disproportionné, un serveur local fait le même travail sans packaging. L'utilisateur a retenu
le serveur local. Tauri écarté en plus faute de chaîne Rust vérifiée sur la machine ; TUI
écartée parce qu'une interface graphique était demandée.

---

## 2026-09-07 — Langage : TypeScript

**Décision** — TypeScript côté serveur et côté front.

**Alternative écartée** — JavaScript sans typage.

**Raison** — choix de l'utilisateur. Les structures lues sont riches (usage à cinq catégories,
métadonnées d'agent, statuts) et traversent une frontière réseau.

---

## 2026-09-07 — Front : Vue 3 + Vite

**Décision** — Vue 3 avec Vite comme outil de build.

**Alternative écartée** — React + Vite ; Svelte + Vite ; HTML/JS natif sans build.

**Raison** — choix de l'utilisateur.

---

## 2026-09-07 — Back : Express

**Décision** — Express.

**Alternative écartée** — Node natif sans framework (proposé en premier : quatre routes de
lecture seule sur localhost) ; Fastify ; Python + FastAPI.

**Raison** — choix de l'utilisateur.

---

## 2026-09-07 — Mise à jour live : SSE

**Décision** — flux SSE du serveur vers le navigateur, alimenté par un scan toutes les
3 secondes.

**Alternative écartée** — requête HTTP répétée par le navigateur toutes les 3 s ; WebSocket.

**Raison** — choix de l'utilisateur. Le besoin est unidirectionnel et l'outil est en lecture
seule : un canal bidirectionnel n'aurait rien à transporter en retour.

---

## 2026-09-07 — Interface : Tailwind CSS, sans librairie de composants

**Décision** — Tailwind CSS, composants écrits à la main.

**Alternative écartée** — PrimeVue (tableaux triables et filtrables tout faits) ; Vuetify ;
CSS écrit à la main sans utilitaires.

**Raison** — choix de l'utilisateur.

---

## 2026-09-07 — État : composable partagé, sans librairie

**Décision** — l'état (fenêtre courante, vue courante, données, abonnement SSE) vit dans un
composable Vue partagé.

**Alternative écartée** — Pinia.

**Raison** — choix de l'utilisateur. **Corollaire assumé** : pas de `vue-router` non plus — la
navigation entre les trois vues est un champ de ce même composable, ce qui évite d'introduire
une librairie que la réponse « sans lib » excluait.

---

## 2026-09-07 — Gestionnaire de paquets : npm

**Décision** — npm.

**Raison** — contrainte constatée : `npm --version` → `11.12.1` ; `pnpm --version`,
`yarn --version` et `bun --version` ne renvoient rien sur cette machine. Aucune alternative
disponible n'a été proposée.

---

## 2026-09-07 — Fenêtre temporelle : 7 jours par défaut, réglable depuis l'écran

**Décision** — un sélecteur `7 j / 30 j / tout` en haut de l'interface, 7 jours par défaut.

**Alternative écartée** — fenêtre figée à 7 jours sans sélecteur ; fenêtre réglable seulement
dans un fichier de configuration ; couverture de tout l'historique sans fenêtre.

**Raison** — choix de l'utilisateur : garder l'accès à l'historique ancien sans en payer la
lecture à chaque ouverture.

---

## 2026-09-07 — Statut d'agent : trois états, seuil d'inactivité à 5 minutes

**Décision** — `terminé` si le `tool_result` de son `toolUseId` existe chez le parent ;
`en cours` si son fichier a bougé il y a moins de 5 minutes ; `inactif` au-delà.

**Alternative écartée** — même règle avec un seuil à 2 minutes ; deux états sans seuil.

**Raison** — choix de l'utilisateur. Aucun champ de statut n'existe dans les fichiers : la
règle est une déduction, et le seuil devait être fixé par l'utilisateur plutôt qu'inventé.

---

## 2026-09-07 — Consommation : deux chiffres par session, propre et total

**Décision** — chaque session et chaque agent affichent leur consommation propre et leur
consommation sous-agents inclus.

**Alternative écartée** — un seul chiffre tout inclus ; un seul chiffre sans les sous-agents.

**Raison** — choix de l'utilisateur : c'est la seule façon de voir qu'un run coûteux l'est à
cause de ses sous-agents.

---

## 2026-09-07 — Agents affichés en arbre imbriqué

**Décision** — les sous-agents s'affichent sous leur parent, à leur profondeur réelle, en
nœuds repliables. La hiérarchie se reconstruit par `spawnDepth` et par le transcript dans
lequel se trouve le bloc `tool_use`.

**Alternative écartée** — liste plate avec une colonne profondeur ; deux niveaux maximum.

**Raison** — choix de l'utilisateur, fidèle à la demande initiale (« mes agents et
sous-agents »).

---

## 2026-09-07 — Lignes illisibles : ignorées, comptées, signalées

**Décision** — une ligne de transcript non parsable est ignorée, comptée, et le compteur est
affiché sur la session concernée.

**Alternative écartée** — ignorer silencieusement ; marquer la session entière en erreur.

**Raison** — choix de l'utilisateur : voir que la lecture est partielle sans que l'écran casse.

---

## 2026-09-07 — Lecture incrémentale par date de modification

**Décision** — le scan de 3 secondes compare les `mtime` et ne relit que les fichiers modifiés ;
les agrégats sont gardés en mémoire.

**Alternative écartée** — relecture complète du dossier à chaque scan ; surveillance système
des fichiers (`fs.watch` récursif).

**Raison** — choix de l'utilisateur. Contrainte constatée qui l'appuie : 165 transcripts, dont
certains de 700 Ko.

---

## 2026-09-07 — Hors scope v1 : graphiques et coût en dollars

**Décision** — la v1 n'affiche ni courbe ni camembert, et ne convertit rien en dollars.

**Alternative écartée** — les inclure ; `cost-state.totalCostUSD` et `modelUsage` sont pourtant
déjà disponibles par session dans les transcripts.

**Raison** — coupés explicitement par l'utilisateur lors du cadrage du périmètre.

---

## 2026-09-07 — Source de données : les transcripts, pas `~/.claude/token-logs/`

**Décision** — toutes les données viennent de `~/.claude/projects/`.

**Alternative écartée** — `~/.claude/token-logs/agent-events.jsonl` et `sessions.jsonl`, qui
ressemblaient à un flux agrégé tout prêt.

**Raison** — vérification faite : ces fichiers contiennent des données de test
(`"session_id":"sess-001"`, projet `ai-workflow`, agents `researcher`/`frontend-dev`,
modèles `haiku`/`sonnet`) sans correspondance avec les sessions réelles. Arbitrage pris sur
constat, non délégué.

---

## 2026-09-07 — Ports : 4318 pour le serveur, 5173 pour Vite en développement

**Décision** — le serveur sert l'API, le flux SSE et le front construit sur `4318` ; Vite tourne
sur `5173` en développement avec un proxy de `/api` vers `4318`. Les deux ports sont fixés
explicitement en configuration, jamais laissés implicites.

**Raison** — arbitrage de cadrage, présenté dans la fiche validée par l'utilisateur. Aucun
conflit de port n'a été vérifié sur la machine : si `4318` est occupé, le changer dans
`server/src/config.ts` est sans conséquence sur le reste.

---

## 2026-09-07 — Emplacement du projet

**Décision** — `~/Desktop/projets/ai/sohub-claude-visualizer`.

**Alternative écartée** — un sous-projet du dépôt `sohub-claude-plugins`.

**Raison** — choix de l'utilisateur ; le dossier existait déjà et était vide (constaté).

---

## 2026-09-07 — Filtrage des projets : deux règles distinctes

**Décision** — un dossier sans **aucun** transcript n'est jamais listé (son `cwd` est
introuvable, donc son chemin réel aussi) ; un dossier ayant des transcripts mais aucun dans la
fenêtre courante est omis pour cette fenêtre et réapparaît sur une fenêtre plus large.

**Alternative écartée** — lister les 10 dossiers en permanence avec des compteurs à zéro ;
lister les projets hors fenêtre en fin de liste, grisés ; reconstruire le chemin en
dé-sluggant le nom du dossier.

**Raison** — choix de l'utilisateur, sur constat fait à l'ouverture du premier ticket : sur
10 dossiers, 3 ne contiennent aucun transcript (`ai-workflow`, `discord-ai-news`, `startop`) et
2 autres n'ont que des sessions de plus de 30 jours. Le critère de validation D1 disait « les
10 dossiers apparaissent » : il était faux dès la première exécution et a été réécrit dans
`docs/cadrage.md`. La reconstruction du chemin depuis le nom du dossier a été écartée car elle
contredit une convention du projet et se trompe sur tout nom contenant un tiret.

---

## 2026-09-07 — Correction d'un chiffre du cadrage : 32 sessions, pas 165

**Décision** — les volumétries de référence sont : 32 sessions, 133 transcripts de sous-agents,
165 fichiers `.jsonl` au total, 10 dossiers de projet.

**Raison** — le comptage initial (`find ~/.claude/projects -name '*.jsonl'` → 165) était
récursif et incluait les sous-agents ; il a été relu comme un nombre de sessions dans le
cadrage. Recompté dossier par dossier à l'ouverture du premier ticket. `docs/architecture.md`
a été corrigé.

---

## 2026-09-07 — Statut d'une session : trois états, comme les agents

**Décision** — une session est `en cours` si son transcript a bougé il y a moins de 5 minutes ;
`terminée` si tous ses agents ont rendu leur `tool_result` ; `inactive` sinon.

**Alternative écartée** — deux états seulement (`en cours` / `terminée`), en réservant `idle`
aux agents.

**Raison** — choix de l'utilisateur : faire remonter les sessions dont un sous-agent est resté
en plan. Conséquence assumée sur l'implémentation : calculer le statut d'une session impose de
lire les métadonnées de ses sous-agents et de vérifier la présence de leur `tool_result` dans
le transcript parent — la liste des sessions ne peut donc pas se contenter de lire les
transcripts de session.

---

## 2026-09-07 — Navigation par fil d'Ariane, état en mémoire

**Décision** — un fil d'Ariane « Projets / <nom du projet> » en tête d'écran, dont le premier
segment ramène à l'accueil. La vue courante est un champ du composable partagé.

**Alternative écartée** — ajouter l'identifiant du projet dans l'ancre de l'URL (`#/projet/<id>`),
ce qui aurait fait fonctionner le bouton Retour du navigateur, permis de recharger sans perdre
l'écran et rendu un projet partageable par lien ; un simple bouton « ← Retour » sans fil
d'Ariane.

**Raison** — choix de l'utilisateur. **Conséquence assumée** : recharger la page ramène à
l'accueil, le bouton Retour du navigateur ne fait rien, et aucun lien ne pointe vers un projet
précis.

---

## 2026-09-07 — Correction de volumétrie : trois populations de transcripts, pas deux

**Décision** — les volumétries de référence sont : **33 sessions**, **38 agents directs**
(`subagents/agent-<id>.jsonl`, chacun avec son `.meta.json`, aucun orphelin), **102 agents de
workflow** (`subagents/workflows/<wf_id>/`), soit 173 fichiers `.jsonl`.

**Raison** — les deux comptages précédents étaient faux, chacun par déduction plutôt que par
mesure. Le premier annonçait « 165 sessions » (un `find` récursif comptait les sous-agents) ; la
correction du deuxième ticket annonçait « 133 sous-agents » (165 moins 32 sessions), ce qui
ignorait l'existence des agents de workflow. Recompté par appariement fichier par fichier à
l'ouverture du troisième ticket. Leçon consignée : une volumétrie se mesure, elle ne se déduit
pas d'une soustraction.

---

## 2026-09-07 — Aucun agent de profondeur supérieure à 1 dans les données

**Décision** — la récursivité de l'arbre est implémentée, mais le critère de validation D4 ne
peut pas l'exiger : il porte sur l'affichage des nœuds et du groupe de workflow, pas sur une
imbrication `spawnDepth: 2` inobservable.

**Raison** — comptage exhaustif des 38 `.meta.json` d'agents directs : tous portent
`spawnDepth: 1`. Le critère initial de `docs/cadrage.md` exigeait de constater un nœud de
profondeur 2 sous son parent : il était invérifiable dès l'écriture. Réécrit.

---

## 2026-09-07 — Les agents de workflow entrent dans l'arbre, sous un nœud de groupe

**Décision** — les 102 agents de workflow apparaissent sous un nœud de groupe repliable
(« Workflow <wf_id> — N agents »), replié par défaut, à côté des agents directs. Leur
consommation est comptée dans le `totalUsage` et le `agentCount` de la session.

**Alternative écartée** — les exclure comme le faisait le ticket précédent (la session
`020b8d2b` affichait 4 agents alors que 106 ont tourné, et leur consommation était invisible) ;
les afficher à plat avec les autres (un arbre à 106 nœuds pour une seule session).

**Raison** — choix de l'utilisateur. **Conséquence assumée** : le `agentCount` et le
`totalUsage` de la session `020b8d2b` augmentent par rapport à ce qu'affichait le ticket
précédent. Ce n'est pas une régression, c'est la correction d'un angle mort.

---

## 2026-09-07 — Statut d'un agent de workflow : sur la fraîcheur seule

**Décision** — un agent de workflow est `running` si son transcript a bougé il y a moins de
5 minutes, `done` sinon.

**Alternative écartée** — un quatrième statut « indéterminé », qui aurait dit explicitement
qu'on ne sait pas ; n'utiliser que `running`/`idle` sans jamais affirmer « terminé ».

**Raison** — choix de l'utilisateur, cohérence de lecture avec le reste de l'écran.
**Limite assumée et à ne pas oublier** : leurs métadonnées ne contiennent ni `toolUseId` ni
`description`, il n'existe donc aucun `tool_result` à retrouver — « terminé » est ici une
déduction d'inactivité, pas une preuve de fin.

---

## 2026-09-07 — Détail d'un agent en panneau latéral, prompt tronqué à 300 caractères

**Décision** — cliquer un nœud ouvre un panneau latéral, l'arbre restant visible. La tâche y est
affichée tronquée à 300 caractères, avec un dépliage vers le texte intégral.

**Alternative écartée** — le détail déplié sous le nœud dans l'arbre ; une vue dédiée en
quatrième niveau de navigation. Pour la tâche : la seule `description` courte, ou le prompt
intégral d'emblée.

**Raison** — choix de l'utilisateur : passer d'un agent à l'autre sans perdre l'arbre, et
reconnaître une tâche sans se faire noyer par un prompt de plusieurs milliers de caractères.

---

## 2026-09-07 — Le `tool_result` d'un agent asynchrone est un accusé de lancement, pas une fin

**Décision** — la fin d'un agent se lit selon ce que les données déclarent : la ligne du
`tool_result` porte un champ structuré `toolUseResult`. Si `isAsync` vaut `true` ou si `status`
vaut `async_launched`, ce `tool_result` n'est **pas** une fin : `endedAt` devient la dernière
ligne horodatée du transcript de l'agent, et le statut se déduit de l'inactivité (`running` si
moins de 5 minutes, `done` sinon). Sinon, le `tool_result` reste la preuve de fin.

**Alternative écartée** — prendre la dernière ligne du transcript pour tous les agents, ce qui
aurait renoncé à la preuve de fin dont disposent les agents synchrones ; ne rien changer et
documenter la limite.

**Raison** — défaut constaté à la livraison du ticket `0003` : l'API annonçait une durée de
**20 ms** pour l'agent `a732a1e499b30b001`, dont le transcript s'étend sur **5 min 49 s**. Le
`tool_result` de son `toolUseId` porte
`{"isAsync": true, "status": "async_launched", "agentId": "a732a1e499b30b001", ...}` et est
horodaté 20 ms après le lancement. Conséquence, plus grave que la durée : **tout agent
asynchrone était marqué « terminé » à la seconde où il démarrait**. Le critère de validation D5
exige de lire 5 min 49 s sur cet agent précis : il était en échec.

---

## 2026-09-07 — La tâche et le modèle se lisent d'abord dans `toolUseResult`

**Décision** — `description`, `prompt` et le modèle se lisent dans le champ `toolUseResult` de la
ligne de `tool_result` quand il est présent, avec repli sur le bloc `tool_use` du parent et sur
`message.model` sinon.

**Alternative écartée** — conserver le seul bloc `tool_use`, déjà vérifié et livré.

**Raison** — choix de l'utilisateur. Ce champ porte `description`, `prompt`, `agentId` et
`resolvedModel` sous forme structurée, sans avoir à retrouver le bloc `tool_use` correspondant.
Le repli garantit qu'aucun agent ancien ne régresse.

---

## 2026-09-07 — Le workflow compte 101 agents, pas 102

**Décision** — un dossier `subagents/workflows/<wf_id>/` contient les transcripts d'agents
`agent-*.jsonl` **et** un `journal.jsonl` qui n'en est pas un. Ce dernier est ignoré, sans être
compté comme ligne illisible.

**Raison** — constat fait à l'implémentation : `journal.jsonl` porte des lignes de type
`started`/`result` référençant plusieurs `agentId` — c'est un journal de corrélation partagé par
tout le workflow, structurellement incompatible avec un agent (ni champ `message`, ni ligne
`assistant`). C'est lui qui expliquait l'écart « 102 transcripts pour 101 métadonnées » relevé à
l'ouverture du ticket. La volumétrie de référence devient : 101 agents de workflow.

---

## 2026-09-08 — La frise chronologique fait exception à « aucune barre proportionnelle »

**Décision** — l'écran session porte désormais deux vues, au choix : la **chaîne d'appel** (arbre
à rail vertical, lot `0006`) et une **chronologie** — une frise horizontale où chaque agent est
une barre positionnée et dimensionnée selon son `startedAt` et sa durée. Cette frise déroge
explicitement à la règle du lot `0005` : « aucune visualisation de données (ni jauge, ni arc de
progression, ni sparkline, ni **barre proportionnelle sur un chiffre**) ». La dérogation est
bornée à cet usage : une barre y représente un **intervalle de temps**, jamais une grandeur
comme un nombre de tokens. Le reste du vocabulaire JARVIS s'applique intégralement, et
`CLAUDE.md` garde « graphiques et courbes » hors scope — une frise n'en est pas une.

**Portée** — le parallélisme se lit entre **frères directs** : chaque fratrie a son propre axe
temporel. Un recouvrement entre deux branches distinctes de l'arbre n'est donc pas visible.

**Alternatives écartées** — (a) respecter la règle `0005` telle quelle, en affichant les heures
de début/fin en texte plus un badge « en parallèle avec X, Y » : lisible, mais le chevauchement
se déduit au lieu de se voir, ce qui était précisément le reproche fait à l'écran ; (b) un axe
unique pour toute la session, qui aurait montré les recouvrements inter-branches mais devenait
illisible sur un groupe de workflow à une centaine d'enfants ; (c) remplacer la chaîne d'appel
par la frise, ce qui aurait perdu la filiation parent → enfant livrée au lot `0006`.

**Raison** — arbitrage de l'utilisateur à l'ouverture du ticket `0007`. L'écran listait les
agents sans dire quand ils avaient tourné ni lesquels l'avaient fait en même temps : la
géométrie est ici le seul rendu qui donne cette lecture immédiate. Aucun champ n'a été ajouté
pour cela — `startedAt`, `endedAt` et `durationMs` existaient déjà sur `AgentNode`.

**Conséquence de parsing** — `endedAt` étant fréquemment `null`, une barre en cours se ferme sur
l'instant présent (tick de `useNow`), jamais sur une valeur serveur absente. Et l'ordre des
agents venant d'un `readdirSync`, la frise **trie explicitement** par `startedAt` : le
commentaire de `AgentNode.vue` promettant un « ordre chronologique jamais retrié » ne vaut pas
garantie.
