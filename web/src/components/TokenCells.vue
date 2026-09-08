<script setup lang="ts">
import { computed } from 'vue'
import type { TokenUsage } from '../../../shared/types'

// Rend les cinq catégories de tokens en cinq cellules distinctes, chacune avec son propre
// libellé (contrat C1, `.hud-label`) : jamais un total unique — le cache écrase tout le reste
// sur un run réel (cf. shared/types.ts et CLAUDE.md).
//
// Composant autonome (T7) : racine `<div>` en grille de cinq colonnes, plus de `<td>`. Un
// consommateur n'a donc plus besoin d'englober TokenCells dans un `<table>/<tbody>/<tr>` — il
// se pose directement dans le flux. `min-w-0` sur la grille et sur chaque cellule, combiné à
// `truncate` sur le libellé et la valeur, garantit que les cinq catégories restent visibles
// côte à côte même dans un conteneur étroit (carte de session, colonne latérale, cellule KPI du
// tiroir) plutôt que de déborder ou de faire disparaître les dernières colonnes (défaut corrigé
// par cette sous-tâche : Cache créé et Thinking étaient coupés dans un `<table>` non maîtrisé).
//
// `secondary` (optionnelle) affiche une seconde valeur en arrière-plan de chaque cellule, par
// exemple la part propre d'une session (`ownUsage`) sous sa consommation totale (`totalUsage`),
// pour distinguer ce qui vient des sous-agents sans jamais sommer les catégories entre elles.
//
// `size` (optionnelle, 'md' par défaut) : 'sm' réduit les tailles de police pour les
// conteneurs les plus étroits (colonne latérale du Centre de commande, cf. CommandSidebar.vue).
const props = withDefaults(defineProps<{ usage: TokenUsage; secondary?: TokenUsage; size?: 'sm' | 'md' }>(), {
  size: 'md',
})

type Cell = { label: string; key: keyof TokenUsage }

const CELLS: Cell[] = [
  { label: 'Input', key: 'input' },
  { label: 'Output', key: 'output' },
  { label: 'Cache lu', key: 'cacheRead' },
  { label: 'Cache créé', key: 'cacheCreation' },
  { label: 'Thinking', key: 'thinking' },
]

function formatNumber(value: number): string {
  return value.toLocaleString('fr-FR')
}

const gapClass = computed(() => (props.size === 'sm' ? 'gap-x-1.5' : 'gap-x-2'))
const labelSizeClass = computed(() => (props.size === 'sm' ? 'text-[8px]' : 'text-[9px]'))
const valueSizeClass = computed(() => (props.size === 'sm' ? 'text-[10px]' : 'text-[12px]'))
const secondarySizeClass = computed(() => (props.size === 'sm' ? 'text-[9px]' : 'text-[10px]'))
</script>

<template>
  <div class="grid min-w-0 grid-cols-5" :class="gapClass">
    <div v-for="cell in CELLS" :key="cell.key" class="min-w-0 text-right">
      <div class="hud-label truncate tracking-normal" :class="labelSizeClass">{{ cell.label }}</div>
      <div class="truncate font-mono tabular-nums text-hud-text" :class="valueSizeClass">
        {{ formatNumber(usage[cell.key]) }}
      </div>
      <div v-if="props.secondary" class="truncate font-mono tabular-nums text-hud-muted" :class="secondarySizeClass">
        {{ formatNumber(props.secondary[cell.key]) }}
      </div>
    </div>
  </div>
</template>
