<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useDashboard } from '../composables/useDashboard'
import { deriveStatus, statusLabel, useNow } from '../composables/useNow'
import { computeSessionLanes, formatAgentTypeLabel } from '../composables/useTimeline'
import type { AgentNode, AgentStatus } from '../../../shared/types'
import Breadcrumb from '../components/Breadcrumb.vue'
import ActivityDot from '../components/ActivityDot.vue'
import TokenCells from '../components/TokenCells.vue'
import ExecutionLanes from '../components/ExecutionLanes.vue'
import OrchestratorExchanges from '../components/OrchestratorExchanges.vue'
import AgentConsumption from '../components/AgentConsumption.vue'
import AgentDetail from '../components/AgentDetail.vue'

// Page de détail d'une session (contrat C4, ex-tiroir SessionDrawer.vue) : plein écran, rendue
// par App.vue à la place de l'écran courant sous `v-if="currentSession"`. Sans props — lit
// tout son état depuis `useDashboard()`, exactement comme les autres vues. Le `v-if` interne
// ci-dessous reste un filet de sécurité pour l'instant où `currentSession` repasse à `null`
// (fermeture) avant que le parent ne démonte ce composant.
const {
  currentSession,
  currentProject,
  projects,
  sessionOrigin,
  sessionAgents,
  sessionDetailLoading,
  sessionDetailError,
  selectedAgent,
  sessionToolCalls,
  closeSession,
  closeProject,
  openProject,
  selectAgent,
  closeAgentDetail,
} = useDashboard()

const { now } = useNow()

// Le nom du projet vient toujours de `projects` (chargé indépendamment de la navigation),
// jamais de `currentProject` : cette page reste correcte que la session ait été ouverte depuis
// l'accueil (aucun projet ouvert, `currentProject` à `null`) ou depuis l'écran d'un projet.
const projectOfSession = computed(() => {
  const session = currentSession.value
  if (!session) return null
  return projects.value.find((project) => project.id === session.projectId) ?? null
})
const projectName = computed(() => projectOfSession.value?.name ?? currentSession.value?.projectId ?? '')

// Retour « intelligent » (bouton ← Retour du bandeau, touche Échap) : ramène exactement à
// l'écran d'où l'on venait, mémorisé par `sessionOrigin` au moment de l'ouverture
// (cf. useDashboard.ts). Depuis l'écran projet, `currentProject` est resté renseigné pendant
// toute la consultation : `closeSession` seule suffit à le faire réapparaître. Depuis l'accueil,
// `currentProject` est resté `null` tout du long ; `closeProject` (qui inclut `closeSession`)
// referme proprement les deux à la fois, par sécurité si un état incohérent apparaissait.
function goBack(): void {
  if (sessionOrigin.value === 'project') {
    closeSession()
  } else {
    closeProject()
  }
}

// Segment racine du fil d'Ariane (« Centre de commande ») : contrairement à `goBack`, ramène
// toujours à l'accueil, quel que soit `sessionOrigin` — un fil d'Ariane saute à la racine, il
// ne fait pas un pas en arrière.
function goHome(): void {
  closeProject()
}

// Segment « nom du projet » du fil d'Ariane : ouvre l'écran du projet de cette session. Si ce
// projet est déjà ouvert derrière (origine « project »), un simple `closeSession` suffit à le
// faire réapparaître sans le recharger ; sinon `openProject` l'ouvre (et referme la session).
function goToProject(): void {
  const project = projectOfSession.value
  if (project && currentProject.value?.id !== project.id) {
    openProject(project)
    return
  }
  closeSession()
}

// Un seul axe pour toute la session (cf. useTimeline.ts) : sert à la fois au Gantt
// (ExecutionLanes) et aux KPI dérivés ci-dessous (nombre d'agents, agent courant), pour ne
// jamais reparcourir l'arbre d'agents deux fois avec deux logiques différentes.
const sessionLanes = computed(() => {
  const session = currentSession.value
  if (!session) return null
  return computeSessionLanes(sessionAgents.value, session.startedAt, session.lastActivity, now.value, { anchor: 'active' })
})

const allBars = computed(() => sessionLanes.value?.lanes.flatMap((lane) => lane.bars) ?? [])
const totalAgentCount = computed(() => allBars.value.length)
const runningAgentCount = computed(() => allBars.value.filter((bar) => bar.status === 'running').length)

