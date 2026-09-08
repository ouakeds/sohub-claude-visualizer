<script setup lang="ts">
import { computed } from 'vue'
import { useDashboard } from '../composables/useDashboard'

// Barre de filtre du Centre de commande (contrat C4, maquette
// `.sohub-claude-plugin/maquette/maquette-template.html`) : filtre uniquement la grille de
// sessions vivantes (`visibleLiveSessions`), jamais le journal — cf. `statusFilter` dans
// useDashboard.ts. Pas de filtre « Terminé » ici : le compteur `liveCounts.done` ne sert qu'à
// la répartition de la colonne latérale.
const { liveCounts, statusFilter, setStatusFilter } = useDashboard()

type StatusFilterValue = 'all' | 'running' | 'idle'

const statusFilters = computed<Array<{ value: StatusFilterValue; label: string; count: number }>>(() => [
  { value: 'all', label: 'TOUS', count: liveCounts.value.all },
  { value: 'running', label: 'EN COURS', count: liveCounts.value.running },
  { value: 'idle', label: 'INACTIF', count: liveCounts.value.idle },
])

// Une seule session inactive/en exécution se libelle au singulier, comme les libellés
// équivalents des autres vues (cf. ProjectsView.vue avant réécriture).
function idleAndRunningNote(idleCount: number, runningCount: number): string {
  const idleLabel = idleCount > 1 ? `${idleCount} sessions inactives` : `${idleCount} session inactive`
  return `${idleLabel} · ${runningCount} en exécution`
}
</script>

<template>
  <div class="relative mb-5 flex flex-wrap items-center gap-3.5">
    <button
      v-for="filter in statusFilters"
      :key="filter.value"
      type="button"
      class="hud-btn border uppercase transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-hud-cyan"
      :class="
        statusFilter === filter.value
          ? 'border-hud-cyan/60 bg-hud-cyan/[0.14] text-hud-cyan-soft'
          : 'border-hud-cyan/[0.18] bg-hud-cyan/[0.03] text-hud-grey hover:border-hud-cyan/40 hover:text-hud-text'
      "
      :aria-pressed="statusFilter === filter.value"
      @click="setStatusFilter(filter.value)"
    >
      {{ filter.label }} · {{ filter.count }}
    </button>

    <div class="flex-1"></div>

    <span class="font-mono text-[11px] tracking-[0.12em] text-hud-amber">
      {{ idleAndRunningNote(liveCounts.idle, liveCounts.running) }}
    </span>
  </div>
</template>
