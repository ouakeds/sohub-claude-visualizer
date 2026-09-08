<script setup lang="ts">
import { computed } from 'vue'
import type { AgentEvent } from '../composables/useEvents'
import { formatEventLine } from '../composables/useEvents'

// Journal compact des derniers événements d'agents (zone « FLUX AGENT » d'une carte de
// session). `dense` resserre l'interligne pour une réutilisation future dans une colonne
// latérale (journal système) sans dupliquer ce composant — aucune autre différence de rendu.
//
// `events` arrive déjà trié du plus récent au plus ancien (cf. `deriveAgentEvents`) : on n'en
// garde que les `max` premiers, puis on les réaffiche dans l'ordre inverse (le plus ancien en
// haut, le plus discret ; le plus récent en bas, pleine opacité et coloré) — l'œil descend
// vers le dernier événement, comme un flux qui avance plutôt qu'une pile qui remonte.
const props = withDefaults(defineProps<{ events: AgentEvent[]; max?: number; dense?: boolean }>(), {
  max: 4,
  dense: false,
})

const displayedEvents = computed(() => props.events.slice(0, props.max).slice().reverse())

function opacityFor(index: number): number {
  const count = displayedEvents.value.length
  if (count <= 1) return 1
  return 0.4 + (index / (count - 1)) * 0.6
}

// Seule la dernière ligne (l'événement le plus récent) porte une couleur sémantique, les
// autres restent en gris-bleu neutre (cf. maquette) : un agent qui démarre en cyan, un agent
// qui termine en vert — jamais de 4e état.
function colorClassFor(index: number, event: AgentEvent): string {
  if (index !== displayedEvents.value.length - 1) return 'text-hud-soft'
  return event.kind === 'started' ? 'text-hud-cyan' : 'text-hud-green'
}
</script>

<template>
  <p v-if="displayedEvents.length === 0" class="font-mono text-xs text-hud-dim">Aucun événement</p>

  <div v-else class="flex flex-col font-mono text-[11.5px]" :class="dense ? 'gap-0.5' : 'gap-[3px]'">
    <div
      v-for="(event, index) in displayedEvents"
      :key="`${event.agent.id}-${event.kind}`"
      class="flex items-baseline gap-2 overflow-hidden whitespace-nowrap"
      :style="{ opacity: opacityFor(index) }"
    >
      <span class="shrink-0 text-hud-dim">·</span>
      <span class="truncate" :class="colorClassFor(index, event)">{{ formatEventLine(event) }}</span>
    </div>
  </div>
</template>
