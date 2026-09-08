<script setup lang="ts">
import { computed } from 'vue'
import LiveCard from './LiveCard.vue'
import ActivityDot from './ActivityDot.vue'
import TokenCells from './TokenCells.vue'
import ProgressRing from './ProgressRing.vue'
import MiniLanes from './MiniLanes.vue'
import EventFeed from './EventFeed.vue'
import { deriveStatus, statusLabel, useNow } from '../composables/useNow'
import { computeSessionLanes, formatAgentTypeLabel } from '../composables/useTimeline'
import { deriveAgentEvents } from '../composables/useEvents'
import type { AgentNode, AgentStatus, ProjectSummary, SessionSummary } from '../../../shared/types'

// Carte de session « Centre de commande » (contrat C3, maquette
// `.sohub-claude-plugin/maquette/maquette-template.html`) : en-tête, anneau de progression
// d'agents, mini-Gantt des voies d'exécution et flux des derniers événements — le tout
// alimenté par les mêmes données que l'arbre d'agents complet, jamais un résumé inventé côté
// client. `agents` reste optionnel (cf. contrat C3) : sans lui (vue projet, résumé de session
// sans arbre chargé), l'anneau, les voies et le flux se masquent, seuls l'en-tête, les tokens
// et le pied restent affichés.
const props = defineProps<{ session: SessionSummary & { agents?: AgentNode[] }; project: ProjectSummary }>()

const emit = defineEmits<{ (e: 'select'): void }>()

// Tick partagé : le statut affiché se recale seul sur `idle` entre deux événements SSE, sans
// attendre que le serveur pousse un nouvel événement `live` (cf. useNow.ts, CLAUDE.md).
const { now } = useNow()

const liveStatus = computed(() => deriveStatus(props.session.status, props.session.lastActivity, now.value))
const label = computed(() =>
  statusLabel(liveStatus.value, props.session.lastActivity, now.value, props.session.waitingFor),
)

const hasAgents = computed(() => Array.isArray(props.session.agents) && props.session.agents.length > 0)

type StatusVisual = {
  borderClass: string
  leftBorderClass: string
  badgeBorderClass: string
  badgeBgClass: string
  textClass: string
}

// Palette du contrat C1 (running cyan, idle amber, done green, waiting rouge/hud-red) — jamais
// les anciennes teintes `status-*` (héritées d'avant la maquette), qui n'ont pas idle en ambre.
// `waiting` reprend le rouge réservé jusqu'ici (cf. tailwind.config.js) : la session attend une
// réponse ou une permission, elle doit se remarquer d'un coup d'œil sur l'accueil.
const STATUS_VISUALS: Record<AgentStatus, StatusVisual> = {
  running: {
    borderClass: 'border-hud-cyan/30',
    leftBorderClass: 'border-l-hud-cyan',
    badgeBorderClass: 'border-hud-cyan/60',
    badgeBgClass: 'bg-hud-cyan/10',
    textClass: 'text-hud-cyan',
  },
  idle: {
    borderClass: 'border-hud-amber/50',
    leftBorderClass: 'border-l-hud-amber',
    badgeBorderClass: 'border-hud-amber/60',
    badgeBgClass: 'bg-hud-amber/10',
    textClass: 'text-hud-amber',
  },
  done: {
    borderClass: 'border-hud-green/30',
    leftBorderClass: 'border-l-hud-green',
    badgeBorderClass: 'border-hud-green/50',
    badgeBgClass: 'bg-hud-green/10',
    textClass: 'text-hud-green',
  },
  waiting: {
    borderClass: 'border-hud-red/50',
    leftBorderClass: 'border-l-hud-red',
    badgeBorderClass: 'border-hud-red/60',
    badgeBgClass: 'bg-hud-red/10',
    textClass: 'text-hud-red',
  },
}

const statusVisual = computed(() => STATUS_VISUALS[liveStatus.value])

// Aplatit l'arbre d'agents (toutes profondeurs, `children` récursifs) : la matière de
// l'anneau (agents terminés / total), de l'agent courant et du décompte d'appels d'outils du
// pied de carte. Dupliqué à dessein de `useTimeline.ts`/`useEvents.ts` (même logique, non
// exportée) : ces composables n'ont pas vocation à exposer une primitive d'arbre pour un seul
// composant consommateur.
function flattenAgents(agents: AgentNode[]): AgentNode[] {
  return agents.flatMap((agent) => [agent, ...flattenAgents(agent.children)])
}

const flatAgents = computed(() => (props.session.agents ? flattenAgents(props.session.agents) : []))

const doneAgentCount = computed(
  () =>
    flatAgents.value.filter(
      (agent) => deriveStatus(agent.status, agent.endedAt ?? agent.startedAt, now.value) === 'done',
    ).length,
)

function startMsOf(agent: AgentNode): number {
  const ms = new Date(agent.startedAt).getTime()
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms
}

// Agent courant affiché à droite de l'anneau : le dernier agent `running` dérivé (le plus
// récemment démarré, s'il y en a plusieurs en parallèle), sinon le dernier agent démarré tout
// court — jamais un agent arbitraire pris dans l'ordre de l'arbre.
const currentAgent = computed<AgentNode | null>(() => {
  const running = flatAgents.value.filter(
    (agent) => deriveStatus(agent.status, agent.endedAt ?? agent.startedAt, now.value) === 'running',
  )
  const pool = running.length > 0 ? running : flatAgents.value
  if (pool.length === 0) return null
  return [...pool].sort((a, b) => startMsOf(b) - startMsOf(a))[0]
})

const sessionLanes = computed(() =>
  hasAgents.value
    ? computeSessionLanes(props.session.agents ?? [], props.session.startedAt, props.session.lastActivity, now.value)
    : null,
)

