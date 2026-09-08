<script setup lang="ts">
import { useDashboard } from '../composables/useDashboard'
import type { Window } from '../../../shared/types'

const { window: currentWindow, setWindow } = useDashboard()

const options: Array<{ value: Window; label: string }> = [
  { value: '7d', label: '7 j' },
  { value: '30d', label: '30 j' },
  { value: 'all', label: 'tout' },
]
</script>

<template>
  <div class="inline-flex items-center gap-1.5" role="group" aria-label="Fenêtre temporelle">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="hud-btn uppercase transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      :class="
        currentWindow === option.value
          ? 'border border-hud-cyan/60 bg-hud-cyan/[0.14] text-hud-cyan-soft'
          : 'border border-hud-line text-hud-grey hover:border-hud-cyan/40 hover:text-hud-text'
      "
      :aria-pressed="currentWindow === option.value"
      @click="setWindow(option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
