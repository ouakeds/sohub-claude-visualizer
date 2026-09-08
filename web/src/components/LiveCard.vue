<script setup lang="ts">
// Carte live réutilisable : la brique commune à l'accueil (une carte par projet) et à la
// vue projet (une carte par session), pour que ces vues ne divergent pas en trois variantes
// du même visuel. Conçue avec des slots plutôt qu'une longue liste de props typées, pour ne
// jamais présumer de la forme exacte du contenu d'une vue à l'autre : chaque vue compose
// librement son en-tête (titre + StatusBadge/ActivityDot), ses métadonnées (chemin, dates,
// nombre de sessions...), sa zone de tokens (TokenCells, réutilisé tel quel — jamais de total
// unique, cf. CLAUDE.md) et son pied.
//
// Cliquable, mais ne navigue jamais elle-même : elle émet `click`, la navigation reste au
// composable useDashboard, appelé par la vue consommatrice. Le survol et le focus clavier
// sont gérés nativement en s'appuyant sur un vrai <button> (activable par Entrée/Espace sans
// gestionnaire dédié), stylé avec les mêmes tokens visuels que le reste de l'app (.hud-panel,
// accent cyan, cf. style.css et tailwind.config.js).
//
// Accent de statut (bordure gauche 3px, cf. maquette-template.html `p.accent`) : pas de prop
// dédiée pour ne rien changer à l'interface consommée par les trois sous-tâches en parallèle.
// La largeur est réservée en permanence, la couleur reste transparente par défaut ; une vue
// consommatrice qui veut la colorer selon son propre statut passe une variable CSS en attribut
// `style` (fallthrough, pas une prop déclarée) : `<LiveCard style="--live-card-accent: ...">`.
defineProps<{ ariaLabel?: string }>()

const emit = defineEmits<{ (e: 'click'): void }>()
</script>

<template>
  <button
    type="button"
    class="hud-panel group flex w-full flex-col gap-3 border-l-[3px] border-l-[var(--live-card-accent,transparent)] p-4 text-left transition-colors hover:bg-hud-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    :aria-label="ariaLabel"
    @click="emit('click')"
  >
    <div v-if="$slots.header" class="flex items-center justify-between gap-3">
      <slot name="header" />
    </div>

    <div v-if="$slots.meta" class="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-slate-500">
      <slot name="meta" />
    </div>

    <!-- La zone tokens attend un contenu de flux libre, typiquement un <TokenCells :usage="..." />
         (composant autonome, racine <div> en grille de cinq colonnes, cf. T7) précédé au besoin
         d'un libellé `.hud-label`. `overflow-x-auto` reste un filet de sécurité pour les valeurs
         extrêmes, TokenCells n'a plus besoin d'un <table> englobant. -->
    <div v-if="$slots.tokens" class="overflow-x-auto">
      <slot name="tokens" />
    </div>

    <div
      v-if="$slots.footer"
      class="flex items-center justify-between gap-3 border-t border-hud-line pt-2 font-mono text-xs text-slate-500"
    >
      <slot name="footer" />
    </div>
  </button>
</template>
