# Architecture — sohub-claude-visualizer

Sauf mention contraire, ce qui est décrit comme *constaté* a été lu sur cette machine le
2026-09-07. Ce qui n'a pas pu l'être porte un bloc `> Hypothèse` et sa conduite à tenir.

## 1. Stack et commandes

| Brique | Choix | Constaté / déclaré |
|--------|-------|--------------------|
| Langage | TypeScript | déclaré |
| Runtime | Node | constaté : `node --version` → `v25.9.0` |
| Framework front | Vue 3 | déclaré |
| Outil de build | Vite | déclaré |
| Framework back | Express | déclaré |
| Librairie d'interface | Tailwind CSS, sans lib de composants | déclaré |
| Gestion d'état | Composable Vue partagé, sans lib | déclaré |
| Gestionnaire de paquets | npm | constaté : `npm --version` → `11.12.1` ; `pnpm`, `yarn` et `bun` absents de la machine |

- **Installation** : `npm install`
- **Build** : `npm run build`
- **Lancement** : `npm start` — sert l'API, le flux SSE et le front construit sur
  `http://localhost:4318`
- **Développement** : `npm run dev` — Vite sur `5173`, proxy de `/api` vers `4318`

**Contraintes structurelles**

- Un navigateur ne peut pas lire `~/.claude/projects/` : un processus local qui accède au
  disque est obligatoire. C'est la raison d'être du module `server`.
- Aucune écriture n'est possible dans `~/.claude/` : l'outil observe des fichiers écrits par
  Claude Code, il ne les modifie jamais.

## 2. Modules

### `server`

- **Responsabilité** : lire les transcripts, en dériver des agrégats, les exposer en REST et en
  SSE, et servir le front construit.
- **Expose** : les quatre routes REST et le flux SSE de la section 3.
- **Consomme** : `~/.claude/projects/` en lecture seule ; les types de `shared`.

### `web`

- **Responsabilité** : les quatre écrans — Centre de commande (accueil), liste complète des
  projets, écran d'un projet, page de session — et le détail d'un agent au sein de cette
  dernière. Aucun routeur : la navigation entre ces écrans est un état du composable partagé
  `useDashboard` (`currentScreen`, `currentProject`, `currentSession`, cf. section 4).
- **Expose** : rien — c'est le point terminal.
- **Consomme** : les routes REST et le flux SSE de `server` ; les types de `shared`.

**Écrans**

- **Centre de commande** (`ProjectsView.vue`) — écran d'accueil : grille plate de cartes de
  sessions vivantes (`SessionCard.vue`, jamais regroupées par projet) filtrable par statut
  (`FilterBar.vue`), avec une colonne latérale de répartition et de rappel des sessions
  inactives (`CommandSidebar.vue`).
- **Projets** (`ProjectsListView.vue`) — liste complète de tous les projets connus, sans la
  limite de la colonne latérale du Centre de commande. Le clic sur un projet ouvre son écran de
  sessions.
- **Écran d'un projet** (`ProjectView.vue`) — historique des sessions du projet ouvert (cartes
  `SessionCard.vue`), fil d'Ariane vers l'accueil. Le clic sur une session ouvre la page de
  session.
