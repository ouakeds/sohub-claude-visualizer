import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { LIVE_SESSIONS_MAX, type AgentStatus, type SessionDetail, type SessionSummary, type Window } from '../../shared/types'
import { IDLE_THRESHOLD_MS, PERMISSION_WAIT_MS, WINDOW_DURATIONS_MS } from './config'
import { readJsonlCached } from './cache'
import { addUsage, emptyUsage, extractUsage } from './usage'
import type { ParsedLine } from './parser'
import {
  buildSessionAgentTree,
  countsTowardSessionResolution,
  findLastToolUseBlock,
  flattenAgentNodes,
  isWorkflowGroupNode,
} from './agents'

const LABEL_MAX_LENGTH = 80

/**
 * Construit les `SessionSummary` d'un projet pour la fenêtre demandée, décroissant par
 * `startedAt`. La fenêtre s'applique à `lastActivity`, comme pour `listProjectSummaries`. Un
 * projet sans transcript donne `[]`.
 */
export function listSessionSummaries(projectPath: string, projectId: string, window: Window): SessionSummary[] {
  const windowMs = window === 'all' ? null : WINDOW_DURATIONS_MS[window]
  const now = Date.now()

  const summaries: SessionSummary[] = []

  for (const sessionFileName of listJsonlFiles(projectPath)) {
    const summary = buildSessionSummary(projectPath, projectId, sessionFileName)
    const inWindow = windowMs === null || now - Date.parse(summary.lastActivity) < windowMs
    if (inWindow) summaries.push(summary)
  }

  summaries.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
  return summaries
}

