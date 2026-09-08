<script setup lang="ts">
import { computed } from 'vue'
import type { AgentStatus } from '../../../shared/types'
import type { SessionLanes } from '../composables/useTimeline'

// Mini-Gantt compact posé sur une carte de session (zone « VOIES ») : une ligne de 7px par
// voie (un `agentType` distinct, cf. `computeSessionLanes`), barres positionnées en absolu
// (`leftPct`/`widthPct`) façon jauge — un aperçu, jamais le Gantt interactif complet du
// tiroir de détail (hors périmètre ici, ni axe gradué ni info-bulle par barre).
//
// Au-delà de `maxLanes`, les voies restantes ne sont jamais tronquées silencieusement : elles
// se condensent dans un repère textuel « +N voies » plutôt que d'allonger indéfiniment la
// carte ou de les faire disparaître sans trace.
const props = withDefaults(defineProps<{ lanes: SessionLanes; maxLanes?: number }>(), { maxLanes: 3 })

const visibleLanes = computed(() => props.lanes.lanes.slice(0, props.maxLanes))
const hiddenLaneCount = computed(() => props.lanes.lanes.length - visibleLanes.value.length)

// Mapping statut -> couleur du contrat C1 (running cyan, idle amber, done green) : la même
// palette que le reste du « Centre de commande », pas les anciennes teintes `status-*`.
function barColorClass(status: AgentStatus): string {
  switch (status) {
    case 'running':
      return 'bg-hud-cyan'
    case 'done':
      return 'bg-hud-green'
    case 'idle':
    default:
      return 'bg-hud-amber'
  }
}
</script>

<template>
  <p v-if="visibleLanes.length === 0" class="font-mono text-xs text-hud-dim">Aucune voie</p>

  <div v-else class="flex flex-col gap-[3px]">
    <div
      v-for="lane in visibleLanes"
      :key="lane.key"
      class="relative h-[7px] bg-[rgba(77,227,255,.07)]"
      role="img"
      :aria-label="`Voie ${lane.label} : ${lane.bars.length} exécution${lane.bars.length > 1 ? 's' : ''}`"
    >
      <div
        v-for="bar in lane.bars"
        :key="bar.agent.id"
        class="absolute top-0 h-[7px] opacity-75"
        :class="barColorClass(bar.status)"
        :style="{ left: bar.leftPct + '%', width: bar.widthPct + '%' }"
      ></div>
    </div>

    <p v-if="hiddenLaneCount > 0" class="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-accent-dim">
      +{{ hiddenLaneCount }} voie{{ hiddenLaneCount > 1 ? 's' : '' }}
    </p>
  </div>
</template>