function startMsOf(agent: AgentNode): number {
  const ms = new Date(agent.startedAt).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

// « Agent courant » du sous-titre : l'agent `running` démarré le plus récemment, ou à défaut
// le dernier agent délégué (toutes profondeurs confondues) — l'arbre n'a pas de champ dédié
// pour ça, c'est la meilleure approximation dérivable de l'état déjà chargé.
const currentAgent = computed<AgentNode | null>(() => {
  const running = allBars.value.filter((bar) => bar.status === 'running')
  const pool = running.length > 0 ? running : allBars.value
  if (pool.length === 0) return null
  return pool.reduce((latest, bar) => (startMsOf(bar.agent) > startMsOf(latest.agent) ? bar : latest)).agent
})

const subtitle = computed(() => {
  const agent = currentAgent.value
  if (!agent) return ''
  return `${formatAgentTypeLabel(agent.agentType)} — ${agent.description || agent.agentType}`
})

const sessionStatus = computed(() =>
  currentSession.value
    ? deriveStatus(currentSession.value.status, currentSession.value.lastActivity, now.value)
    : 'idle',
)
const sessionStatusText = computed(() =>
  currentSession.value
    ? statusLabel(sessionStatus.value, currentSession.value.lastActivity, now.value, currentSession.value.waitingFor)
    : '',
)

type StatusVisual = { badgeBorderClass: string; badgeBgClass: string; textClass: string }

// Même palette du contrat C1 que SessionCard.vue (running cyan, idle amber, done green, waiting
// rouge/hud-red) : le badge de statut du bandeau et la cellule KPI « État » partagent ces
// classes plutôt que deux logiques dupliquées. `waiting` ajouté pour que `AgentStatus` (qui
// gagne ce 4e statut, T1) reste couvert ici — cf. sous-tâche T2, hors périmètre direct de cette
// vue mais nécessaire pour que `Record<AgentStatus, ...>` compile.
const STATUS_VISUALS: Record<AgentStatus, StatusVisual> = {
  running: { badgeBorderClass: 'border-hud-cyan/60', badgeBgClass: 'bg-hud-cyan/10', textClass: 'text-hud-cyan' },
  idle: { badgeBorderClass: 'border-hud-amber/60', badgeBgClass: 'bg-hud-amber/10', textClass: 'text-hud-amber' },
  done: { badgeBorderClass: 'border-hud-green/50', badgeBgClass: 'bg-hud-green/10', textClass: 'text-hud-green' },
  waiting: { badgeBorderClass: 'border-hud-red/60', badgeBgClass: 'bg-hud-red/10', textClass: 'text-hud-red' },
}

const statusVisual = computed(() => STATUS_VISUALS[sessionStatus.value])

// Échap en deux temps : un agent sélectionné (détail affiché) se ferme d'abord tout seul,
// laissant la page ouverte ; c'est seulement un second Échap, sans agent sélectionné, qui
// revient en arrière. AgentDetail.vue ne pose plus son propre écouteur Échap (seul consommateur
// actuel de ce composant) : cette page est donc la seule source de vérité pour la touche.
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (selectedAgent.value) {
    closeAgentDetail()
    return
  }
  goBack()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

// Trois onglets (contrat de mise en page ST2) : sélectionner un agent depuis Chronologie ou
// Échanges bascule automatiquement sur l'onglet Agents avec cet agent sélectionné
// (`focusAgent`, utilisé à la place de `selectAgent` seul comme gestionnaire `@select`).
// L'onglet actif est un état purement local à la page — jamais dans useDashboard.ts, il ne
// concerne que cet écran — réinitialisé à l'ouverture d'une autre session par le remontage
// naturel de ce composant (App.vue démonte SessionView entre deux sessions, `closeSession`
// étant systématiquement appelé avant toute réouverture).
type TabId = 'timeline' | 'exchanges' | 'agents'
const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'timeline', label: 'Chronologie' },
  { id: 'exchanges', label: 'Échanges' },
  { id: 'agents', label: 'Agents' },
]
const TAB_IDS = TABS.map((tab) => tab.id)

const activeTab = ref<TabId>('timeline')
const tabButtonRefs = ref<Array<HTMLButtonElement | null>>([])

function setTabRef(el: Element | null, index: number): void {
  tabButtonRefs.value[index] = el as HTMLButtonElement | null
}

function focusAgent(agent: AgentNode): void {
  selectAgent(agent)
  activeTab.value = 'agents'
}

// Navigation clavier ←/→ du tablist (rôles ARIA tablist/tab/tabpanel) : tabindex roulant, le
// focus suit l'onglet devenu actif plutôt que de rester sur le bouton quitté.
function onTablistKeydown(event: KeyboardEvent): void {
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
  event.preventDefault()
  const currentIndex = TAB_IDS.indexOf(activeTab.value)
  const delta = event.key === 'ArrowRight' ? 1 : -1
  const nextIndex = (currentIndex + delta + TAB_IDS.length) % TAB_IDS.length
  activeTab.value = TAB_IDS[nextIndex]
  void nextTick(() => tabButtonRefs.value[nextIndex]?.focus())
}
</script>

