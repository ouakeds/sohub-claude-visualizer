<script setup lang="ts">
import { computed } from 'vue'
import { useDashboard } from '../composables/useDashboard'
import { deriveStatus, statusLabel, useNow } from '../composables/useNow'

// Colonne latérale du Centre de commande (contrat C4, maquette
// `.sohub-claude-plugin/maquette/maquette-template.html`, section `<aside>`) : répartition des
// sessions live et rappel des sessions inactives. Aucune formulation « bloquée », « à l'arrêt »
// ou « échoué » (cf. CLAUDE.md) : une session inactive attend une action, elle n'a pas échoué.
const { liveCounts, allLiveSessions, setStatusFilter } = useDashboard()

const { now } = useNow()

type BreakdownItem = { label: string; n: number; pct: number; barClass: string; textClass: string }

// Répartition sur `all + done` (jamais seulement `all`) : une session terminée compte pour la
// répartition affichée ici, contrairement à `visibleLiveSessions` qui ne montre que les
// sessions vivantes.
const breakdown = computed<BreakdownItem[]>(() => {
  const total = liveCounts.value.all + liveCounts.value.done
  const items = [
    { label: 'EN COURS', n: liveCounts.value.running, barClass: 'bg-hud-cyan', textClass: 'text-hud-cyan' },
    { label: 'INACTIF', n: liveCounts.value.idle, barClass: 'bg-hud-amber', textClass: 'text-hud-amber' },
    { label: 'TERMINÉ', n: liveCounts.value.done, barClass: 'bg-hud-green', textClass: 'text-hud-green' },
  ]
  return items.map((item) => ({ ...item, pct: total === 0 ? 0 : Math.round((item.n / total) * 100) }))
})

// Les trois premiers libellés de sessions inactives, avec leur ancienneté (jamais plus, cf.
// contrat C4) : `allLiveSessions` place déjà les sessions inactives en tête, `slice` après
// filtre suffit donc à prendre les plus significatives.
const idleSessionLabels = computed(() =>
  allLiveSessions.value
    .filter(({ session }) => deriveStatus(session.status, session.lastActivity, now.value) === 'idle')
    .slice(0, 3)
    .map(({ session }) => `${session.label} (${statusLabel('idle', session.lastActivity, now.value)})`),
)

// Liste à la française : « a », « a et b », « a, b et c » — jamais de virgule avant le dernier
// élément.
function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`
}

function idleSessionsIntro(count: number): string {
  return count > 1 ? `${count} sessions attendent une action` : `${count} session attend une action`
}
</script>

<template>
  <aside class="sticky top-[22px] flex flex-col gap-[18px]" aria-label="Colonne de synthèse">
    <section class="hud-panel p-4">
      <div class="hud-label mb-3">Répartition</div>
      <div v-for="item in breakdown" :key="item.label" class="mb-2.5 last:mb-0">
        <div class="mb-1 flex items-center justify-between text-sm tracking-wide">
          <span :class="item.textClass">{{ item.label }}</span>
          <span class="font-mono text-hud-soft">{{ item.n }}</span>
        </div>
        <div class="h-1 bg-hud-cyan/10">
          <div class="h-1" :class="item.barClass" :style="{ width: `${item.pct}%` }"></div>
        </div>
      </div>
    </section>

    <section class="border border-hud-amber/[0.35] bg-hud-amber/[0.06] p-4">
      <div class="mb-2.5 font-mono text-[10px] uppercase tracking-[0.24em] text-hud-amber">Sessions inactives</div>
      <p v-if="liveCounts.idle > 0" class="text-[15px] leading-snug text-hud-text">
        {{ idleSessionsIntro(liveCounts.idle) }} : {{ joinWithAnd(idleSessionLabels) }}.
      </p>
      <p v-else class="text-[15px] leading-snug text-hud-text">
        Aucune session inactive. Tous les agents progressent.
      </p>
      <button
        type="button"
        class="hud-btn mt-3.5 w-full border border-hud-amber/50 bg-hud-amber/[0.14] uppercase text-hud-amber hover:bg-hud-amber/[0.24] focus:outline-none focus-visible:ring-2 focus-visible:ring-hud-amber"
        @click="setStatusFilter('idle')"
      >
        Afficher les inactives
      </button>
    </section>
  </aside>
</template>
