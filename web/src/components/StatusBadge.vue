<script setup lang="ts">
import { computed } from 'vue'
import type { AgentStatus } from '../../../shared/types'
import { deriveStatus, statusLabel, useNow } from '../composables/useNow'

// Quatre statuts, quatre libellés : jamais « échouée », `idle` ne dit qu'une chose,
// depuis combien de temps la session est inactive (cf. CLAUDE.md). Le libellé passe toujours
// par `statusLabel`/`deriveStatus` (useNow.ts), seule source de vérité du contrat « inactif
// depuis N min » — jamais une seconde implémentation locale qui pourrait diverger du texte.
// `waitingFor` n'a de sens que pour `status === 'waiting'` (statut de session uniquement, cf.
// `SessionSummary.waitingFor`) : absent (agents, qui ne portent jamais ce statut), le libellé
// retombe sur « en attente de réponse ».
const props = defineProps<{
  status: AgentStatus
  lastActivity: string
  waitingFor?: 'question' | 'permission' | null
}>()

const { now } = useNow()

const liveStatus = computed(() => deriveStatus(props.status, props.lastActivity, now.value))
const label = computed(() => statusLabel(liveStatus.value, props.lastActivity, now.value, props.waitingFor))

// Mapping statut du contrat C1 : running cyan, idle ambre, done vert, waiting rouge (hud-red)
// — une session qui attend une réponse ou une permission se remarque autant qu'une erreur le
// ferait, sans jamais utiliser le mot « échec ».
const badgeClass = computed(() => {
  switch (liveStatus.value) {
    case 'running':
      return 'border-hud-cyan/50 bg-hud-cyan/10 text-hud-cyan'
    case 'done':
      return 'border-hud-green/50 bg-hud-green/10 text-hud-green'
    case 'waiting':
      return 'border-hud-red/50 bg-hud-red/10 text-hud-red'
    case 'idle':
    default:
      return 'border-hud-amber/50 bg-hud-amber/10 text-hud-amber'
  }
})

const dotClass = computed(() => {
  switch (liveStatus.value) {
    case 'running':
      return 'bg-hud-cyan animate-jpulse'
    case 'done':
      return 'bg-hud-green'
    case 'waiting':
      return 'bg-hud-red animate-jpulse'
    case 'idle':
    default:
      return 'bg-hud-amber animate-jblink'
  }
})
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 whitespace-nowrap border px-2 py-1 font-mono text-[10px] tracking-[0.16em] uppercase tabular-nums"
    :class="badgeClass"
  >
    <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="dotClass" aria-hidden="true" />
    {{ label }}
  </span>
</template>
