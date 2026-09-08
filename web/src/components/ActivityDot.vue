<script setup lang="ts">
import { computed } from 'vue'
import type { AgentStatus } from '../../../shared/types'
import { deriveStatus, statusLabel, useNow } from '../composables/useNow'

// Pastille de vivacité : indicateur compact posé sur les cartes live (LiveCard) et dans la
// chaîne d'agents, là où StatusBadge (texte + puce) prendrait trop de place. `lastActivity`
// est optionnel : sans lui, le statut serveur est affiché tel quel, sans dérive côté client ;
// fourni, la pastille se recale seule sur `idle` entre deux événements SSE via le tick
// partagé de useNow(), et le libellé accessible affiche l'ancienneté (« inactif depuis N
// min »), jamais « échoué » (cf. CLAUDE.md). `waitingFor` n'a de sens que pour `status ===
// 'waiting'` (statut de session uniquement, cf. `SessionSummary.waitingFor`) : absent, le
// libellé retombe sur « en attente de réponse » (cf. `statusLabel`, useNow.ts).
const props = defineProps<{
  status: AgentStatus
  lastActivity?: string | null
  waitingFor?: 'question' | 'permission' | null
}>()

const { now } = useNow()

const liveStatus = computed(() => deriveStatus(props.status, props.lastActivity, now.value))
const label = computed(() => statusLabel(liveStatus.value, props.lastActivity, now.value, props.waitingFor))

// Mapping statut du contrat C1 (cf. tailwind.config.js) : running cyan + pulsation
// (`animate-jpulse`), idle ambre + clignotement discret (`animate-jblink`), done vert sans
// animation, waiting rouge (`hud-red`) + pulsation comme running — la session attend une
// action de l'utilisateur, elle doit se remarquer autant qu'une session active.
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
  <!-- L'information ne passe pas uniquement par la couleur : title (survol souris) et
       aria-label (lecteur d'écran) portent le même libellé texte que la couleur illustre. -->
  <span
    class="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
    :class="dotClass"
    role="img"
    :title="label"
    :aria-label="label"
  ></span>
</template>
