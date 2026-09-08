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

/** `waiting` s'applique uniquement à `SessionSummary.status` (jamais à `AgentNode.status`,
 *  qui reste `done`/`running`/`idle`) : la session a rendu la main à un `tool_use` sans
 *  `tool_result` — une question à l'utilisateur ou une permission en attente, cf. `waitingFor`
 *  sur `SessionSummary` et la règle de calcul dans `docs/architecture.md`. */
export type AgentStatus = 'done' | 'running' | 'idle' | 'waiting'

/** Seuil au-delà duquel un fichier sans `tool_result` est considéré `idle` plutôt que
 *  `running` ; partagé avec le front, qui en a besoin pour dériver la fraîcheur côté client
 *  entre deux événements SSE. */
export const IDLE_THRESHOLD_MS = 5 * 60 * 1000

/** Délai au-delà duquel un `tool_use` (autre qu'`AskUserQuestion`, qui bascule `waiting`
 *  immédiatement) sans `tool_result` correspondant fait basculer la session en `waiting` /
 *  `permission` plutôt que `running` — le temps normal d'exécution d'un outil est plus court. */
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
                            // nécessaire de `status === 'running'`/`'idle'`/`'waiting'`.
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

export type SessionDetail = SessionSummary & { agents: AgentNode[] }

/** Sessions vivantes d'un projet (statut ≠ 'done', les LIVE_SESSIONS_MAX plus récentes),
 *  chacune avec son arbre d'agents complet — matière des cartes de session de l'accueil. */
export type LiveProject = {
  projectId: string
  sessions: SessionDetail[]   // triées par lastActivity décroissante
}

export const LIVE_SESSIONS_MAX = 8

export type StreamEvent =
  | { type: 'snapshot'; projects: ProjectSummary[] }
  | { type: 'projects';  projects: ProjectSummary[] }
  | { type: 'sessions';  projectId: string; sessions: SessionSummary[] }
  | { type: 'session';   session: SessionDetail }
  | { type: 'live';      projectId: string; sessions: SessionDetail[] }
  | { type: 'heartbeat'; at: string }
