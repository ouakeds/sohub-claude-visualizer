import type { AgentNode, AgentStatus } from '../../../shared/types'
import { deriveStatus } from './useNow'

// Calcul temporel pur, sans dépendance à Vue ni rendu : tri chronologique d'une fratrie
// d'agents (`sortByStartedAt`, utilisé par AgentConsumption.vue/OrchestratorExchanges.vue) et
// voies d'exécution de session entière (`computeSessionLanes`, ci-dessous).

/** Largeur minimale d'une barre, en % de la largeur de son axe : sans plancher, un agent de
 *  quelques centaines de ms serait un trait invisible, ni lisible ni cliquable. Relevé de
 *  1,5 à 8 (T3) : avec l'ancrage `'active'` de `computeSessionLanes`, l'axe se resserre sur la
 *  fenêtre encore ouverte, donc une tâche qui vient de démarrer doit rester lisible même sur
 *  un axe court. */
export const MIN_BAR_WIDTH_PCT = 8

/** Nombre de graduations régulièrement espacées tracées sur l'axe d'une fratrie (bornes de
 *  la fenêtre incluses). */
const TICK_COUNT = 5

export type TimelineBar = {
  agent: AgentNode
  /** `false` si `startedAt` est absent ou non parsable : l'agent reste listé (sélectionnable)
   *  mais sans barre positionnée sur l'axe, plutôt que de faire échouer tout le calcul. */
  hasBar: boolean
  startMs: number | null
  endMs: number | null
  /** Position, en % de la largeur de l'axe de la fratrie. */
  leftPct: number
  /** Largeur, en % de la largeur de l'axe de la fratrie (jamais en dessous de
   *  `MIN_BAR_WIDTH_PCT`, jamais de quoi déborder au-delà de 100 %). */
  widthPct: number
  /** `true` si la fin de la barre a été fermée sur `now` plutôt que sur un `endedAt` serveur
   *  exploitable (agent encore en cours, ou `endedAt` présent mais non parsable). */
  isRunning: boolean
  /** Ids des frères directs (même fratrie) dont l'intervalle recoupe celui de cet agent. */
  overlappingIds: string[]
}

export type TimelineTick = {
  /** Position, en % de la largeur de l'axe. */
  pct: number
  label: string
}

export type SiblingTimeline = {
  /** `null` si aucun agent de la fratrie n'a de `startedAt` exploitable : pas de fenêtre, pas
   *  de graduations, seulement des barres absentes (`hasBar: false`). */
  windowStartMs: number | null
  windowEndMs: number | null
  /** Une entrée par agent d'entrée, dans l'ordre chronologique (triées par `startedAt`) —
   *  jamais dans l'ordre reçu en paramètre. */
  bars: TimelineBar[]
  ticks: TimelineTick[]
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

/** Trie une fratrie par `startedAt` croissant. Les agents dont l'ordre reçu venait de
 *  `readdirSync` côté serveur (cf. server/src/agents.ts) ne sont donc jamais affichés dans un
 *  ordre arbitraire : c'est le seul tri de référence pour toute vue temporelle. Un
 *  `startedAt` non parsable relègue l'agent en fin de liste plutôt que de casser le tri. */
export function sortByStartedAt(agents: AgentNode[]): AgentNode[] {
  return [...agents].sort((a, b) => {
    const aMs = parseTimestamp(a.startedAt) ?? Number.POSITIVE_INFINITY
    const bMs = parseTimestamp(b.startedAt) ?? Number.POSITIVE_INFINITY
    return aMs - bMs
  })
}

function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

/** Libellé horaire fr-FR d'un instant, avec ou sans les secondes selon la précision voulue. */
export function formatClockLabel(ms: number, includeSeconds: boolean): string {
  return new Date(ms).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: includeSeconds ? '2-digit' : undefined,
  })
}

type ResolvedEnd = { endMs: number; resolvedFromNow: boolean }

