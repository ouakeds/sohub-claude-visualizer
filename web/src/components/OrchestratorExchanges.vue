<script setup lang="ts">
import { computed } from 'vue'
import type { AgentNode } from '../../../shared/types'
import { deriveStatus, statusLabel } from '../composables/useNow'
import { formatAgentTypeLabel, sortByStartedAt } from '../composables/useTimeline'

// Journal des échanges avec l'orchestrateur (tiroir « ÉCHANGES AVEC L'ORCHESTRATEUR · ORDRE
// D'APPEL ») : pour chaque agent de la session, dans l'ordre où l'orchestrateur l'a délégué,
// un message de délégation (gauche) suivi d'un message de réponse (droite) dérivé du statut
// courant de l'agent — jamais le statut brut du serveur, `now` (fourni par l'appelant, tick
// partagé de `useNow`) sert de référence pour la fraîcheur comme partout ailleurs dans l'app.
const props = defineProps<{ agents: AgentNode[]; now: number }>()

const emit = defineEmits<{ (e: 'select', agent: AgentNode): void }>()

/** Aplatit l'arbre d'agents (`children` récursifs) : ce composant travaille sur l'ordre
 *  d'appel réel, toutes profondeurs et branches confondues, pas seulement les racines. */
function flattenAgents(nodes: AgentNode[]): AgentNode[] {
  return nodes.flatMap((node) => [node, ...flattenAgents(node.children)])
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

/** Origine des horodatages « T+Nmin » : le composant ne reçoit pas le début de session en
 *  prop (contrat C4), l'instant du tout premier agent délégué en tient donc lieu — c'est aussi
 *  l'instant où l'orchestrateur commence concrètement à répartir le travail. */
const originMs = computed(() => {
  const starts = flattenAgents(props.agents)
    .map((agent) => parseTimestamp(agent.startedAt))
    .filter((ms): ms is number => ms !== null)
  return starts.length > 0 ? Math.min(...starts) : props.now
})

function formatOffset(ms: number | null): string {
  if (ms === null) return '—'
  const minutes = Math.max(0, Math.round((ms - originMs.value) / 60_000))
  return `T+${minutes}min`
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const parts: string[] = []
  if (hours > 0) parts.push(`${hours} h`)
  if (hours > 0 || minutes > 0) parts.push(`${minutes} min`)
  if (hours === 0) parts.push(`${seconds} s`)
  return parts.join(' ')
}

type Exchange = {
  n: string
  agent: AgentNode
  align: 'left' | 'right'
  time: string
  verb: string
  body: string
  toneClass: string
  prompt: string | null
}

/** Une paire délégation/réponse par agent, dans l'ordre d'appel (`sortByStartedAt`, la même
 *  référence de tri que partout ailleurs) : le statut de la réponse se dérive au moment du
 *  rendu, jamais figé au chargement — un agent `running` devient `résultat` sans recharger dès
 *  que le tick partagé avance ou qu'un événement SSE le termine. */
const exchanges = computed<Exchange[]>(() => {
  const sorted = sortByStartedAt(flattenAgents(props.agents))
  const list: Omit<Exchange, 'n'>[] = []

  for (const agent of sorted) {
    const startMs = parseTimestamp(agent.startedAt)
    list.push({
      agent,
      align: 'left',
      time: formatOffset(startMs),
      verb: 'déléguer',
      body: `${agent.description || agent.agentType} · ${formatAgentTypeLabel(agent.agentType)}`,
      toneClass: 'border-hud-cyan/35 text-hud-cyan-soft',
      prompt: agent.prompt || null,
    })

    const lastActivity = agent.endedAt ?? agent.startedAt
    const status = deriveStatus(agent.status, lastActivity, props.now)
    const responseMs = parseTimestamp(agent.endedAt) ?? (status === 'running' ? props.now : startMs)

    if (status === 'done') {
      list.push({
        agent,
        align: 'right',
        time: formatOffset(responseMs),
        verb: 'résultat',
        body: `terminé · ${formatDuration(agent.durationMs)}`,
        toneClass: 'border-hud-green/35 text-hud-green',
        prompt: null,
      })
    } else if (status === 'running') {
      list.push({
        agent,
        align: 'right',
        time: formatOffset(responseMs),
        verb: 'flux',
        body: 'exécution en cours…',
        toneClass: 'border-hud-cyan/35 text-hud-cyan-soft',
        prompt: null,
      })
    } else {
      list.push({
        agent,
        align: 'right',
        time: formatOffset(responseMs),
        verb: 'attente',
        body: statusLabel(status, lastActivity, props.now),
        toneClass: 'border-hud-amber/35 text-hud-amber',
        prompt: null,
      })
    }
  }

  return list.map((entry, index) => ({ ...entry, n: String(index + 1).padStart(2, '0') }))
})
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <p v-if="exchanges.length === 0" class="py-6 text-center font-mono text-xs text-hud-muted">
      Aucun échange avec l'orchestrateur pour cette session.
    </p>

    <div
      v-for="exchange in exchanges"
      :key="`${exchange.agent.id}-${exchange.n}`"
      class="flex"
      :class="exchange.align === 'left' ? 'justify-start' : 'justify-end'"
    >
      <!-- Le déclencheur de sélection (bouton natif) et le <details> du prompt sont deux
           éléments interactifs frères, jamais imbriqués : un <button> ne peut pas contenir de
           <details>/<summary> (contenu flottant), et deux contrôles interactifs imbriqués
           cassent la navigation clavier/lecteur d'écran. -->
      <div class="max-w-[88%] border-l-2 border-y border-r bg-hud-panel px-3 py-1.5" :class="exchange.toneClass">
        <button
          type="button"
          class="block w-full text-left transition-colors hover:text-hud-cyan-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-hud-cyan"
          @click="emit('select', exchange.agent)"
        >
          <div class="flex flex-wrap items-baseline gap-2 font-mono text-[10px] tracking-[0.1em]">
            <span class="text-hud-dim">{{ exchange.n }}</span>
            <span class="text-hud-muted">{{ exchange.time }}</span>
          </div>
          <div class="mt-0.5 font-mono text-[12.5px] text-hud-text">
            <span class="font-semibold">{{ exchange.verb }}(</span>{{ exchange.body }}<span class="font-semibold">)</span>
          </div>
        </button>
        <details v-if="exchange.prompt" class="mt-1">
          <summary class="cursor-pointer font-mono text-[10px] tracking-[0.08em] text-hud-muted hover:text-hud-cyan-soft">
            voir le prompt
          </summary>
          <p class="mt-1 whitespace-pre-wrap font-mono text-[11px] text-hud-soft">{{ exchange.prompt }}</p>
        </details>
      </div>
    </div>
  </div>
</template>