<template>
  <section v-if="currentSession" aria-label="Détail de la session">
    <div class="sticky top-0 z-10 mb-6 hud-panel border-b border-hud-line-strong p-5">
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="hud-btn shrink-0 border border-hud-cyan/40 bg-hud-cyan/10 text-hud-cyan-soft transition-colors hover:bg-hud-cyan/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-hud-cyan"
          @click="goBack"
        >
          ← Retour
        </button>
        <Breadcrumb
          root-label="Centre de commande"
          :project-name="projectName"
          :session-label="currentSession.label"
          @back="goHome"
          @to-project="goToProject"
        />
      </div>

      <div class="mt-3 flex flex-wrap items-start justify-between gap-4 border-t border-hud-line pt-3">
        <div class="min-w-0">
          <p class="font-mono text-[10px] tracking-[0.24em] text-hud-muted">{{ projectName }} · ORCHESTRATION</p>
          <h1 class="mt-1 truncate font-display text-2xl font-bold tracking-[0.03em] text-hud-text-strong">
            {{ currentSession.label }}
          </h1>
          <p v-if="subtitle" class="mt-1 text-sm text-hud-soft">{{ subtitle }}</p>
        </div>
        <div
          class="flex shrink-0 items-center gap-1.5 border px-2 py-1"
          :class="[statusVisual.badgeBorderClass, statusVisual.badgeBgClass]"
        >
          <ActivityDot
            :status="sessionStatus"
            :last-activity="currentSession.lastActivity"
            :waiting-for="currentSession.waitingFor"
          />
          <span
            class="whitespace-nowrap font-mono text-[10px] uppercase tracking-wider"
            :class="statusVisual.textClass"
          >
            {{ sessionStatusText }}
          </span>
        </div>
      </div>

      <div v-if="!sessionDetailLoading && !sessionDetailError" class="mt-4 grid grid-cols-5 gap-px bg-hud-line/20">
        <div class="bg-hud-bg px-3 py-2.5">
          <div class="hud-label">État</div>
          <div class="mt-0.5 truncate font-display text-base font-semibold" :class="statusVisual.textClass">
            {{ sessionStatusText }}
          </div>
        </div>
        <div class="bg-hud-bg px-3 py-2.5">
          <div class="hud-label">Agents</div>
          <div class="mt-0.5 font-mono text-base font-semibold tabular-nums text-hud-text-strong">
            {{ totalAgentCount }}, dont {{ runningAgentCount }} en cours
          </div>
        </div>
        <div class="col-span-2 bg-hud-bg px-3 py-2.5">
          <div class="hud-label">Tokens</div>
          <div class="mt-0.5">
            <TokenCells :usage="currentSession.totalUsage" />
          </div>
        </div>
        <div class="bg-hud-bg px-3 py-2.5">
          <div class="hud-label">Appels outils</div>
          <div class="mt-0.5 font-mono text-base font-semibold tabular-nums text-hud-text-strong">
            {{ sessionToolCalls }}
          </div>
        </div>
      </div>
    </div>

    <div v-if="sessionDetailLoading" class="py-16 text-center font-mono text-xs uppercase tracking-[0.15em] text-hud-muted" aria-live="polite">
      chargement…
    </div>

    <div v-else-if="sessionDetailError" class="border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-300" role="alert">
      {{ sessionDetailError }}
    </div>

    <template v-else>
      <div
        role="tablist"
        aria-label="Sections de la session"
        class="mb-4 flex flex-wrap items-center gap-1.5"
        @keydown="onTablistKeydown"
      >
        <button
          v-for="(tab, index) in TABS"
          :key="tab.id"
          :ref="(el) => setTabRef(el as Element | null, index)"
          type="button"
          role="tab"
          :id="`session-tab-${tab.id}`"
          :aria-selected="activeTab === tab.id"
          :aria-controls="`session-panel-${tab.id}`"
          :tabindex="activeTab === tab.id ? 0 : -1"
          class="hud-btn uppercase transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-hud-cyan"
          :class="
            activeTab === tab.id
              ? 'border border-hud-cyan/60 bg-hud-cyan/[0.14] text-hud-cyan-soft'
              : 'border border-hud-line text-hud-grey hover:border-hud-cyan/40 hover:text-hud-text'
          "
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <div
        v-show="activeTab === 'timeline'"
        id="session-panel-timeline"
        role="tabpanel"
        aria-labelledby="session-tab-timeline"
      >
        <ExecutionLanes
          v-if="sessionLanes"
          :lanes="sessionLanes"
          :selected-id="selectedAgent?.id ?? null"
          @select="focusAgent"
        />
      </div>

      <div
        v-show="activeTab === 'exchanges'"
        id="session-panel-exchanges"
        role="tabpanel"
        aria-labelledby="session-tab-exchanges"
      >
        <OrchestratorExchanges :agents="sessionAgents" :now="now" @select="focusAgent" />
      </div>

      <div
        v-show="activeTab === 'agents'"
        id="session-panel-agents"
        role="tabpanel"
        aria-labelledby="session-tab-agents"
        class="grid grid-cols-1 gap-5 md:grid-cols-3"
      >
        <div class="md:col-span-1">
          <h2 class="hud-label mb-2">Consommation par agent</h2>
          <AgentConsumption :agents="sessionAgents" :selected-id="selectedAgent?.id ?? null" @select="selectAgent" />
        </div>
        <div class="md:col-span-2">
          <h2 class="hud-label mb-2">Détail de l'agent</h2>
          <AgentDetail v-if="selectedAgent" :agent="selectedAgent" @close="closeAgentDetail" />
          <p
            v-else
            class="border border-hud-line bg-hud-bg/70 p-8 text-center font-mono text-xs uppercase tracking-[0.15em] text-hud-muted"
          >
            Sélectionnez un agent depuis Chronologie ou Échanges pour afficher son détail.
          </p>
        </div>
      </div>
    </template>
  </section>
</template>