// La fin d'un agent dont `endedAt` est `null` (agent de workflow toujours en cours, agent
// async dont le tool_result n'est qu'un accusé de lancement — cf. server/src/agents.ts) est
// `now`, jamais une valeur serveur absente ni `Date.now()` lu ici : `now` vient du tick
// partagé de `useNow()`, passé en paramètre par l'appelant. Un `endedAt` présent mais non
// parsable retombe sur la même règle plutôt que de lever.
function resolveEnd(agent: AgentNode, nowMs: number): ResolvedEnd {
  if (agent.endedAt) {
    const parsed = parseTimestamp(agent.endedAt)
    if (parsed !== null) return { endMs: parsed, resolvedFromNow: false }
  }
  return { endMs: nowMs, resolvedFromNow: true }
}

// --- Voies de session (SessionCard / tiroir « VOIES D'EXÉCUTION ») -----------------------
//
// `computeSessionLanes` place TOUS les agents de la session, toutes profondeurs et toutes
// branches confondues, sur un seul axe borné par la session elle-même — c'est la brique du
// mini-Gantt de carte et du Gantt du tiroir, où le regroupement pertinent est « quel type
// d'agent a tourné », pas « quelle fratrie ».

export type LaneBar = {
  agent: AgentNode
  /** Position, en % de la largeur de l'axe de la session. */
  leftPct: number
  /** Largeur, en % de la largeur de l'axe de la session (jamais en dessous de
   *  `MIN_BAR_WIDTH_PCT`). */
  widthPct: number
  /** Statut live (cf. `deriveStatus`), pas le statut brut du serveur. */
  status: AgentStatus
  /** `true` si l'intervalle de cet agent recoupe celui d'au moins un autre agent de la
   *  session, toutes voies confondues (pas seulement sa propre voie). */
  parallel: boolean
  /** `true` si le début réel de cet agent est antérieur à l'origine de l'axe visible (barre
   *  tronquée à gauche, `leftPct` ramené à 0) — ne peut arriver qu'avec `anchor: 'active'`
   *  (cf. `computeSessionLanes`) : un agent démarré avant l'agent actif le plus ancien. */
  truncatedStart: boolean
}

export type Lane = {
  /** `agentType` brut de tous les agents de la voie : c'est aussi la clé de regroupement. */
  key: string
  label: string
  bars: LaneBar[]
  /** Somme des durées (fin − début) des barres de la voie, en ms. */
  activeMs: number
}

export type SessionLanes = {
  startedAt: string
  spanMs: number
  lanes: Lane[]
  /** Nombre maximal d'agents dont l'exécution se recoupe au même instant, sur l'ensemble de
   *  l'axe (toutes voies confondues). */
  maxParallel: number
  ticks: TimelineTick[]
}

/** `agentType` tel qu'affiché : un agent lancé par un plugin porte un préfixe
 *  `<plugin>:<type>` (cf. Task tool) qui n'apporte rien à la lecture d'une voie ou d'un
 *  événement — seul ce qui suit le premier `:` est montré. Un `agentType` sans `:` ressort
 *  inchangé. */
export function formatAgentTypeLabel(agentType: string): string {
  const separatorIndex = agentType.indexOf(':')
  return separatorIndex === -1 ? agentType : agentType.slice(separatorIndex + 1)
}

/** Aplatit l'arbre d'agents (`children` récursifs) en une liste, ordre de parcours en
 *  profondeur préservé — c'est cet ordre qui détermine la « première apparition » d'un
 *  `agentType` pour l'ordre des voies. */
function flattenAgents(agents: AgentNode[]): AgentNode[] {
  return agents.flatMap((agent) => [agent, ...flattenAgents(agent.children)])
}

type ResolvedSessionAgent = {
  agent: AgentNode
  startMs: number
  endMs: number
  resolvedFromNow: boolean
  /** cf. `LaneBar.truncatedStart`. */
  truncatedStart: boolean
}