function buildSessionSummary(projectPath: string, projectId: string, sessionFileName: string): SessionSummary {
  const id = sessionFileName.slice(0, -'.jsonl'.length)
  const sessionFilePath = join(projectPath, sessionFileName)
  const { lines, skippedLines: sessionSkipped, mtimeMs } = readJsonlCached(sessionFilePath)
  const now = Date.now()

  let ownUsage = emptyUsage()
  let firstTimestampMs: number | null = null
  let lastTimestampMs: number | null = null
  let aiTitle: string | null = null
  let lastPrompt: string | null = null
  let hasUserExchange = false
  // Dernière ligne `user` ou `assistant` rencontrée, dans l'ordre du fichier — les autres types
  // (`system`, `cost-state`, `file-history-snapshot`, etc.) ne comptent jamais comme un tour.
  let lastTurnLine: ParsedLine | null = null

  for (const line of lines) {
    const ts = readTimestampMs(line)
    if (ts !== null) {
      if (firstTimestampMs === null || ts < firstTimestampMs) firstTimestampMs = ts
      if (lastTimestampMs === null || ts > lastTimestampMs) lastTimestampMs = ts
    }
    if (line.type === 'assistant') ownUsage = addUsage(ownUsage, extractUsage(line))
    // Plusieurs lignes possibles : la dernière rencontrée gagne (parcours dans l'ordre du fichier).
    if (line.type === 'ai-title' && typeof line.aiTitle === 'string') aiTitle = line.aiTitle
    if (line.type === 'last-prompt' && typeof line.lastPrompt === 'string') lastPrompt = line.lastPrompt
    if (!hasUserExchange && hasRealUserText(line)) hasUserExchange = true
    if (line.type === 'user' || line.type === 'assistant') lastTurnLine = line
  }

  // L'arbre complet (agents directs et, s'il y en a, agents de workflow sous leur nœud de
  // groupe) : ses racines suffisent pour `totalUsage` (déjà cumulé nœud par nœud), l'aplatissement
  // sert au décompte et à la résolution du statut. `latestAgentMtimeMs` est le mtime le plus
  // frais parmi tous les transcripts de sous-agents, `null` si la session n'en a aucun.
  const { roots: agentTree, latestMtimeMs: latestAgentMtimeMs } = buildSessionAgentTree(projectPath, id, lines)
  const flatAgents = flattenAgentNodes(agentTree)

  let totalUsage = ownUsage
  for (const root of agentTree) totalUsage = addUsage(totalUsage, root.totalUsage)

  let skippedLines = sessionSkipped
  for (const agent of flatAgents) skippedLines += agent.skippedLines

  // Le nœud de groupe d'un workflow n'est pas lui-même un agent (juste un regroupement d'UI) :
  // exclu du décompte, mais ses enfants y comptent.
  const agentCount = flatAgents.filter((agent) => !isWorkflowGroupNode(agent)).length

  // Statut de session : ne repose plus sur « tous les agents ont rendu leur tool_result », qui
  // n'a pas de sens pour un agent asynchrone (son tool_result est un accusé de lancement, pas une
  // fin). `running` prime sur la fraîcheur du transcript de session ; sinon `idle` dès qu'un agent
  // l'est lui-même. Les agents de workflow et les agents asynchrones ne sont jamais `idle` (statut
  // tranché sur leur seule fraîcheur), donc ils ne peuvent jamais empêcher une session d'être
  // `done`.
  const anyAgentIdle = flatAgents.filter(countsTowardSessionResolution).some((agent) => agent.status === 'idle')
  // Une session ouverte sans qu'un utilisateur n'ait jamais échangé (mtime touché par autre
  // chose qu'un prompt réel) n'est jamais `running`/`idle`, quelle que soit sa fraîcheur : elle
  // est `done` d'entrée. Voir `hasUserExchange` ci-dessus.

  // `lastActivity`/`startedAt` ne regardent que le transcript de session lui-même : les
  // sous-agents ne comptent que pour l'usage et le décompte, pas pour ces horodatages.
  const startedAtMs = firstTimestampMs ?? mtimeMs
  const lastActivityMs = lastTimestampMs ?? mtimeMs

  // La fraîcheur qui tranche `running` (branche « tour non fini » ci-dessous) regarde le mtime le
  // plus récent entre le transcript de session et tous ses sous-agents : un agent synchrone
  // n'écrit rien dans le transcript parent tant qu'il tourne (le parent attend son tool_result),
  // seul son propre fichier en témoigne.
  const latestMtimeMs = latestAgentMtimeMs !== null ? Math.max(mtimeMs, latestAgentMtimeMs) : mtimeMs

  // Fin de tour : la dernière ligne `user`/`assistant` du transcript est un message assistant
  // dont `stop_reason` vaut `end_turn` — Claude a rendu la main, il attend l'utilisateur. Dans ce
  // cas la session est `done`, sauf si un sous-agent asynchrone tourne encore : son dernier
  // timestamp JSON connu (fin de son `tool_result`, ou sa dernière ligne horodatée s'il n'en a
  // pas) est postérieur à cet instant `end_turn` et reste plus frais que `IDLE_THRESHOLD_MS`.
  // Comparaison volontairement JSON contre JSON, jamais JSON contre mtime disque (`raw.mtimeMs`
  // dans `agents.ts`) : les deux horloges divergent de quelques secondes par simple délai
  // d'écriture, ce qui garderait sinon `running` jusqu'à `IDLE_THRESHOLD_MS` après un vrai
  // `end_turn`. Timestamp de la ligne `end_turn` absent (tolérance) : la fin de tour est actée
  // sans condition sur les agents. Tour non fini (dernière ligne = prompt utilisateur,
  // `tool_result`, appel d'outil de l'assistant, ou pas de ligne `user`/`assistant` du tout) :
  // logique inchangée, tranchée sur la fraîcheur du transcript puis sur les agents `idle`, sauf
  // si ce dernier appel d'outil est lui-même une attente (cf. `waitingFor` ci-dessous).
  const turnFinished = lastTurnLine !== null && lastTurnLine.type === 'assistant' && isEndTurnLine(lastTurnLine)

  let isRunning: boolean
  let status: AgentStatus
  let waitingFor: 'question' | 'permission' | null = null

  if (!hasUserExchange) {
    isRunning = false
    status = 'done'
  } else if (turnFinished) {
    const turnEndedAtMs = readTimestampMs(lastTurnLine!)
    // Dernier instant JSON connu, toutes profondeurs confondues : pour chaque agent,
    // `startedAt + durationMs` vaut déjà son `endedAt` (tool_result) ou sa dernière ligne
    // horodatée (agent asynchrone) — jamais un mtime disque, cf. commentaire ci-dessus.
    const latestAgentActivityMs =
      flatAgents.length > 0
        ? Math.max(...flatAgents.map((agent) => Date.parse(agent.startedAt) + agent.durationMs))
        : null
    const asyncAgentStillActive =
      turnEndedAtMs !== null &&
      latestAgentActivityMs !== null &&
      latestAgentActivityMs > turnEndedAtMs &&
      now - latestAgentActivityMs < IDLE_THRESHOLD_MS
    isRunning = asyncAgentStillActive
    status = isRunning ? 'running' : 'done'
  } else {
    // Attente explicite : la dernière ligne assistant porte un `tool_use` qui, par construction
    // (aucune ligne `user` ne suit la dernière ligne du transcript), n'a pas encore de
    // `tool_result`. Exclu si ce bloc est un lancement de sous-agent (`Agent`, jamais une attente
    // — un agent asynchrone en cours n'est jamais `idle` ni `waiting`) ou si un transcript de
    // sous-agent a bougé après cette ligne (son mtime disque est postérieur à l'horodatage JSON
    // de la ligne : autre chose tourne encore, ce n'est pas un blocage sur l'utilisateur).
    if (lastTurnLine !== null && lastTurnLine.type === 'assistant') {
      const pending = findLastToolUseBlock(lastTurnLine)
      if (pending !== null && pending.name !== 'Agent') {
        const pendingLineMs = readTimestampMs(lastTurnLine)
        const subagentMovedAfter =
          pendingLineMs !== null && latestAgentMtimeMs !== null && latestAgentMtimeMs > pendingLineMs
        if (!subagentMovedAfter) {
          if (pending.name === 'AskUserQuestion') {
            waitingFor = 'question'
          } else if (pendingLineMs !== null && now - pendingLineMs > PERMISSION_WAIT_MS) {
            waitingFor = 'permission'
          }
        }
      }
    }

    if (waitingFor !== null) {
      isRunning = true // `waiting` est un statut actif, au même titre que `running`
      status = 'waiting'
    } else {
      isRunning = now - latestMtimeMs < IDLE_THRESHOLD_MS
      status = isRunning ? 'running' : anyAgentIdle ? 'idle' : 'done'
    }
  }

  return {
    id,
    projectId,
    label: aiTitle ?? (lastPrompt ? truncate(lastPrompt, LABEL_MAX_LENGTH) : id),
    startedAt: new Date(startedAtMs).toISOString(),
    lastActivity: new Date(lastActivityMs).toISOString(),
    durationMs: Math.max(0, lastActivityMs - startedAtMs),
    status,
    waitingFor,
    hasUserExchange,
    ownUsage,
    totalUsage,
    agentCount,
    skippedLines,
  }
}

