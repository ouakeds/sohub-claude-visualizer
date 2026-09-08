<script setup lang="ts">
import { useDashboard } from '../composables/useDashboard'
import TokenCells from '../components/TokenCells.vue'
import StatusBadge from '../components/StatusBadge.vue'
import Breadcrumb from '../components/Breadcrumb.vue'
import SessionCard from '../components/SessionCard.vue'
import type { SessionDetail, SessionSummary } from '../../../shared/types'

const {
  currentProject,
  sessions,
  sessionsLoading,
  sessionsError,
  refreshSessions,
  closeProject,
  openSession,
} = useDashboard()

// SessionCard (cf. ProjectsView.vue / accueil) attend une `SessionDetail`, arbre d'agents
// inclus — l'historique à froid de cet écran ne charge que des `SessionSummary` (pas
// d'arbre, cf. GET /api/projects/:id/sessions). `agents: []` reflète honnêtement cette absence
// de donnée plutôt que d'en inventer une : SessionChainPreview (utilisé par SessionCard) s'en
// accommode déjà nativement en affichant « aucun agent », la carte masque donc d'elle-même sa
// zone d'aperçu de chaîne sans qu'on ait à toucher SessionCard.vue (hors périmètre de cette
// sous-tâche).
function toSessionDetail(session: SessionSummary): SessionDetail {
  return { ...session, agents: [] }
}

// Carte cliquable : ouvre la page de détail de la session (SessionView.vue) sans quitter cet
// écran, qui reste affiché derrière tant que la page est ouverte (`openSession` ne touche
// jamais `currentProject`, cf. useDashboard.ts) — le retour y ramène directement.
function selectSession(session: SessionSummary): void {
  openSession(session)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

// Une seule ligne illisible se libelle au singulier : « 1 ligne ignorée ».
function skippedLabel(count: number): string {
  return count > 1 ? `${count} lignes ignorées` : `${count} ligne ignorée`
}
</script>

<template>
  <section v-if="currentProject" aria-label="Liste des sessions du projet">
    <Breadcrumb :project-name="currentProject.name" @back="closeProject" />

    <header class="hud-panel mb-6 flex flex-col gap-4 p-5">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="hud-label">Projet</p>
          <h1
            class="mt-1 truncate font-display text-xl font-semibold text-hud-text-strong"
            :title="currentProject.name"
          >
            {{ currentProject.name }}
          </h1>
          <p class="mt-1 truncate font-mono text-xs text-hud-muted" :title="currentProject.path">
            {{ currentProject.path }}
          </p>
        </div>
        <StatusBadge :status="currentProject.status" :last-activity="currentProject.lastActivity" />
      </div>

      <div class="flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-xs text-hud-soft">
        <span>{{ currentProject.sessionCount }} session{{ currentProject.sessionCount > 1 ? 's' : '' }}</span>
        <span v-if="currentProject.runningSessionCount > 0" class="text-hud-cyan">
          {{ currentProject.runningSessionCount }} en cours
        </span>
        <span v-if="currentProject.skippedLines > 0" class="text-hud-amber">
          {{ skippedLabel(currentProject.skippedLines) }}
        </span>
        <span>Dernière activité {{ formatDate(currentProject.lastActivity) }}</span>
      </div>

      <div class="overflow-x-auto">
        <TokenCells :usage="currentProject.usage" />
      </div>
    </header>

    <div class="mb-4 flex items-baseline justify-between gap-4">
      <h2 class="font-display text-[11px] uppercase tracking-[0.2em] text-accent-dim">Sessions</h2>
      <p v-if="!sessionsLoading || sessions.length > 0" class="font-mono text-xs tabular-nums text-slate-500">
        {{ sessions.length }} session{{ sessions.length > 1 ? 's' : '' }}
      </p>
    </div>

    <div
      v-if="sessionsLoading && sessions.length === 0"
      aria-live="polite"
      class="py-16 text-center font-mono text-xs uppercase tracking-[0.15em] text-accent-dim/70"
    >
      Chargement des sessions…
    </div>

    <div v-else-if="sessionsError" class="border border-red-800 bg-red-950/40 p-4 text-red-300" role="alert">
      <p class="font-medium">Impossible de charger les sessions.</p>
      <p class="mt-1 text-sm text-red-400">{{ sessionsError }}</p>
      <button
        type="button"
        class="mt-3 border border-red-700 px-3 py-1.5 text-sm font-medium text-red-200 hover:bg-red-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        @click="refreshSessions()"
      >
        Réessayer
      </button>
    </div>

    <div v-else-if="sessions.length === 0" aria-live="polite" class="py-16 text-center text-slate-400">
      Aucune session pour ce projet sur cette fenêtre.
    </div>

    <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(330px,1fr))] gap-[18px]">
      <SessionCard
        v-for="session in sessions"
        :key="session.id"
        :session="toSessionDetail(session)"
        :project="currentProject"
        @select="selectSession(session)"
      />
    </div>
  </section>
</template>
