<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { AgentNode } from '../../../shared/types'
import StatusBadge from './StatusBadge.vue'
import TokenCells from './TokenCells.vue'

// Panneau latéral de détail : reste monté à côté de l'arbre tant qu'un agent est
// sélectionné ; passer d'un agent à l'autre ne referme pas le panneau, seules ses props
// changent. Se ferme par la croix (`close`) ; Échap n'est PAS géré ici (seul consommateur
// actuel : SessionView.vue, qui possède déjà son propre écouteur global et doit arbitrer entre
// « fermer le détail » et « revenir en arrière » — deux écouteurs `keydown` distincts sur
// `window` s'exécuteraient tous les deux au même appui et double-agiraient).
const props = defineProps<{ agent: AgentNode }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const PROMPT_TRUNCATE_LENGTH = 300
const promptExpanded = ref(false)
const panelRef = ref<HTMLElement | null>(null)

// Repli de la tâche à chaque changement d'agent sélectionné.
watch(
  () => props.agent.id,
  () => {
    promptExpanded.value = false
  },
)

// Un `prompt` vide affiche la description à la place, sans mention d'erreur.
const promptText = computed(() => props.agent.prompt || props.agent.description)
const isPromptTruncatable = computed(() => props.agent.prompt.length > PROMPT_TRUNCATE_LENGTH)
const displayedPrompt = computed(() => {
  if (!isPromptTruncatable.value || promptExpanded.value) return promptText.value
  return `${promptText.value.slice(0, PROMPT_TRUNCATE_LENGTH)}…`
})

// Nombre total d'appels d'outils, dérivé de `agent.tools` (jamais mis en état : une seule
// source de vérité, recalculée à chaque changement d'agent sélectionné).
const totalToolCalls = computed(() => props.agent.tools.reduce((sum, tool) => sum + tool.count, 0))

function formatDate(iso: string | null): string {
  if (!iso) return 'non terminé'
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

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

onMounted(() => {
  panelRef.value?.focus()
})
// Une seule ligne illisible se libelle au singulier : « 1 ligne ignorée ».
function skippedLabel(count: number): string {
  return count > 1 ? `${count} lignes ignorées` : `${count} ligne ignorée`
}
</script>

<template>
  <aside
    ref="panelRef"
    tabindex="-1"
    aria-label="Détail de l'agent"
    class="hud-panel w-full shrink-0 p-4 focus:outline-none"
  >
    <div class="flex items-start justify-between gap-2 border-b border-hud-line pb-3">
      <h2 class="hud-label">Détail de l'agent</h2>
      <button
        type="button"
        class="shrink-0 rounded p-1 text-accent-dim hover:text-accent-bright focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label="Fermer le détail de l'agent"
        @click="emit('close')"
      >
        <svg viewBox="0 0 16 16" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.75">
          <path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <!-- Rangée d'en-tête (motif KPI JARVIS, cf. SessionView.vue) : identité de l'agent. -->
    <div class="mt-4 grid grid-cols-2 gap-px bg-hud-line/20 text-sm sm:grid-cols-5">
      <div class="min-w-0 bg-hud-bg px-3 py-2.5">
        <div class="hud-label">Type</div>
        <div class="mt-0.5 truncate font-mono text-slate-200">{{ agent.agentType }}</div>
      </div>
      <div class="min-w-0 bg-hud-bg px-3 py-2.5 sm:col-span-2">
        <div class="hud-label">Description</div>
        <div class="mt-0.5 truncate text-slate-200">{{ agent.description || '—' }}</div>
      </div>
      <div class="min-w-0 bg-hud-bg px-3 py-2.5">
        <div class="hud-label">Statut</div>
        <div class="mt-1"><StatusBadge :status="agent.status" :last-activity="agent.endedAt ?? agent.startedAt" /></div>
      </div>
      <div class="min-w-0 bg-hud-bg px-3 py-2.5">
        <div class="hud-label">Modèles</div>
        <div class="mt-0.5 truncate font-mono text-slate-200">{{ agent.models.length > 0 ? agent.models.join(', ') : '—' }}</div>
      </div>
    </div>

    <!-- Rangée de cellules KPI : dates, durée, volume d'appels d'outils. -->
    <div class="mt-3 grid grid-cols-2 gap-px bg-hud-line/20 text-sm sm:grid-cols-4">
      <div class="min-w-0 bg-hud-bg px-3 py-2.5">
        <div class="hud-label">Démarré le</div>
        <div class="mt-0.5 truncate font-mono text-slate-200">{{ formatDate(agent.startedAt) }}</div>
      </div>
      <div class="min-w-0 bg-hud-bg px-3 py-2.5">
        <div class="hud-label">Terminé le</div>
        <div class="mt-0.5 truncate font-mono text-slate-200">{{ formatDate(agent.endedAt) }}</div>
      </div>
      <div class="min-w-0 bg-hud-bg px-3 py-2.5">
        <div class="hud-label">Durée</div>
        <div class="mt-0.5 font-mono tabular-nums text-slate-200">{{ formatDuration(agent.durationMs) }}</div>
      </div>
      <div class="min-w-0 bg-hud-bg px-3 py-2.5">
        <div class="hud-label">Appels outils</div>
        <div class="mt-0.5 font-mono tabular-nums text-slate-200">{{ totalToolCalls }}</div>
      </div>
    </div>

    <div v-if="agent.skippedLines > 0" class="mt-3 text-xs text-amber-400">
      {{ skippedLabel(agent.skippedLines) }}
    </div>

    <!-- Corps en grille horizontale : Tâche, Tokens et Outils appelés côte à côte plutôt
         qu'empilés, pour rester lisibles sans défilement de page sur la largeur de colonne
         disponible (contrat C6). -->
    <div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div class="min-w-0">
        <h3 class="hud-label">Tâche</h3>
        <div class="mt-1 max-h-64 overflow-y-auto border border-hud-line p-2">
          <p class="whitespace-pre-wrap text-sm text-slate-200">{{ displayedPrompt }}</p>
          <button
            v-if="isPromptTruncatable"
            type="button"
            class="mt-1 rounded text-xs font-medium text-accent underline-offset-2 hover:text-accent-bright hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            @click="promptExpanded = !promptExpanded"
          >
            {{ promptExpanded ? 'replier' : 'voir tout' }}
          </button>
        </div>
      </div>

      <div class="min-w-0">
        <h3 class="hud-label">Tokens (total / propre)</h3>
        <div class="mt-1 overflow-x-auto border border-hud-line p-2">
          <TokenCells :usage="agent.totalUsage" :secondary="agent.ownUsage" />
        </div>
      </div>

      <div class="min-w-0">
        <h3 class="hud-label">Outils appelés</h3>
        <ul
          v-if="agent.tools.length > 0"
          class="mt-1 max-h-64 divide-y divide-hud-line overflow-y-auto border border-hud-line text-sm"
        >
          <li
            v-for="tool in agent.tools"
            :key="tool.name"
            class="flex items-center justify-between px-2 py-1.5 hover:bg-hud-800/60"
          >
            <span class="text-slate-200">{{ tool.name }}</span>
            <span class="font-mono tabular-nums text-accent-dim">{{ tool.count }}</span>
          </li>
        </ul>
        <p v-else class="mt-1 text-sm text-slate-500">Aucun outil appelé.</p>
      </div>
    </div>
  </aside>
</template>
