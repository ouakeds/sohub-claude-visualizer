<script setup lang="ts">
import { useDashboard } from './composables/useDashboard'
import WindowSelector from './components/WindowSelector.vue'
import ProjectsView from './views/ProjectsView.vue'
import ProjectsListView from './views/ProjectsListView.vue'
import ProjectView from './views/ProjectView.vue'
import SessionView from './views/SessionView.vue'

// Pas de routeur : la vue courante est un champ du composable partagé. `currentSession`
// affiche la page de détail (SessionView) à la place de l'écran courant dans le `<main>`,
// jamais en overlay par-dessus lui : `currentProject` reste renseigné derrière tant que la
// page est ouverte (cf. useDashboard.ts, `sessionOrigin`), mais ce n'est plus lui qui est
// rendu — c'est SessionView.vue, qui sait y ramener au retour.
// `currentScreen` distingue les deux écrans d'accueil (Centre de commande / liste complète des
// projets) ; `currentProject` a toujours priorité sur `currentScreen`, cf. useDashboard.ts.
const {
  currentProject,
  currentSession,
  currentScreen,
  openProjectsScreen,
  closeProjectsScreen,
  liveCounts,
  streamConnected,
} = useDashboard()
</script>

<template>
  <div class="hud-grid-bg relative min-h-screen font-display text-hud-text">
    <div class="hud-scanlines" aria-hidden="true"></div>

    <div class="relative flex min-h-screen w-full flex-col px-6 py-6 xl:px-10">
      <header class="relative flex flex-wrap items-end justify-between gap-6 border-b border-hud-line pb-3.5">
        <div class="flex items-center gap-4">
          <div class="relative h-[42px] w-[42px] shrink-0" aria-hidden="true">
            <div class="absolute inset-0 rounded-full border border-hud-cyan/50"></div>
            <div class="absolute inset-[5px] animate-jspin rounded-full border border-dashed border-hud-cyan/45"></div>
            <div class="absolute inset-[13px] rounded-full bg-hud-cyan shadow-glow"></div>
          </div>
          <div>
            <p class="font-mono text-[11px] tracking-[0.34em] text-hud-muted">SOHUB · VISUALIZER</p>
            <h1 class="font-display text-[27px] font-bold uppercase leading-[1.1] tracking-[0.02em] text-hud-text-strong">
              Centre de commande
            </h1>
          </div>

          <nav
            class="inline-flex items-center gap-1.5"
            role="group"
            aria-label="Navigation principale"
          >
            <button
              type="button"
              class="hud-btn uppercase transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-hud-cyan"
              :class="
                currentScreen === 'command'
                  ? 'border border-hud-cyan/60 bg-hud-cyan/[0.14] text-hud-cyan-soft'
                  : 'border border-hud-line text-hud-grey hover:border-hud-cyan/40 hover:text-hud-text'
              "
              :aria-current="currentScreen === 'command' ? 'page' : undefined"
              @click="closeProjectsScreen()"
            >
              Centre de commande
            </button>
            <button
              type="button"
              class="hud-btn uppercase transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-hud-cyan"
              :class="
                currentScreen === 'projects'
                  ? 'border border-hud-cyan/60 bg-hud-cyan/[0.14] text-hud-cyan-soft'
                  : 'border border-hud-line text-hud-grey hover:border-hud-cyan/40 hover:text-hud-text'
              "
              :aria-current="currentScreen === 'projects' ? 'page' : undefined"
              @click="openProjectsScreen()"
            >
              Projets
            </button>
          </nav>
        </div>

        <div class="flex flex-wrap items-end gap-6">
          <div>
            <p class="hud-label">Fenêtre</p>
            <WindowSelector class="mt-1.5" />
          </div>

          <div>
            <p class="hud-label">Sessions</p>
            <p class="mt-0.5 font-mono text-[19px] text-hud-cyan-soft">
              {{ liveCounts.running }} en cours · {{ liveCounts.idle }} inactives
            </p>
          </div>

          <div
            v-if="streamConnected"
            class="flex items-center gap-2.5 border border-hud-green/[0.35] bg-hud-green/[0.07] px-3.5 py-[7px]"
          >
            <span class="h-[7px] w-[7px] shrink-0 animate-jpulse rounded-full bg-hud-green"></span>
            <span class="font-mono text-[11px] uppercase tracking-[0.22em] text-hud-green">Flux en ligne</span>
          </div>
          <div v-else class="flex items-center gap-2.5 border border-hud-amber/[0.35] bg-hud-amber/[0.07] px-3.5 py-[7px]">
            <span class="h-[7px] w-[7px] shrink-0 animate-jblink rounded-full bg-hud-amber"></span>
            <span class="font-mono text-[11px] uppercase tracking-[0.22em] text-hud-amber">Flux interrompu</span>
          </div>
        </div>
      </header>

      <main class="relative mt-6 flex-1">
        <SessionView v-if="currentSession" />
        <ProjectView v-else-if="currentProject" />
        <ProjectsListView v-else-if="currentScreen === 'projects'" />
        <ProjectsView v-else />
      </main>
    </div>
  </div>
</template>