/** Nombre maximal d'intervalles simultanément ouverts (balayage par événements début/fin),
 *  avec la même sémantique stricte que `intervalsOverlap` : à un instant partagé par une fin
 *  et un début, la fin est traitée en premier — deux barres qui se touchent sans se chevaucher
 *  ne comptent jamais comme parallèles. */
function computeMaxParallel(entries: ResolvedSessionAgent[]): number {
  const events = entries.flatMap((entry) => [
    { at: entry.startMs, delta: 1 },
    { at: entry.endMs, delta: -1 },
  ])
  events.sort((a, b) => a.at - b.at || a.delta - b.delta)

  let current = 0
  let max = 0
  for (const event of events) {
    current += event.delta
    max = Math.max(max, current)
  }
  return max
}

/** `agents` dont le statut dérivé n'est ni `done` ni `idle` compte comme actif — englobe
 *  `running` et tout futur statut serveur "en cours" (ex. `waiting`, T1) sans dépendre de sa
 *  valeur exacte. */
function isActiveStatus(status: AgentStatus): boolean {
  return status !== 'done' && status !== 'idle'
}

export type SessionLanesOptions = {
  /** `'session'` (défaut) : axe borné par `sessionStartedAt`, comportement historique — c'est
   *  celui que garde `MiniLanes.vue` (mini-Gantt de carte, aperçu de la session entière).
   *  `'active'` : l'origine de l'axe visible devient le début de l'agent actif (statut dérivé
   *  hors `done`/`idle`, cf. `isActiveStatus`) le plus ancien encore ouvert, pour qu'une tâche
   *  qui vient de démarrer dans une session déjà longue ne s'affiche pas comme un trait collé
   *  à droite. Sans agent actif, retombe sur `'session'`. Utilisé par `ExecutionLanes.vue`
   *  (SessionView, onglet Chronologie), T3. */
  anchor?: 'session' | 'active'
}

/**
 * Calcule les voies de la session entière (mini-Gantt de carte, Gantt du tiroir) : un axe
 * unique dont l'origine dépend de `options.anchor` (cf. `SessionLanesOptions`) et dont la fin
 * est max(`sessionLastActivity`, fin du dernier agent, `now` si un agent est encore en cours),
 * une voie par `agentType` distinct dans l'ordre de première apparition, une barre par agent
 * (toutes profondeurs, toutes branches confondues).
 *
 * Tolérant : un `startedAt` d'agent non parsable retombe sur le début de session plutôt que de
 * fausser le calcul des autres agents ; un agent sans `endedAt` s'étend jusqu'à `now` (cf.
 * `resolveEnd`).
 */