/**
 * Sessions vivantes (`status !== 'done'`) d'un projet pour la fenêtre demandée, décroissant par
 * `lastActivity`, plafonnées à `LIVE_SESSIONS_MAX` — matière des cartes de session de l'accueil.
 * Réutilise `listSessionSummaries` puis `getSessionDetail` pour l'arbre d'agents de chacune :
 * le cache par mtime de `readJsonlCached` évite toute relecture du transcript déjà chargé.
 */
export function listLiveSessions(projectPath: string, projectId: string, window: Window): SessionDetail[] {
  const liveSummaries = listSessionSummaries(projectPath, projectId, window)
    .filter((summary) => summary.status !== 'done')
    .sort((a, b) => Date.parse(b.lastActivity) - Date.parse(a.lastActivity))
    .slice(0, LIVE_SESSIONS_MAX)

  return liveSummaries.map((summary) => getSessionDetail(projectPath, projectId, summary.id))
}

/**
 * Le détail d'une session : son résumé plus les racines de l'arbre de ses agents. `sessionId`
 * inconnu (fichier `.jsonl` absent) est du ressort de l'appelant (`sessionFileExists`), pas de
 * cette fonction : elle suppose la session déjà vérifiée.
 */
export function getSessionDetail(projectPath: string, projectId: string, sessionId: string): SessionDetail {
  const summary = buildSessionSummary(projectPath, projectId, `${sessionId}.jsonl`)
  // Même fichier que celui déjà lu par `buildSessionSummary` : `readJsonlCached` sert le résultat
  // en mémoire tant que son `mtime` n'a pas bougé, pas une seconde lecture disque.
  const { lines } = readJsonlCached(join(projectPath, `${sessionId}.jsonl`))
  const { roots: agents } = buildSessionAgentTree(projectPath, sessionId, lines)
  return { ...summary, agents }
}

/** `true` si le transcript de la session existe, distingue une session inconnue (404) d'une
 *  session simplement vide ou sans agent. */
export function sessionFileExists(projectPath: string, sessionId: string): boolean {
  try {
    return statSync(join(projectPath, `${sessionId}.jsonl`)).isFile()
  } catch {
    return false
  }
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

/**
 * `true` pour une ligne `user` qui est un échange réel de l'utilisateur : ni `isMeta` (caveat
 * local-command), porteuse d'un `promptId` non vide (une commande sans argument comme `/clear`
 * n'en a pas — seuls les vrais prompts, texte libre ou commande à arguments, en portent un), et
 * dont `message.content` a du texte non vide (string, ou un tableau contenant au moins un bloc
 * `type: 'text'` non vide). Une ligne `user` dont le `content` n'est fait que de blocs
 * `tool_result` (accusé de réception d'un outil, pas un échange) ne compte jamais. Champ absent
 * ou de forme inattendue vaut `false`, jamais une exception.
 */
function hasRealUserText(line: ParsedLine): boolean {
  if (line.type !== 'user') return false
  if (line.isMeta === true) return false
  if (typeof line.promptId !== 'string' || line.promptId.length === 0) return false

  const content = asRecord(line.message)?.content

  if (typeof content === 'string') return content.length > 0

  if (Array.isArray(content)) {
    return content.some((block) => {
      const item = asRecord(block)
      return item?.type === 'text' && typeof item.text === 'string' && item.text.length > 0
    })
  }

  return false
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function readTimestampMs(line: ParsedLine): number | null {
  if (typeof line.timestamp !== 'string') return null
  const ms = Date.parse(line.timestamp)
  return Number.isNaN(ms) ? null : ms
}

/** `true` pour une ligne `assistant` dont `message.stop_reason` vaut `end_turn` — Claude a rendu
 *  la main et attend l'utilisateur. `stop_reason` absent (ex. `tool_use`, ou champ manquant) vaut
 *  `false`, jamais une exception. */
function isEndTurnLine(line: ParsedLine): boolean {
  return asRecord(line.message)?.stop_reason === 'end_turn'
}

function listJsonlFiles(dirPath: string): string[] {
  try {
    return readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
      .map((entry) => entry.name)
  } catch {
    return [] // dossier projet absent ou illisible : pas de session
  }
}