const lanesHeaderLabel = computed(() => {
  if (!sessionLanes.value) return ''
  const count = sessionLanes.value.lanes.length
  return sessionLanes.value.maxParallel > 1
    ? `${count} agents · parallèle ×${sessionLanes.value.maxParallel}`
    : `${count} agents · séquentiel`
})

const lanesHeaderColorClass = computed(() =>
  sessionLanes.value && sessionLanes.value.maxParallel > 1 ? 'text-hud-cyan' : 'text-hud-grey',
)

const events = computed(() => (hasAgents.value ? deriveAgentEvents(props.session, props.project.name) : []))

// « EN DIRECT » tant que la session est active côté client, sinon le même libellé d'ancienneté
// que le badge d'en-tête (jamais « échoué », cf. CLAUDE.md).
const flowSignal = computed(() => (liveStatus.value === 'running' ? 'EN DIRECT' : label.value))

// Total d'appels d'outils, toutes voies et tous agents confondus (m = Σ tools[].count
// aplati) : n'a de sens que si l'arbre est chargé, sinon reste indisponible plutôt qu'un 0
// trompeur.
const toolCallsTotal = computed(() =>
  flatAgents.value.reduce((sum, agent) => sum + agent.tools.reduce((toolSum, tool) => toolSum + tool.count, 0), 0),
)
</script>

<template>
  <LiveCard
    class="border-l-[3px] transition-colors"
    :class="[statusVisual.borderClass, statusVisual.leftBorderClass]"
    :aria-label="`Ouvrir la session ${session.label} du projet ${project.name}`"
    @click="emit('select')"
  >
    <template #header>
      <svg
        v-if="liveStatus === 'running'"
        class="hud-sweep"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <rect x="1" y="1" width="98" height="98" />
      </svg>
      <div v-if="liveStatus === 'idle'" class="hud-hatch" aria-hidden="true"></div>
      <!-- Halo discret hud-red, calque dédié (aria-hidden, pas sur un élément de contenu) :
           une session `waiting` doit se remarquer d'un coup d'œil sur l'accueil sans recourir
           au mot « échec » (cf. CLAUDE.md). -->
      <div v-if="liveStatus === 'waiting'" class="pointer-events-none absolute inset-0 shadow-glow-red" aria-hidden="true"></div>

      <div class="min-w-0">
        <p class="truncate font-mono text-[10px] uppercase tracking-[0.22em] text-hud-muted">
          {{ project.name.toUpperCase() }}
        </p>
        <h3
          class="mt-0.5 truncate font-display text-lg font-semibold tracking-wide text-hud-text-strong"
          :title="session.label"
        >
          {{ session.label }}
        </h3>
      </div>

      <div class="flex shrink-0 items-center gap-1.5 border px-2 py-1" :class="[statusVisual.badgeBorderClass, statusVisual.badgeBgClass]">
        <!-- `liveStatus`, pas `session.status` brut : la pastille doit toujours coïncider avec
             `label` juste à côté, dérivé du même `liveStatus`. -->
        <ActivityDot :status="liveStatus" :last-activity="session.lastActivity" :waiting-for="session.waitingFor" />
        <span class="whitespace-nowrap font-mono text-[10px] uppercase tracking-wider" :class="statusVisual.textClass">
          {{ label }}
        </span>
      </div>
    </template>

    <template #meta>
      <div v-if="hasAgents" class="flex w-full flex-col gap-3">
        <!-- (b) Anneau de progression + agent courant -->
        <div class="flex items-center gap-3.5 border-t border-hud-line pt-3">
          <ProgressRing :value="doneAgentCount" :max="flatAgents.length" :accent="statusVisual.textClass" />
          <div class="min-w-0 flex-1">
            <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-hud-muted">Agent</p>
            <template v-if="currentAgent">
              <p
                class="truncate text-sm font-semibold text-hud-text"
                :title="formatAgentTypeLabel(currentAgent.agentType)"
              >
                {{ formatAgentTypeLabel(currentAgent.agentType) }}
              </p>
              <p class="mt-0.5 line-clamp-2 text-xs text-hud-soft" :title="currentAgent.description">
                {{ currentAgent.description }}
              </p>
            </template>
          </div>
        </div>

        <!-- (c) Voies d'exécution -->
        <div class="border-t border-hud-line pt-2.5">
          <div class="mb-1.5 flex items-center justify-between gap-3">
            <span class="font-mono text-[10px] uppercase tracking-[0.2em] text-hud-muted">Voies</span>
            <span class="font-mono text-[10px] uppercase tracking-wide" :class="lanesHeaderColorClass">
              {{ lanesHeaderLabel }}
            </span>
          </div>
          <MiniLanes v-if="sessionLanes" :lanes="sessionLanes" />
        </div>

        <!-- (d) Flux agent -->
        <div class="border-t border-hud-line pt-2.5">
          <div class="mb-1.5 flex items-center justify-between gap-3">
            <span class="font-mono text-[10px] uppercase tracking-[0.2em] text-hud-muted">Flux agent</span>
            <span class="font-mono text-[10px] uppercase tracking-wide" :class="statusVisual.textClass">
              {{ flowSignal }}
            </span>
          </div>
          <EventFeed :events="events" />
        </div>
      </div>
    </template>

    <template #tokens>
      <div class="hud-label mb-1">Total</div>
      <TokenCells :usage="session.totalUsage" />
    </template>

    <template #footer>
      <span class="uppercase">
        Agents {{ session.agentCount }}<span v-if="hasAgents"> · Outils {{ toolCallsTotal }} appels</span>
      </span>
    </template>
  </LiveCard>
</template>
