<script setup lang="ts">
import { useDashboard } from '../composables/useDashboard'
import FilterBar from '../components/FilterBar.vue'
import CommandSidebar from '../components/CommandSidebar.vue'
import SessionCard from '../components/SessionCard.vue'

// Écran « Centre de commande » (contrat C4, maquette
// `.sohub-claude-plugin/maquette/maquette-template.html`) : une grille plate de cartes de
// sessions vivantes (`visibleLiveSessions`, déjà triée inactives d'abord par useDashboard),
// jamais regroupées par projet — le regroupement se lit dans la colonne PROJETS de
// CommandSidebar. Le clic sur une carte ouvre la page de détail (`openSessionInProject`), qui
// remplace cet écran ; le retour (SessionView.vue) y ramène directement, `currentProject`
// n'ayant jamais été renseigné pour cette origine.
const { visibleLiveSessions, loading, error, refresh, openSessionInProject } = useDashboard()
</script>

<template>
  <section aria-label="Centre de commande">
    <FilterBar />

    <div
      v-if="loading && visibleLiveSessions.length === 0"
      aria-live="polite"
      class="py-16 text-center font-mono text-xs uppercase tracking-[0.15em] text-hud-muted"
    >
      Chargement des sessions…
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

    <div v-else class="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-5">
      <div>
        <div v-if="visibleLiveSessions.length === 0" class="hud-panel p-8 text-center text-hud-soft">
          <p>Aucune session vivante dans cette fenêtre.</p>
          <p class="mt-1 font-mono text-xs text-hud-muted">
            Consultez la colonne « Projets » pour l'historique complet.
          </p>
        </div>

        <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(330px,1fr))] gap-[18px]">
          <SessionCard
            v-for="item in visibleLiveSessions"
            :key="item.session.id"
            :session="item.session"
            :project="item.project"
            @select="openSessionInProject(item.project, item.session)"
          />
        </div>
      </div>

      <CommandSidebar />
    </div>
  </section>
</template>
