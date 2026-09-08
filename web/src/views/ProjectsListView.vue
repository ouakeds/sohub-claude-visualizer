<script setup lang="ts">
import { computed } from 'vue'
import { useDashboard } from '../composables/useDashboard'
import ActivityDot from '../components/ActivityDot.vue'
import StatusBadge from '../components/StatusBadge.vue'
import TokenCells from '../components/TokenCells.vue'
import type { ProjectSummary } from '../../../shared/types'

// Écran « Projets » (T2) : liste complète de tous les projets connus, sans la limite à 5
// imposée à la colonne latérale du Centre de commande (cf. CommandSidebar.vue). Réutilise les
// mêmes données que celle-ci (`projects`, cf. `useDashboard`) et les mêmes primitives
// d'affichage (StatusBadge, TokenCells, ActivityDot) plutôt que d'en recréer. Le clic sur un
// projet ouvre son écran de sessions (`openProject`, cf. ProjectView.vue) — inchangé quel que
// soit l'écran d'origine.
const { projects, loading, error, refresh, openProject } = useDashboard()

const projectsByRecentActivity = computed(() =>
  [...projects.value].sort(
    (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime(),
  ),
)

function projectSessionsNote(project: ProjectSummary): string {
  return `${project.runningSessionCount} en cours · ${project.sessionCount} session${project.sessionCount > 1 ? 's' : ''}`
}
</script>

<template>
  <section aria-label="Tous les projets">
    <header class="mb-5 flex items-baseline justify-between gap-4">
      <h1 class="font-display text-[11px] uppercase tracking-[0.2em] text-accent-dim">
        Projets
        <span v-if="!loading || projects.length > 0" class="font-mono text-hud-muted">
          · {{ projects.length }} projet{{ projects.length > 1 ? 's' : '' }}
        </span>
      </h1>
    </header>

    <div
      v-if="loading && projects.length === 0"
      aria-live="polite"
      class="py-16 text-center font-mono text-xs uppercase tracking-[0.15em] text-hud-muted"
    >
      Chargement des projets…
    </div>

    <div v-else-if="error" class="hud-panel border-red-800/60 bg-red-950/40 p-4 text-red-300" role="alert">
      <p class="font-medium">Impossible de charger les projets.</p>
      <p class="mt-1 text-sm text-red-400">{{ error }}</p>
      <button
        type="button"
        class="mt-3 border border-red-700 px-3 py-1.5 text-sm font-medium text-red-200 hover:bg-red-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        @click="refresh()"
      >
        Réessayer
      </button>
    </div>

    <div v-else-if="projects.length === 0" aria-live="polite" class="hud-panel p-8 text-center text-hud-soft">
      Aucun projet dans cette fenêtre.
    </div>

    <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-[18px]">
      <button
        v-for="project in projectsByRecentActivity"
        :key="project.id"
        type="button"
        class="hud-panel flex flex-col gap-3 p-4 text-left transition-colors hover:border-hud-cyan/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-hud-cyan"
        :aria-label="`Ouvrir l'historique du projet ${project.name}`"
        @click="openProject(project)"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex min-w-0 items-center gap-2">
            <ActivityDot :status="project.status" :last-activity="project.lastActivity" />
            <span class="truncate text-sm text-hud-text-strong" :title="project.name">{{ project.name }}</span>
          </div>
          <StatusBadge :status="project.status" :last-activity="project.lastActivity" />
        </div>

        <p class="truncate font-mono text-[11px] text-hud-muted" :title="project.path">{{ project.path }}</p>
        <p class="font-mono text-xs text-hud-soft">{{ projectSessionsNote(project) }}</p>

        <div class="overflow-x-auto">
          <TokenCells :usage="project.usage" size="sm" />
        </div>
      </button>
    </div>
  </section>
</template>
