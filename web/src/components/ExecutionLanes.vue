<script setup lang="ts">
import { computed } from 'vue'
import type { AgentNode, AgentStatus } from '../../../shared/types'
import type { LaneBar, SessionLanes } from '../composables/useTimeline'

// Gantt d'exécution de la session entière (tiroir « VOIES D'EXÉCUTION », SessionDrawer.vue) :
// une ligne fixe ORCHESTRATEUR (barre pleine sur tout l'axe) au-dessus d'une ligne par voie
// (`lanes.lanes`, une voie = un `agentType`). Purement présentationnel : la géométrie
// (positions/largeurs en %, statut dérivé, chevauchement) est déjà calculée par
// `computeSessionLanes` (cf. useTimeline.ts) — ce composant ne fait qu'en dériver les classes
// visuelles et relayer le clic sur une barre au parent, qui décide de la sélection.
const props = defineProps<{ lanes: SessionLanes; selectedId?: string | null }>()

const emit = defineEmits<{ (e: 'select', agent: AgentNode): void }>()

/** Longueur au-delà de laquelle la description affichée sur une barre est tronquée : le titre
 *  natif (`title`) porte toujours le texte complet, cf. accessibilité. */
const DESCRIPTION_TRUNCATE_LENGTH = 42

/** Nombre total d'agents délégués par l'orchestrateur, toutes voies confondues — affiché sur
 *  sa ligne pleine, jamais une somme de tokens (cf. CLAUDE.md, sans rapport ici mais même
 *  principe de ne jamais fabriquer un total qui n'a pas de sens métier). */
const totalDelegated = computed(() => props.lanes.lanes.reduce((sum, lane) => sum + lane.bars.length, 0))

/** `true` si au moins une barre est tronquée à gauche (T3) : affiche la légende du chevron
 *  seulement quand elle sert à quelque chose, plutôt que de l'imposer en permanence. */
const hasTruncatedBar = computed(() =>
  props.lanes.lanes.some((lane) => lane.bars.some((bar) => bar.truncatedStart)),
)

const parallelismLabel = computed(() =>
  props.lanes.maxParallel > 1
    ? `PARALLÈLE · ${props.lanes.maxParallel} AGENTS SIMULTANÉS`
    : 'SÉQUENTIEL · 1 AGENT À LA FOIS',
)

function formatActive(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const parts: string[] = []
  if (hours > 0) parts.push(`${hours} h`)
  if (hours > 0 || minutes > 0) parts.push(`${minutes} min`)
  if (hours === 0) parts.push(`${seconds} s`)
  return parts.join(' ')
}

function truncatedDescription(bar: LaneBar): string {
  const text = bar.agent.description || bar.agent.agentType
  return text.length > DESCRIPTION_TRUNCATE_LENGTH ? `${text.slice(0, DESCRIPTION_TRUNCATE_LENGTH)}…` : text
}

// Barre tronquée à gauche (T3) : l'agent a démarré avant l'origine de l'axe visible (agent
// actif le plus ancien, cf. `computeSessionLanes`/`anchor: 'active'`). Le titre natif porte
// l'info pour qui n'a pas l'indice visuel sous les yeux (survol tactile, lecteur d'écran qui
// ignore l'`aria-hidden` du chevron).
function barTitle(bar: LaneBar): string {
  const base = bar.agent.description || bar.agent.agentType
  return bar.truncatedStart ? `${base} (démarré avant le début affiché)` : base
}

function isSelected(bar: LaneBar): boolean {
  return props.selectedId != null && bar.agent.id === props.selectedId
}

// running cyan + balayage, idle amber hachuré, done vert (contrat T1 : mapping statut de la
// palette C1). `idle` reste la valeur par défaut du switch, jamais un 4e état.
function barToneClasses(status: AgentStatus): string {
  switch (status) {
    case 'running':
      return 'border-hud-cyan bg-hud-cyan/15 text-hud-cyan-soft'
    case 'done':
      return 'border-hud-green/60 bg-hud-green/15 text-hud-green'
    case 'idle':
    default:
      return 'border-hud-amber/60 bg-hud-amber/15 text-hud-amber'
  }
}
</script>

