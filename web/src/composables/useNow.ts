import { onMounted, onUnmounted, readonly, ref, type Ref } from 'vue'
import { IDLE_THRESHOLD_MS, type AgentStatus } from '../../../shared/types'

// Le flux SSE (`GET /api/stream`) ne pousse que des deltas après un `snapshot` initial : un
// projet ou une session qui *cesse* d'être actif ne génère aucun événement. Sans horloge
// locale, il resterait affiché « en cours » indéfiniment. Ce tick partagé sert de base à la
// dérivation de fraîcheur (`deriveStatus`) faite par les composants qui en ont besoin
// (ActivityDot en particulier).
//
// Cadence choisie : 15 s, largement suffisante face au seuil de 5 min (IDLE_THRESHOLD_MS) —
// pas besoin d'une horloge plus fine pour détecter un passage running -> idle côté client.
const TICK_MS = 15_000

// `now` et l'intervalle sont module-scope : un seul `setInterval` pour toute l'application,
// quel que soit le nombre de composants qui appellent `useNow()`. Démarré au montage du
// premier consommateur, arrêté au démontage du dernier (compteur de référence) — jamais de
// fuite de timer entre les navigations accueil / projet / session.
const now = ref(Date.now())
let intervalId: ReturnType<typeof setInterval> | null = null
let consumerCount = 0

function start(): void {
  consumerCount += 1
  if (intervalId !== null) return
  now.value = Date.now()
  intervalId = setInterval(() => {
    now.value = Date.now()
  }, TICK_MS)
}

function stop(): void {
  consumerCount = Math.max(0, consumerCount - 1)
  if (consumerCount === 0 && intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
}

/**
 * Tick partagé de l'application (horodatage courant en millisecondes, `Date.now()`).
 * À appeler dans le `setup()` d'un composant : démarre l'horloge partagée au montage,
 * l'arrête au démontage — sans jamais couper le tick tant qu'un autre consommateur est
 * encore monté ailleurs dans l'app. `now` est en lecture seule côté consommateur.
 */
export function useNow(): { now: Readonly<Ref<number>> } {
  onMounted(start)
  onUnmounted(stop)
  return { now: readonly(now) }
}

function elapsedSinceMs(lastActivity: string | null | undefined, nowMs: number): number | null {
  if (!lastActivity) return null
  const timestamp = new Date(lastActivity).getTime()
  if (Number.isNaN(timestamp)) return null
  return nowMs - timestamp
}

/**
 * Dérive le statut réellement courant à partir du statut reçu du serveur et de
 * `lastActivity` (ISO 8601) : un `running` dont `lastActivity` dépasse `IDLE_THRESHOLD_MS`
 * (exporté par `shared/types.ts`) devient `idle` côté client, entre deux événements SSE.
 * `done` reste `done` sans jamais redevenir `running` ou `idle`.
 *
 * `waiting` (uniquement porté par `SessionSummary.status`, cf. `shared/types.ts`) est lui
 * aussi figé : le serveur est seul juge de ce statut (détection tool_use sans tool_result,
 * `PERMISSION_WAIT_MS`) — jamais recalculé ni dégradé en `idle`/`done` côté client, que ce
 * soit par la fraîcheur de `lastActivity` ou par `hasUserExchange`.
 *
 * `hasUserExchange` (4ᵉ paramètre, optionnel) ne s'applique qu'aux entités qui portent ce
 * champ côté serveur — les sessions (`SessionSummary`/`SessionDetail`), pas les agents ni les
 * projets : ces derniers appellent `deriveStatus` sans ce paramètre et conservent leur
 * comportement inchangé. Passé explicitement à `false` (absent ou illisible dans le contrat
 * serveur, cf. `shared/types.ts`), la session reste `done` quel que soit `status`/`lastActivity`
 * reçus : elle ne peut jamais se re-dériver en `running` ni `idle` côté client.
 *
 * Tolérant : `lastActivity` absent, vide ou non parsable ne lève jamais — on retombe alors
 * sur le statut serveur tel quel, inchangé.
 */
export function deriveStatus(
  status: AgentStatus,
  lastActivity: string | null | undefined,
  nowMs: number,
  hasUserExchange?: boolean,
): AgentStatus {
  if (status === 'waiting') return 'waiting'
  if (hasUserExchange === false) return 'done'
  if (status !== 'running') return status
  const elapsed = elapsedSinceMs(lastActivity, nowMs)
  if (elapsed === null) return status
  return elapsed > IDLE_THRESHOLD_MS ? 'idle' : 'running'
}

/**
 * Libellé de statut cohérent avec le libellé contractuel du projet (cf. StatusBadge.vue,
 * CLAUDE.md) : `idle` se dit toujours « inactif depuis N min », jamais « échoué », et ne
 * déclenche aucune action. `running`/`done` renvoient un libellé sans mention de durée.
 *
 * `waitingFor` (4ᵉ paramètre, optionnel) n'a de sens que pour `status === 'waiting'` (cf.
 * `SessionSummary.waitingFor`, `shared/types.ts`) : `'permission'` renvoie « en attente de
 * permission », tout le reste (`'question'`, `undefined`, `null` — appelant qui ne connaît pas
 * encore la raison, ou qui n'a que le statut d'un agent qui ne porte jamais ce champ) retombe
 * sur « en attente de réponse », le libellé par défaut le plus sûr.
 *
 * Tolérant : `lastActivity` absent ou non parsable retombe sur « inactif » sans minutage
 * plutôt que de lever.
 */
export function statusLabel(
  status: AgentStatus,
  lastActivity: string | null | undefined,
  nowMs: number,
  waitingFor?: 'question' | 'permission' | null,
): string {
  switch (status) {
    case 'running':
      return 'en cours'
    case 'done':
      return 'terminé'
    case 'waiting':
      return waitingFor === 'permission' ? 'en attente de permission' : 'en attente de réponse'
    case 'idle': {
      const elapsed = elapsedSinceMs(lastActivity, nowMs)
      if (elapsed === null) return 'inactif'
      const minutes = Math.max(0, Math.round(elapsed / 60_000))
      return `inactif depuis ${minutes} min`
    }
    default:
      return status
  }
}