export function computeSessionLanes(
  agents: AgentNode[],
  sessionStartedAt: string,
  sessionLastActivity: string,
  now: number,
  options?: SessionLanesOptions,
): SessionLanes {
  const anchor = options?.anchor ?? 'session'
  const sessionStartMs = parseTimestamp(sessionStartedAt) ?? now
  const lastActivityMs = parseTimestamp(sessionLastActivity) ?? sessionStartMs

  // Passe 1, "brute" : dates réelles (non clampées sur l'axe, dont l'origine n'est pas encore
  // connue en mode `'active'`) — sert à repérer les agents actifs et à fixer l'origine.
  const rawEntries = flattenAgents(agents).map((agent) => {
    const rawStartMs = parseTimestamp(agent.startedAt) ?? sessionStartMs
    const { endMs: rawEndMs, resolvedFromNow } = resolveEnd(agent, now)
    const derivedStatus = deriveStatus(agent.status, agent.endedAt ?? agent.startedAt, now)
    return {
      agent,
      rawStartMs,
      rawEndMs: Math.max(rawEndMs, rawStartMs),
      resolvedFromNow,
      isActive: isActiveStatus(derivedStatus),
    }
  })

  const activeStartCandidates = rawEntries.filter((entry) => entry.isActive).map((entry) => entry.rawStartMs)
  const axisStartMs =
    anchor === 'active' && activeStartCandidates.length > 0 ? Math.min(...activeStartCandidates) : sessionStartMs

  const resolved: ResolvedSessionAgent[] = rawEntries.map((entry) => {
    const startMs = Math.max(entry.rawStartMs, axisStartMs)
    return {
      agent: entry.agent,
      startMs,
      endMs: Math.max(entry.rawEndMs, startMs),
      resolvedFromNow: entry.resolvedFromNow,
      truncatedStart: entry.rawStartMs < axisStartMs,
    }
  })

  const hasRunningAgent = resolved.some((entry) => entry.resolvedFromNow)
  const lastAgentEndMs = resolved.length === 0 ? axisStartMs : Math.max(...resolved.map((entry) => entry.endMs))
  const axisEndMs = Math.max(axisStartMs, lastActivityMs, lastAgentEndMs, hasRunningAgent ? now : axisStartMs)
  const spanMs = Math.max(0, axisEndMs - axisStartMs)

  function pctOf(ms: number): number {
    return spanMs === 0 ? 0 : ((ms - axisStartMs) / spanMs) * 100
  }

  const overlapById = new Map<string, boolean>()
  for (const entry of resolved) {
    const overlapsAnother = resolved.some(
      (other) =>
        other.agent.id !== entry.agent.id &&
        intervalsOverlap(entry.startMs, entry.endMs, other.startMs, other.endMs),
    )
    overlapById.set(entry.agent.id, overlapsAnother)
  }

  const laneOrder: string[] = []
  const laneEntries = new Map<string, ResolvedSessionAgent[]>()
  for (const entry of resolved) {
    const key = entry.agent.agentType
    if (!laneEntries.has(key)) {
      laneOrder.push(key)
      laneEntries.set(key, [])
    }
    laneEntries.get(key)!.push(entry)
  }

  const lanes: Lane[] = laneOrder.map((key) => {
    const entries = [...(laneEntries.get(key) ?? [])].sort((a, b) => a.startMs - b.startMs)
    let activeMs = 0

    const bars: LaneBar[] = entries.map((entry) => {
      activeMs += entry.endMs - entry.startMs

      const rawWidthPct = pctOf(entry.endMs) - pctOf(entry.startMs)
      const widthPct = Math.min(Math.max(rawWidthPct, MIN_BAR_WIDTH_PCT), 100)
      const leftPct = Math.min(Math.max(pctOf(entry.startMs), 0), 100 - widthPct)

      return {
        agent: entry.agent,
        leftPct,
        widthPct,
        status: deriveStatus(entry.agent.status, entry.agent.endedAt ?? entry.agent.startedAt, now),
        parallel: overlapById.get(entry.agent.id) ?? false,
        truncatedStart: entry.truncatedStart,
      }
    })

    return { key, label: formatAgentTypeLabel(key), bars, activeMs }
  })

  // Libellé relatif ("T+Nmin" depuis `axisStartMs`), pas un horodatage absolu HH:MM : le calcul
  // ne dépend que de `spanMs` et du `pct` de chaque graduation, jamais de la valeur de
  // `axisStartMs` elle-même — en mode `'active'` (T3), l'origine se déplace sur le début de
  // l'agent actif le plus ancien et les libellés restent cohérents avec elle sans code
  // supplémentaire. Un horodatage absolu aurait exigé de resynchroniser deux informations
  // (l'heure de chaque graduation *et* l'origine réelle de l'axe) au lieu d'une seule.
  const ticks: TimelineTick[] = Array.from({ length: TICK_COUNT }, (_, index) => {
    const pct = (index / (TICK_COUNT - 1)) * 100
    const minutes = Math.round((spanMs * pct) / 100 / 60_000)
    return { pct, label: `T+${minutes}min` }
  })

  return { startedAt: sessionStartedAt, spanMs, lanes, maxParallel: computeMaxParallel(resolved), ticks }
}
