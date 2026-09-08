<script setup lang="ts">
import { computed } from 'vue'
import type { AgentNode } from '../../../shared/types'
import { formatAgentTypeLabel, sortByStartedAt } from '../composables/useTimeline'
import TokenCells from './TokenCells.vue'

// Consommation par agent (onglet « Agents » de SessionView.vue) : une ligne par agent, sa
// consommation PROPRE (`ownUsage`, jamais `totalUsage` — la part de ses sous-agents est déjà
// comptée séparément sur leurs propres lignes) et une barre proportionnelle sur la SEULE
// catégorie « sortie » (`output`), jamais une somme des cinq catégories (cf. CLAUDE.md).
//
// Chaque ligne est sélectionnable — bouton natif, sur le même modèle que ExecutionLanes.vue /
// OrchestratorExchanges.vue — et relaie le clic (ou Entrée/Espace, gratuits sur un `<button>`)
// au parent via `select`, qui décide de la sélection. `selectedId` (optionnel) ne fait
// qu'illustrer visuellement la ligne déjà sélectionnée par ailleurs (maître-détail de
// SessionView.vue) ; un consommateur qui ne le passe pas garde des lignes cliquables mais sans
// mise en avant, et un consommateur qui ignore l'événement `select` n'est pas cassé pour
// autant.
const props = defineProps<{ agents: AgentNode[]; selectedId?: string | null }>()

const emit = defineEmits<{ (e: 'select', agent: AgentNode): void }>()

/** Longueur au-delà de laquelle la description est tronquée dans le libellé de ligne. */
const DESCRIPTION_TRUNCATE_LENGTH = 60

function flattenAgents(nodes: AgentNode[]): AgentNode[] {
  return nodes.flatMap((node) => [node, ...flattenAgents(node.children)])
}

function toolCallCount(agent: AgentNode): number {
  return agent.tools.reduce((sum, tool) => sum + tool.count, 0)
}

function shortDescription(agent: AgentNode): string {
  const text = agent.description || agent.agentType
  return text.length > DESCRIPTION_TRUNCATE_LENGTH ? `${text.slice(0, DESCRIPTION_TRUNCATE_LENGTH)}…` : text
}

// Triés par ordre d'appel (`sortByStartedAt`, la référence de tri partagée par tout le tiroir),
// jamais dans l'ordre de parcours brut de l'arbre.
const rows = computed(() => sortByStartedAt(flattenAgents(props.agents)))

// Échelle commune de la barre « sortie » : le max des `output` propres affichés, jamais leur
// somme — un agent sans sortie du tout (max à 0) ne doit pas produire de division par zéro.
const maxOutput = computed(() => Math.max(1, ...rows.value.map((agent) => agent.ownUsage.output)))

function outputPct(agent: AgentNode): number {
  return Math.min(100, Math.round((agent.ownUsage.output / maxOutput.value) * 100))
}

function isSelected(agent: AgentNode): boolean {
  return props.selectedId != null && agent.id === props.selectedId
}
</script>

<template>
  <p v-if="rows.length === 0" class="py-6 text-center font-mono text-xs text-hud-muted">
    Aucun agent pour cette session.
  </p>

  <div v-else class="divide-y divide-hud-line border border-hud-line text-sm">
    <button
      v-for="agent in rows"
      :key="agent.id"
      type="button"
      class="block w-full px-2 py-2.5 text-left transition-colors hover:bg-hud-cyan/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-hud-cyan focus-visible:ring-inset"
      :class="isSelected(agent) ? 'bg-hud-cyan/[0.08] text-hud-cyan-soft' : ''"
      :aria-pressed="isSelected(agent)"
      :aria-label="`Voir le détail de l'agent ${agent.description || agent.agentType}`"
      @click="emit('select', agent)"
    >
      <div class="flex items-baseline justify-between gap-3">
        <span
          class="truncate font-display text-[15px] font-semibold"
          :class="isSelected(agent) ? 'text-hud-cyan-soft' : 'text-hud-text-strong'"
          :title="agent.description"
        >
          {{ formatAgentTypeLabel(agent.agentType) }} — {{ shortDescription(agent) }}
        </span>
        <span class="shrink-0 font-mono text-xs text-hud-soft">
          {{ toolCallCount(agent) }} appel{{ toolCallCount(agent) > 1 ? 's' : '' }}
        </span>
      </div>

      <div class="mt-1.5">
        <div class="hud-label normal-case tracking-normal">propre</div>
        <TokenCells :usage="agent.ownUsage" />
      </div>

      <div class="mt-1.5 flex items-center gap-2">
        <span class="hud-label shrink-0">sortie</span>
        <div class="h-2 flex-1 bg-hud-line/20">
          <div class="h-2 bg-hud-cyan" :style="{ width: outputPct(agent) + '%' }"></div>
        </div>
      </div>
    </button>
  </div>
</template>