- **Page de session** (`SessionView.vue`) — page de détail plein écran d'une session, rendue
  par `App.vue` dans `<main>` à la place de l'écran courant dès que `currentSession` est
  renseigné (elle n'est jamais un tiroir ni un panneau latéral superposé). Bandeau sticky en
  tête (bouton ← Retour, fil d'Ariane `Breadcrumb.vue` avec pour racine « Centre de commande »,
  titre de session, agent courant, pastille de statut, grille de 5 cellules KPI — État, Agents,
  Tokens via `TokenCells.vue`, Appels outils). Sous le bandeau, trois onglets
  (`role="tablist"`, navigation clavier ←/→) : **Chronologie** (`ExecutionLanes.vue`, Gantt de
  la session), **Échanges** (`OrchestratorExchanges.vue`, journal délégation/réponse dans
  l'ordre d'appel) et **Agents** (maître-détail : `AgentConsumption.vue` en liste sélectionnable
  sur un tiers de la largeur, `AgentDetail.vue` ou un texte de substitution sur le reste,
  empilés en une colonne sous `md:`). Sélectionner un agent depuis Chronologie ou Échanges
  bascule automatiquement sur l'onglet Agents avec cet agent sélectionné. La touche Échap agit
  en deux temps : un premier appui ferme le détail d'agent s'il est ouvert, un second (ou le
  premier si aucun agent n'est sélectionné) revient à l'écran d'origine.

### `shared`

- **Responsabilité** : les types de la section 3, seule définition des formes échangées.
- **Expose** : `TokenUsage`, `Window`, `AgentStatus`, `ToolCall`, `ProjectSummary`,
  `SessionSummary`, `AgentNode`, `SessionDetail`, `StreamEvent`.
- **Consomme** : rien.

## 3. Contrats

### `shared/types.ts` — types partagés

```ts
export type Window = '7d' | '30d' | 'all'

/** Les cinq catégories ne sont jamais sommées en un total unique : sur un run réel,
 *  cacheRead écrase les quatre autres (1 546 542 contre 2 476 de sortie, constaté). */
export type TokenUsage = {
  input: number
  output: number
  cacheRead: number
  cacheCreation: number
  thinking: number
}

/** `waiting` s'applique uniquement à `SessionSummary.status` (jamais à `AgentNode.status`, qui
 *  reste `done`/`running`/`idle`) : la session a rendu la main sur un `tool_use` sans
 *  `tool_result` — une question à l'utilisateur ou une permission en attente, cf. `waitingFor`
 *  et la règle de calcul ci-dessous. */
export type AgentStatus = 'done' | 'running' | 'idle' | 'waiting'

/** Seuil au-delà duquel un `tool_use` (autre qu'`AskUserQuestion`, bascule immédiate) sans
 *  `tool_result` fait passer la session en `waiting`/`permission` plutôt que `running`. */
export const PERMISSION_WAIT_MS = 20_000

export type ToolCall = { name: string; count: number }

export type ProjectSummary = {
  id: string            // nom du dossier sous ~/.claude/projects, ex. '-Users-sabriouaked-Desktop-projets-floozy'
  path: string          // chemin réel, lu dans le champ `cwd` des lignes du transcript
  name: string          // dernier segment de `path`
  sessionCount: number  // sessions dans la fenêtre demandée
  usage: TokenUsage     // cumul des sessions de la fenêtre, sous-agents inclus
  lastActivity: string  // ISO 8601
  skippedLines: number
  status: AgentStatus         // 'running' si runningSessionCount > 0, sinon le statut de la session la plus récente
  runningSessionCount: number // sessions de la fenêtre dont le status vaut 'running' ou 'waiting'
                               // (une session qui attend une réponse compte comme active)
}

export type SessionSummary = {
  id: string            // nom du fichier sans .jsonl
  projectId: string
  label: string         // `aiTitle` si présent, sinon `lastPrompt` tronqué à 80 caractères, sinon `id`
  startedAt: string     // ISO 8601, timestamp de la première ligne horodatée
  lastActivity: string  // ISO 8601, timestamp de la dernière ligne horodatée
  durationMs: number
  status: AgentStatus
  waitingFor: 'question' | 'permission' | null // non-null seulement si status === 'waiting' :
                            // 'question' si le tool_use en attente s'appelle `AskUserQuestion`
                            // (bascule immédiate, sans seuil) ; 'permission' pour tout autre
                            // tool_use en attente depuis plus de `PERMISSION_WAIT_MS`. `null`
                            // sinon, y compris quand status !== 'waiting'.
  hasUserExchange: boolean // `true` dès qu'une ligne `user` du transcript est un échange réel :
                            // ni `isMeta`, porteuse d'un `promptId` non vide (une commande sans
                            // argument comme `/clear` n'en a pas), et un texte non vide
                            // (`message.content` string, ou un bloc `type: 'text'` non vide dans
                            // le tableau) ; les lignes `user` faites seulement de `tool_result`
                            // ne comptent pas. `false` si absent ou illisible. Condition
                            // nécessaire de `status === 'running'`/`'idle'`/`'waiting'` — cf.
                            // règle de statut ci-dessous.
  ownUsage: TokenUsage    // lignes `assistant` du transcript de session seul
  totalUsage: TokenUsage  // ownUsage + tous les descendants
  agentCount: number      // descendants, toutes profondeurs confondues
  skippedLines: number
}

export type AgentNode = {
  id: string              // `agentId`, ex. 'a732a1e499b30b001'
  sessionId: string
  parentAgentId: string | null   // null si lancé par la session elle-même
  spawnDepth: number
  agentType: string       // meta.agentType
  description: string     // meta.description
  prompt: string          // input.prompt du bloc tool_use `Agent` du parent
  models: string[]        // valeurs distinctes de message.model, ordre d'apparition
  status: AgentStatus
  startedAt: string
  endedAt: string | null  // timestamp de la ligne portant le tool_result ; null si non terminé
  durationMs: number
  ownUsage: TokenUsage
  totalUsage: TokenUsage
  tools: ToolCall[]       // décroissant par count
  skippedLines: number
  children: AgentNode[]
}

export type SessionDetail = SessionSummary & { agents: AgentNode[] }  // racines de l'arbre
```

- **Produit par** : `server`
- **Consommé par** : `web`
- **Cas limites** : un champ absent vaut `0` pour un nombre, `null` pour une date, `[]` pour une
  liste — jamais une exception. `models` vide si aucune ligne `assistant`. `prompt` vaut la
  chaîne vide si le bloc `tool_use` parent est introuvable ; `description` prend alors le
  relais comme libellé affiché.

### `GET /api/projects?window=<Window>` — endpoint

- Réponse `200` : `ProjectSummary[]`, décroissant par `lastActivity`.
- **Produit par** : `server` · **Consommé par** : `web`
- **Cas limites** : `window` absent ou invalide → `7d`. `~/.claude/projects/` absent ou vide →
  `200` avec `[]`, jamais une erreur.
- **Filtrage, deux règles distinctes** : un dossier ne contenant **aucun** transcript n'est
  jamais retourné, quelle que soit la fenêtre — son `cwd` est introuvable, donc son `path` aussi
  (3 dossiers dans ce cas au relevé du 2026-09-07). Un dossier ayant des transcripts mais aucun
  dans la fenêtre est **omis de la réponse** pour cette fenêtre, et réapparaît sur une fenêtre
  plus large. `sessionCount` et `usage` ne comptent que les sessions de la fenêtre.

### `GET /api/projects/:projectId/sessions?window=<Window>` — endpoint

- Réponse `200` : `SessionSummary[]`, décroissant par `startedAt`.
- **Produit par** : `server` · **Consommé par** : `web`
- **Cas limites** : `projectId` inconnu → `404` avec `{ "error": "unknown_project" }`.

### `GET /api/projects/:projectId/sessions/:sessionId` — endpoint

- Réponse `200` : `SessionDetail`.
- **Produit par** : `server` · **Consommé par** : `web`
- **Cas limites** : session sans dossier `subagents/` → `agents: []`, cas normal et fréquent
  (constaté : plusieurs sessions du dossier `floozy` n'ont pas de dossier `subagents/`).
  Session inconnue → `404` avec `{ "error": "unknown_session" }`.

### `GET /api/stream?window=<Window>` — flux SSE

```ts
export type StreamEvent =
  | { type: 'snapshot'; projects: ProjectSummary[] }
  | { type: 'projects';  projects: ProjectSummary[] }   // uniquement les projets modifiés
  | { type: 'sessions';  projectId: string; sessions: SessionSummary[] }
  | { type: 'session';   session: SessionDetail }
  | { type: 'heartbeat'; at: string }
```

- **Produit par** : `server` · **Consommé par** : `web`
- Un `snapshot` est envoyé à la connexion. Ensuite, un événement n'est émis que si un agrégat a
  changé, au rythme du scan (3 s). Un `heartbeat` toutes les 30 s maintient la connexion.
- **Cas limites** : le client se réabonne seul (comportement natif de `EventSource`) ; à la
  reconnexion le serveur renvoie un `snapshot`, jamais un delta. Aucun état n'est conservé
  côté serveur par client.

### Statut d'un agent ou d'une session — règle de calcul

- **Agent** : `done` si le `tool_result` portant le `tool_use_id` égal au `toolUseId` de l'agent
  est présent dans le transcript parent et n'est pas l'accusé de lancement d'un agent asynchrone
  (`toolUseResult.isAsync === true` ou `status === 'async_launched'` — détail et raison dans
  `docs/decisions.md`) ; `running` si son fichier a été modifié il y a moins de
  `IDLE_THRESHOLD_MS` sans `tool_result` de fin ; `idle` sinon. Un agent de workflow (groupe ou
  enfant) et un agent asynchrone (dont le `tool_result` n'est qu'un accusé de lancement) ne sont
  jamais `idle` : leur statut est tranché sur la seule fraîcheur de leur transcript
  (`running`/`done`), donc ils ne peuvent jamais faire basculer une session à `idle`.
- **Session** — deux notions avant tout calcul de fraîcheur :
  - `hasUserExchange` (cf. bloc `SessionSummary` ci-dessus) : `false` d'entrée → la session est
    `done`, quelle que soit sa fraîcheur et sans jamais passer par `idle`. Une session neuve ou
    seulement passée par `/clear` (ligne `<command-name>/clear</command-name>` sans `promptId`,
    ligne `isMeta` du caveat) n'a jamais d'échange réel.
  - Fin de tour : la dernière ligne `user`/`assistant` du transcript (les autres types —
    `system`, `cost-state`, `file-history-snapshot`, etc. — sont ignorés pour ce repérage) est un
    message `assistant` dont `message.stop_reason` vaut `end_turn` : Claude a rendu la main, il
    attend l'utilisateur. Dans ce cas la session est `done`, sauf si un sous-agent asynchrone
    tourne encore : son dernier instant JSON connu (l'horodatage de son `tool_result` de fin, ou à
    défaut la dernière ligne horodatée de son propre transcript pour un agent asynchrone) est
    postérieur à l'horodatage JSON de cette ligne `end_turn` **et** à moins de
    `IDLE_THRESHOLD_MS` de maintenant — la session reste alors `running`. La comparaison comme la
    fraîcheur portent toutes les deux sur des horodatages JSON embarqués, jamais sur le `mtime`
    disque d'un transcript de sous-agent contre un horodatage JSON : les deux horloges divergent
    de quelques secondes par simple délai d'écriture, ce qui garderait sinon la session `running`
    jusqu'à `IDLE_THRESHOLD_MS` après un vrai `end_turn`. Horodatage de la ligne `end_turn` absent
    (tolérance) : la fin de tour est actée sans condition sur les agents, la session est `done`.
  - Tour non fini, dernière ligne = message `assistant` sans `end_turn` : par construction, aucune
    ligne `user` (seule porteuse de `tool_result`) ne suit la dernière ligne du transcript — un
    bloc `tool_use` de cette ligne n'a donc jamais de `tool_result`. Si le dernier bloc `tool_use`
    de cette ligne existe, n'est pas un lancement de sous-agent (`Agent` — un agent asynchrone en
    cours n'est jamais une attente) et qu'aucun transcript de sous-agent n'a de `mtime` postérieur
    à l'horodatage JSON de cette ligne (autre chose tourne encore, ce n'est pas un blocage sur
    l'utilisateur) : la session est `waiting`, avec `waitingFor: 'question'` si ce `tool_use`
    s'appelle `AskUserQuestion` (bascule immédiate, sans seuil de fraîcheur), sinon
    `waitingFor: 'permission'` si l'horodatage JSON de cette ligne date de plus de
    `PERMISSION_WAIT_MS` (20 s). Dès qu'un `tool_result` correspondant est écrit (la ligne
    `assistant` n'est alors plus la dernière `user`/`assistant` du transcript), le statut est
    recalculé normalement au tick de scan suivant. `waiting` est un statut actif : compté comme
    `running` par `listLiveSessions`/`/api/live` (déjà couvert par le filtre `status !== 'done'`)
    et par `runningSessionCount` de `ProjectSummary`.
  - Tour non fini, sinon (dernière ligne = prompt utilisateur, `tool_result`, ou aucune ligne
    `user`/`assistant` du tout, ou `tool_use` en attente écarté ci-dessus) : `running` si le
    `mtime` le plus récent entre le transcript de session et tous ses sous-agents est à moins de
    `IDLE_THRESHOLD_MS` ; sinon `idle` si au moins un agent qui compte pour la résolution (donc
    ni nœud de workflow ni agent asynchrone, cf. ci-dessus) est lui-même `idle` ; sinon `done`.
    Une session sans aucun agent et inactive est donc `done`.
- `IDLE_THRESHOLD_MS` (5 minutes) et `PERMISSION_WAIT_MS` (20 secondes) sont les deux constantes
  de seuil, définies une fois dans `shared/types.ts` et partagées serveur/front.
- **Affichage** : `idle` se libelle « inactif depuis N min », jamais « échoué ». Le statut
  n'entraîne aucune action.

## 4. Arborescence

```
sohub-claude-visualizer/
├── server/
│   ├── src/
│   │   ├── index.ts        point d'entrée Express : monte les routes, le flux SSE et le front construit
│   │   ├── config.ts       port 4318, racine ~/.claude/projects, intervalle 3 s, seuil d'inactivité 5 min, fenêtres
│   │   ├── scanner.ts      boucle de 3 s : compare les mtime, retourne la liste des fichiers modifiés
│   │   ├── cache.ts        agrégats en mémoire, clés projet/session/agent, invalidation par mtime
│   │   ├── parser.ts       lecture ligne à ligne d'un .jsonl, tolérante, compte les lignes ignorées
│   │   ├── usage.ts        extraction de TokenUsage depuis message.usage, addition de deux TokenUsage
│   │   ├── agents.ts       lecture des meta.json, rattachement par toolUseId, statuts, outils, construction de l'arbre
│   │   ├── sessions.ts     agrégats de session : label, durée, ownUsage, totalUsage, agentCount
│   │   ├── projects.ts     agrégats de projet : path depuis cwd, sessionCount, usage, lastActivity
│   │   ├── routes.ts       les quatre routes REST de la section 3
│   │   └── stream.ts       endpoint SSE : snapshot initial, diffusion des agrégats modifiés, heartbeat
│   └── tsconfig.json
├── web/
│   ├── src/
│   │   ├── main.ts                              montage de l'application Vue
│   │   ├── App.vue                              mise en page, sélecteur de fenêtre, navigation entre les quatre écrans
│   │   ├── style.css                            directives Tailwind
│   │   ├── composables/
│   │   │   ├── useDashboard.ts                  état partagé : fenêtre, écran/projet/session courants (`sessionOrigin`
│   │   │   │                                    inclus), projets, sessions vivantes, abonnement SSE
│   │   │   ├── useNow.ts                        tick partagé (15 s) et dérivation côté client du statut/libellé de fraîcheur
│   │   │   ├── useTimeline.ts                   calcul pur : tri chronologique d'une fratrie d'agents, voies d'exécution (Gantt) d'une session
│   │   │   └── useEvents.ts                     calcul pur : journal d'événements (démarré/terminé) dérivé de l'arbre d'agents
│   │   ├── views/
│   │   │   ├── ProjectsView.vue                 écran d'accueil « Centre de commande » : grille de cartes de sessions vivantes
│   │   │   ├── ProjectsListView.vue             écran « Projets » : liste complète de tous les projets connus
│   │   │   ├── ProjectView.vue                  écran d'un projet : historique de ses sessions
│   │   │   └── SessionView.vue                  page de détail plein écran d'une session (bandeau sticky, 3 onglets, maître-détail Agents — cf. section 2)
│   │   └── components/
│   │       ├── ActivityDot.vue                  pastille de statut compacte, recalée sur la fraîcheur côté client
│   │       ├── AgentConsumption.vue              liste sélectionnable des agents d'une session, consommation propre par agent
│   │       ├── AgentDetail.vue                   fiche détaillée de l'agent sélectionné : tâche, modèles, durée, tokens, outils
│   │       ├── Breadcrumb.vue                    fil d'Ariane à 2 ou 3 segments, racine paramétrable (rootLabel)
│   │       ├── CommandSidebar.vue                colonne latérale du Centre de commande : répartition et rappel des sessions inactives
│   │       ├── EventFeed.vue                     journal compact des derniers événements d'agents d'une carte de session
│   │       ├── ExecutionLanes.vue                Gantt d'exécution de la session entière, une voie par type d'agent
│   │       ├── FilterBar.vue                     filtre de statut (tous / en cours / inactifs) de la grille de sessions vivantes
│   │       ├── LiveCard.vue                      carte générique par slots, réutilisée par l'accueil et l'écran projet
│   │       ├── MiniLanes.vue                     aperçu compact du Gantt, posé sur une carte de session
│   │       ├── OrchestratorExchanges.vue         journal des échanges orchestrateur/agent, dans l'ordre d'appel
│   │       ├── ProgressRing.vue                  anneau de progression : agents terminés sur le total
│   │       ├── SessionCard.vue                   carte de session complète, composée de LiveCard et des briques ci-dessus
│   │       ├── StatusBadge.vue                   rendu des trois statuts, libellé « inactif depuis N min »
│   │       ├── TokenCells.vue                    rendu des cinq catégories de tokens, jamais d'un total unique
│   │       └── WindowSelector.vue                sélecteur 7 j / 30 j / tout
│   ├── index.html
│   ├── vite.config.ts                     port 5173, proxy /api vers 4318
│   └── tsconfig.json
├── shared/
│   └── types.ts            les types de la section 3, importés par server et web
├── package.json
├── tailwind.config.js
├── postcss.config.js
├── CLAUDE.md
└── docs/                   cadrage, architecture, décisions
```

## 5. Données et intégrations

| Source | Format | Accès | Établi par |
|--------|--------|-------|------------|
| `~/.claude/projects/<slug>/<sessionId>.jsonl` | JSON Lines | lecture seule | comptage par dossier → 33 sessions réparties sur 7 des 10 dossiers ; 3 dossiers sont vides de tout transcript |
| `~/.claude/projects/<slug>/<sessionId>/subagents/agent-<id>.jsonl` | JSON Lines | lecture seule | 38 fichiers, chacun avec son `.meta.json` — aucun orphelin (comptage par appariement) |
| `~/.claude/projects/<slug>/<sessionId>/subagents/workflows/<wf_id>/agent-<id>.jsonl` | JSON Lines | lecture seule | 101 agents, dans un seul workflow, une seule session ; le dossier contient en plus un `journal.jsonl` qui n'est pas un transcript d'agent et doit être ignoré |
| `~/.claude/projects/<slug>/<sessionId>/subagents/agent-<id>.meta.json` | JSON | lecture seule | lecture directe du fichier |

Champs réels relevés, pour ce que le projet consomme vraiment :

- `<sessionId>.jsonl`, ligne `user` — `{"parentUuid":null,"isSidechain":false,"type":"user",
  "message":{...},"uuid":…,"timestamp":"2026-09-07T13:04:00.401Z","cwd":
  "/Users/sabriouaked/Desktop/projets/ai/sohub-claude-plugins","sessionId":…,
  "version":"2.1.263","gitBranch":"feat/new-project-cadrage-ferme"}`
- `<sessionId>.jsonl`, ligne `assistant` — `message.model` (ex. `claude-opus-5`) et
  `message.usage` : `input_tokens`, `output_tokens`, `cache_read_input_tokens`,
  `cache_creation_input_tokens`, `output_tokens_details.thinking_tokens`
- `<sessionId>.jsonl`, ligne `cost-state` — `totalCostUSD`, `modelUsage` par modèle,
  `totalDuration`, `startTime`, `totalLinesAdded`, `totalLinesRemoved`. **Non consommé en v1**
  (les dollars sont hors scope), documenté parce qu'il est la source évidente d'une v2.
- Types de lignes observés dans une session : `mode`, `permission-mode`, `atis-latch`,
  `bridge-session`, `file-history-snapshot`, `user`, `attachment`, `assistant`, `system`,
  `last-prompt`, `ai-title`, `cost-state`. Le libellé de session vient de `aiTitle`
  (ligne `ai-title`) ou de `lastPrompt` (ligne `last-prompt`).
- `agent-<id>.meta.json` — `{"agentType":"general-purpose","description":"Phase D blueprint
  Prum","toolUseId":"toolu_01MrG19jeGZcZPTnaLkeC8gY","spawnDepth":1}`
- **Le dossier `subagents/` contient deux populations distinctes**, constatées par comptage :
  38 agents directs `agent-<id>.jsonl` + `.meta.json`, et 102 **agents de workflow** rangés sous
  `subagents/workflows/<wf_id>/`. Un lecteur ne doit jamais parcourir `subagents/` en aveugle :
  les fichiers `agent-*.jsonl` de la racine et ceux d'un dossier `workflows/` n'ont ni les mêmes
  métadonnées ni les mêmes règles.
- **Les métadonnées d'un agent de workflow sont réduites** : `{"agentType": "workflow-subagent",
  "spawnDepth": 1}` — **ni `toolUseId`, ni `description`**. Leur tâche et leur fin ne peuvent
  donc pas être établies par le mécanisme du `tool_result` ; cf. `docs/decisions.md`.
- **Aucun agent de profondeur supérieure à 1 n'existe dans les données** : les 38 `.meta.json`
  d'agents directs portent tous `spawnDepth: 1` (comptage exhaustif, 2026-09-07). La
  récursivité de l'arbre est donc écrite mais non observable sur ces données.
- Rattachement au parent, vérifié sur ce cas : le transcript parent contient un bloc
  `{"type":"tool_use","id":"toolu_01MrG19jeGZcZPTnaLkeC8gY","name":"Agent"}` dont l'`input`
  porte les clés `description`, `subagent_type`, `prompt` ; la fin de l'agent est le bloc
  `tool_result` de même `tool_use_id`, sur une ligne `user` horodatée `2026-08-07T09:38:50.011Z`.
- Agrégats recalculés sur ce même agent pour vérifier la méthode : outils
  `{Read: 8, Skill: 3, Bash: 1, Write: 1}`, modèle `claude-fable-5`, entrée cumulée
  `1 546 542`, sortie `2 476`, de `09:38:49.991Z` à `09:44:39.344Z`.
- `~/.claude/token-logs/agent-events.jsonl` et `sessions.jsonl` — **écartés comme source** :
  contenu de test (`sess-001`, projet `ai-workflow`, agents `researcher`/`frontend-dev`), sans
  correspondance avec les transcripts réels.

## 6. Conventions

- **Lecture seule stricte** — n'écrire jamais dans `~/.claude/`, ni fichier, ni verrou, ni
  cache. L'outil observe un répertoire dont il n'est pas propriétaire.
- **Ne jamais sommer les cinq catégories de `TokenUsage` en un seul nombre** — sur un run réel
  le cache écrase tout le reste et le total n'apprend rien. Afficher les catégories côte à côte.
- **Tout accès à un champ de transcript passe par un lecteur tolérant** — un champ absent vaut
  zéro, une date absente vaut `null`, un `type` de ligne inconnu est ignoré et compté. Aucune
  exception ne remonte à l'écran.
- **Le nom d'un projet vient du champ `cwd`** — jamais reconstruit en dé-sluggant le nom du
  dossier, qui perd l'information de casse et de tirets.
- **Aucune dépendance front au-delà de Vue, Vite et Tailwind** — ni store, ni routeur : la
  navigation entre les quatre écrans est un état du composable partagé `useDashboard`
  (`currentScreen`, `currentProject`, `currentSession`). La page de session
  (`SessionView.vue`) n'est jamais un tiroir ni un panneau superposé : elle remplace l'écran
  courant dans `<main>` tant que `currentSession` est renseigné, et `sessionOrigin`
  (`'command' | 'project'`, fixé à l'ouverture) indique à son bouton Retour / à la touche Échap
  vers quel écran revenir.
- **Un fichier n'est relu que si son `mtime` a changé** — 173 transcripts (33 sessions,
  38 sous-agents, 101 agents de workflow) dont certains de 700 Ko, relus toutes les
  3 secondes, ne tiennent pas.

## Hypothèses résiduelles

> **Hypothèse** — le format des transcripts JSONL n'est pas un contrat public : les fichiers
> lus portent `"version":"2.1.263"`, et une mise à jour de Claude Code peut renommer, déplacer
> ou retirer un champ sans préavis. Non vérifiable ici : cela dépend de versions futures.
> **Conduite à tenir** — tout lecteur tolère un champ absent plutôt que de lever ; une ligne
> dont le `type` est inconnu est ignorée et comptée dans `skippedLines` (D8) ; un `usage`
> manquant compte pour zéro. L'écran affiche donc des chiffres partiels et signalés, jamais une
> page en erreur.

> **Hypothèse** — le seuil de 5 minutes ne distingue pas un agent mort d'un agent lent : un
> outil de longue durée ne produit aucune ligne pendant son exécution. Non vérifiable : rien
> dans les fichiers ne dit qu'un processus est vivant.
> **Conduite à tenir** — libeller `idle` « inactif depuis N min », jamais « échoué » ; ne
> déclencher aucune action ni aucun nettoyage sur ce statut ; laisser un agent repasser en
> `running` si son fichier bouge à nouveau.