<template>
  <div class="border border-hud-line bg-hud-bg/70 px-3 py-3">
    <p v-if="lanes.lanes.length === 0" class="py-6 text-center font-mono text-xs text-hud-muted">
      Aucune voie d'exécution pour cette session.
    </p>

    <template v-else>
      <!-- Graduations de l'axe, communes à toutes les lignes ci-dessous. -->
      <div class="relative ml-36 mb-1.5 h-4">
        <span
          v-for="tick in lanes.ticks"
          :key="tick.pct"
          class="absolute -translate-x-1/2 whitespace-nowrap font-mono text-[9.5px] tracking-[0.1em] text-hud-dim"
          :style="{ left: tick.pct + '%' }"
        >
          {{ tick.label }}
        </span>
      </div>

      <!-- Ligne ORCHESTRATEUR : barre pleine sur toute la durée, jamais cliquable (ce n'est pas
           un agent sélectionnable). -->
      <div class="flex items-center gap-3 border-t border-hud-line/60 py-1.5">
        <div class="w-36 shrink-0 font-mono text-[11px] tracking-[0.14em] text-hud-cyan">ORCHESTRATEUR</div>
        <div
          class="relative h-6 flex-1 border-l border-hud-cyan/40 bg-gradient-to-r from-hud-cyan/20 to-hud-cyan/5"
        >
          <span
            class="absolute inset-0 flex items-center truncate px-2 font-mono text-[10px] tracking-[0.12em] text-hud-cyan-soft"
          >
            {{ totalDelegated }} AGENTS DÉLÉGUÉS · RÉPARTIT &amp; COLLECTE
          </span>
        </div>
      </div>

      <!-- Une ligne par voie (agentType) : ses barres, une par agent de la voie. -->
      <div
        v-for="lane in lanes.lanes"
        :key="lane.key"
        class="flex items-center gap-3 border-t border-hud-line/30 py-1.5"
      >
        <div class="w-36 shrink-0">
          <div class="truncate text-sm font-semibold tracking-[0.02em] text-hud-text-strong" :title="lane.label">
            {{ lane.label }}
          </div>
          <div class="font-mono text-[9.5px] text-hud-muted">{{ formatActive(lane.activeMs) }} actif</div>
        </div>

        <div class="relative h-6 flex-1 border-l border-hud-line/50">
          <button
            v-for="bar in lane.bars"
            :key="bar.agent.id"
            type="button"
            class="absolute inset-y-0.5 flex items-center overflow-hidden border px-1.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-hud-cyan"
            :class="[barToneClasses(bar.status), isSelected(bar) ? 'ring-2 ring-hud-cyan' : '']"
            :style="{ left: bar.leftPct + '%', width: bar.widthPct + '%' }"
            :title="barTitle(bar)"
            @click="emit('select', bar.agent)"
          >
            <span v-if="bar.status === 'idle'" class="hud-hatch" aria-hidden="true"></span>
            <span v-if="bar.status === 'running'" class="hud-sweep" aria-hidden="true"></span>
            <!-- Indice discret de troncature (T3) : l'agent a démarré avant l'origine de l'axe
                 visible, sa barre est tronquée à gauche (`left: 0`) — le chevron rappelle qu'il
                 continue hors champ. Décoratif : l'info complète est dans `title` (barTitle). -->
            <span v-if="bar.truncatedStart" class="relative shrink-0 pr-0.5 text-[9px] opacity-60" aria-hidden="true"
              >‹</span
            >
            <span class="relative truncate font-mono text-[10px]">{{ truncatedDescription(bar) }}</span>
          </button>
        </div>
      </div>

      <div class="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-hud-line/40 pt-2">
        <span
          class="border px-2 py-0.5 font-mono text-[10px] tracking-[0.14em]"
          :class="
            lanes.maxParallel > 1
              ? 'border-hud-cyan/60 text-hud-cyan-soft'
              : 'border-hud-line-strong text-hud-muted'
          "
        >
          {{ parallelismLabel }}
        </span>
        <span class="font-mono text-[10px] tracking-[0.08em] text-hud-muted">
          ▮ recouvrement = agents en parallèle · <span class="text-hud-amber">▨ hachuré = inactif</span>
          <template v-if="hasTruncatedBar"> · ‹ tronqué = démarré avant le début affiché</template>
        </span>
      </div>
    </template>
  </div>
</template>
