<script setup lang="ts">
// Fil d'Ariane, deux ou trois segments selon l'écran :
// - écran projet : « Projets / <nom du projet> » (`sessionLabel` absent) — comportement
//   historique, inchangé pour ProjectView.vue.
// - écran session (SessionView.vue) : « Centre de commande / <nom du projet> / <libellé de la
//   session> », les deux premiers segments cliquables. `rootLabel` (par défaut « Projets »,
//   comportement historique) permet à SessionView.vue de nommer sa racine « Centre de
//   commande » sans affecter ProjectView.vue. Il n'existe aucun routeur : chaque clic est un
//   événement écouté par le parent (`back` ramène à la racine, `to-project` ouvre l'écran du
//   projet).
withDefaults(defineProps<{ projectName: string; sessionLabel?: string; rootLabel?: string }>(), {
  rootLabel: 'Projets',
})

const emit = defineEmits<{ (e: 'back'): void; (e: 'to-project'): void }>()
</script>

<template>
  <nav aria-label="Fil d'Ariane" class="mb-4 font-mono text-[11px] tracking-[0.2em] text-hud-grey">
    <ol class="flex items-center gap-2">
      <li>
        <button
          type="button"
          class="uppercase transition-colors hover:text-hud-cyan-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          @click="emit('back')"
        >
          {{ rootLabel }}
        </button>
      </li>
      <li aria-hidden="true" class="text-hud-dim">/</li>
      <li>
        <button
          v-if="sessionLabel"
          type="button"
          class="uppercase transition-colors hover:text-hud-cyan-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          @click="emit('to-project')"
        >
          {{ projectName }}
        </button>
        <span v-else class="uppercase text-hud-text-strong">{{ projectName }}</span>
      </li>
      <template v-if="sessionLabel">
        <li aria-hidden="true" class="text-hud-dim">/</li>
        <li class="uppercase text-hud-text-strong">{{ sessionLabel }}</li>
      </template>
    </ol>
  </nav>
</template>
