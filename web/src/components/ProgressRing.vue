<script setup lang="ts">
import { computed } from 'vue'

// Anneau de progression compact (zone agent d'une carte de session, cf. maquette « Centre de
// commande ») : un cercle de fond discret et un arc dont le tracé (`stroke-dasharray` /
// `stroke-dashoffset`) matérialise `value / max`, texte brut au centre plutôt qu'un
// pourcentage — c'est le compte d'agents terminés sur le total qui importe ici, pas une
// progression continue.
//
// `accent` porte une classe Tailwind de couleur de texte (ex. `text-hud-cyan`) plutôt qu'une
// valeur hexadécimale : l'arc suit via `stroke="currentColor"`, même convention que
// `AgentNode.vue` pour ses icônes SVG.
const RADIUS = 26
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const props = defineProps<{ value: number; max: number; accent: string; label?: string }>()

// Tolérant : un `max` nul ou négatif (aucun agent) ne divise jamais par zéro, l'arc reste
// simplement vide plutôt que de produire un `NaN` dans l'attribut SVG.
const fraction = computed(() => {
  if (props.max <= 0) return 0
  return Math.min(Math.max(props.value / props.max, 0), 1)
})

const dashOffset = computed(() => CIRCUMFERENCE * (1 - fraction.value))

const ariaLabel = computed(() => props.label ?? `${props.value} agent${props.value > 1 ? 's' : ''} terminé sur ${props.max}`)
</script>

<template>
  <div class="relative h-[62px] w-[62px] shrink-0" :class="accent" role="img" :aria-label="ariaLabel">
    <svg width="62" height="62" viewBox="0 0 62 62" class="block -rotate-90">
      <circle cx="31" cy="31" r="26" fill="none" stroke="rgba(77,227,255,.13)" stroke-width="3" />
      <circle
        cx="31"
        cy="31"
        r="26"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="butt"
        :stroke-dasharray="CIRCUMFERENCE"
        :stroke-dashoffset="dashOffset"
      />
    </svg>
    <div class="absolute inset-0 flex items-center justify-center font-mono text-[13px] tabular-nums">
      {{ value }}/{{ max }}
    </div>
  </div>
</template>
