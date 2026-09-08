import type { AgentNode, SessionSummary } from '../../../shared/types'
import { formatAgentTypeLabel } from './useTimeline'

// Calcul pur pour le journal d'événements (colonne latérale du « Centre de commande » et
// panneau d'échanges du tiroir) : aucune dépendance à Vue. Une entrée par transition d'agent
// prouvée par le transcript — un `started` à `startedAt`, un `ended` à `endedAt` s'il existe —
// jamais un événement de synthèse inventé pour un statut intermédiaire.

/** Longueur au-delà de laquelle la description d'un agent est tronquée dans une ligne de
 *  journal : une carte de session n'a la place que pour un intitulé court. */
const DESCRIPTION_TRUNCATE_LENGTH = 60

export type AgentEvent = {
  at: string
  kind: 'started' | 'ended'
  agent: AgentNode
  sessionId: string
  projectId: string
  sessionLabel: string
  projectName: string
}

function flattenAgents(agents: AgentNode[]): AgentNode[] {
  return agents.flatMap((agent) => [agent, ...flattenAgents(agent.children)])
}

function timeMs(iso: string): number {
  const ms = new Date(iso).getTime()
  // Un `at` non parsable (ne devrait pas arriver, `startedAt`/`endedAt` sont déjà validés côté
  // serveur) retombe en fin de tri plutôt que de casser l'ordre des autres événements.
  return Number.isNaN(ms) ? 0 : ms
}

/**
 * Dérive les événements `started`/`ended` de tous les agents d'une session (toutes profondeurs,
 * `children` récursifs), triés par `at` décroissant — le plus récent en tête, pour un journal
 * qui se lit du plus frais au plus ancien.
 *
 * Tolérant : `session.agents` absent (résumé de session sans détail chargé) produit une liste
 * vide plutôt que de lever.
 */
export function deriveAgentEvents(
  session: SessionSummary & { agents?: AgentNode[] },
  projectName: string,
): AgentEvent[] {
  const base = {
    sessionId: session.id,
    projectId: session.projectId,
    sessionLabel: session.label,
    projectName,
  }

  const events = flattenAgents(session.agents ?? []).flatMap((agent): AgentEvent[] => {
    const started: AgentEvent = { at: agent.startedAt, kind: 'started', agent, ...base }
    if (!agent.endedAt) return [started]
    const ended: AgentEvent = { at: agent.endedAt, kind: 'ended', agent, ...base }
    return [started, ended]
  })

  return events.sort((a, b) => timeMs(b.at) - timeMs(a.at))
}

function truncateDescription(description: string): string {
  if (description.length <= DESCRIPTION_TRUNCATE_LENGTH) return description
  return `${description.slice(0, DESCRIPTION_TRUNCATE_LENGTH)}…`
}

// Dupliqué à dessein de AgentTimeline.vue/AgentDetail.vue/AgentNode.vue (même format « Xh Ymin
// Zs ») : ce composable ne dépend d'aucun composant, et ces trois-là ne sont pas dans le
// périmètre de cette sous-tâche.
function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const parts: string[] = []
  if (hours > 0) parts.push(`${hours} h`)
  if (hours > 0 || minutes > 0) parts.push(`${minutes} min`)
  parts.push(`${seconds} s`)
  return parts.join(' ')
}

/** Ligne affichée pour un événement du journal : « <type d'agent> démarré · <description> »
 *  ou « <type d'agent> terminé · <durée> ». */
export function formatEventLine(e: AgentEvent): string {
  const agentLabel = formatAgentTypeLabel(e.agent.agentType)
  if (e.kind === 'started') {
    return `${agentLabel} démarré · ${truncateDescription(e.agent.description)}`
  }
  return `${agentLabel} terminé · ${formatDuration(e.agent.durationMs)}`
}
