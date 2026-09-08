import { computed, ref } from 'vue'
import type {
  AgentNode,
  AgentStatus,
  LiveProject,
  ProjectSummary,
  SessionDetail,
  SessionSummary,
  StreamEvent,
  Window,
} from '../../../shared/types'
import { deriveStatus, useNow } from './useNow'

// État partagé, module-scope : pas de Pinia, ce composable fait office de petit store
// pour toute la vue tableau de bord (fenêtre courante, projets, chargement, erreur).
//
// Navigation : ni routeur ni store dédié. La vue courante se lit sur `currentProject` et
// `currentSession` : les deux à `null` -> accueil, `currentProject` seul -> écran du projet,
// `currentSession` renseigné -> écran plein de la session (SessionView.vue, arbre des agents),
// affiché à la place de l'écran courant tant qu'il est ouvert — `currentProject` n'est jamais
// effacé pour autant, cf. `sessionOrigin` ci-dessous.
//
// `currentScreen` distingue les deux écrans d'accueil possibles (Centre de commande / liste
// complète des projets), indépendamment de `currentProject` : ouvrir un projet ne change
// jamais `currentScreen`, si bien que `closeProject` retrouve naturellement l'écran d'origine
// sans avoir besoin de le mémoriser à part.
const currentScreen = ref<'command' | 'projects'>('command')

const currentWindow = ref<Window>('7d')
const projects = ref<ProjectSummary[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

// Portée de la grille d'accueil : « actifs seulement » par défaut (panel live), « tous » pour
// retrouver l'historique complet. Orthogonal à `currentWindow` (fenêtre temporelle) : les deux
// se combinent sans se recouvrir, cf. ScopeToggle/WindowSelector.
const scope = ref<'active' | 'all'>('active')

// Sessions vivantes de tous les projets affichés à l'accueil (cf. ProjectsView.vue), pas
// seulement du projet ouvert : à la différence de `sessions` (peuplé au drill-down via
// `openProject`/`fetchSessions`), cet état vit indépendamment de toute navigation. Clé =
// `ProjectSummary.id`, valeur = ses sessions vivantes triées `lastActivity` décroissante
// (contrat T1, `GET /api/live`) ; une entrée absente équivaut à « aucune session vivante ».
const liveSessions = ref<Record<string, SessionDetail[]>>({})

// Statut de la connexion SSE (cf. connectStream) : purement informatif pour l'écran
// (indicateur « live » du Centre de commande), jamais utilisé pour décider quand recharger —
// EventSource gère seule sa reconnexion.
const streamConnected = ref(false)

// Filtres du tableau de bord live, orthogonaux à `scope`/`currentWindow` : ils ne touchent
// que la grille de sessions vivantes (`visibleLiveSessions`), jamais `visibleProjects`. Défaut
// à 'running' plutôt que 'all' : la grille d'accueil ne montre que les sessions actives par
// défaut, les inactives restant consultables via le bloc « Sessions inactives » de
// CommandSidebar.vue (qui lit `allLiveSessions`, non filtré) ou via ce même filtre mis sur
// 'idle'/'all' (boutons de FilterBar.vue, `setStatusFilter`).
const statusFilter = ref<'all' | 'running' | 'idle'>('running')
const projectFilter = ref<string | null>(null)

const currentProject = ref<ProjectSummary | null>(null)
const sessions = ref<SessionSummary[]>([])
const sessionsLoading = ref(false)
const sessionsError = ref<string | null>(null)

const currentSession = ref<SessionSummary | null>(null)
const sessionAgents = ref<AgentNode[]>([])
const sessionDetailLoading = ref(false)
const sessionDetailError = ref<string | null>(null)
const selectedAgent = ref<AgentNode | null>(null)

// Écran d'origine de la session ouverte (page dédiée SessionView.vue, ex-tiroir) : renseigné
// par `openSession`/`openSessionInProject` au moment de l'ouverture, à partir de la présence
// de `currentProject` à cet instant précis — `'project'` si un projet était déjà ouvert derrière
// (ProjectView), `'command'` sinon (accueil Centre de commande). Sert uniquement à décider où
// ramène le retour « intelligent » (bouton Retour / Échap de SessionView, cf. `closeSession`
// n'y touche pas lui-même) : le segment racine du fil d'Ariane, lui, ramène toujours à
// l'accueil quel que soit `sessionOrigin` (cf. SessionView.vue).
const sessionOrigin = ref<'command' | 'project'>('command')

let initialized = false
let eventSource: EventSource | null = null

async function fetchProjects(): Promise<void> {
  loading.value = true
  error.value = null

  try {
    const response = await fetch(`/api/projects?window=${currentWindow.value}`)
    if (!response.ok) {
      throw new Error(`L'API a répondu ${response.status}`)
    }
    projects.value = (await response.json()) as ProjectSummary[]
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Erreur réseau inconnue'
    projects.value = []
  } finally {
    loading.value = false
  }
}

// Remplace l'état entier plutôt que de fusionner : contrairement à `fetchProjects`/
// `mergeProjects`, le serveur renvoie ici la liste complète et à jour de tous les projets
// ayant au moins une session vivante (les autres en sont simplement absents). Erreur réseau
// avalée sans exposer de bandeau d'erreur dédié : ces cartes sont un complément de l'accueil,
// pas une vue principale dont l'échec doit bloquer l'affichage.
async function fetchLive(): Promise<void> {
  try {
    const response = await fetch(`/api/live?window=${currentWindow.value}`)
    if (!response.ok) {
      throw new Error(`L'API a répondu ${response.status}`)
    }
    const live = (await response.json()) as LiveProject[]
    liveSessions.value = Object.fromEntries(live.map((project) => [project.projectId, project.sessions]))
  } catch {
    liveSessions.value = {}
  }
}

async function fetchSessions(): Promise<void> {
  const project = currentProject.value
  if (!project) return

  sessionsLoading.value = true
  sessionsError.value = null

  try {
    const response = await fetch(
      `/api/projects/${encodeURIComponent(project.id)}/sessions?window=${currentWindow.value}`,
    )
    if (!response.ok) {
      throw new Error(`L'API a répondu ${response.status}`)
    }
    sessions.value = (await response.json()) as SessionSummary[]
  } catch (err) {
    sessionsError.value = err instanceof Error ? err.message : 'Erreur réseau inconnue'
    sessions.value = []
  } finally {
    sessionsLoading.value = false
  }
}

// GET /api/projects/:projectId/sessions/:sessionId -> SessionDetail. `sessionId` inconnu
// -> 404 { error: 'unknown_session' }, traduit en message lisible. Chargé par
// `session.projectId`, jamais par `currentProject` : la page de session peut être ouverte
// depuis l'accueil, où aucun projet n'est encore ouvert (cf. `openSession`/`openSessionInProject`).
async function fetchSessionDetail(): Promise<void> {
  const session = currentSession.value
  if (!session) return

  sessionDetailLoading.value = true
  sessionDetailError.value = null

  try {
    const response = await fetch(
      `/api/projects/${encodeURIComponent(session.projectId)}/sessions/${encodeURIComponent(session.id)}`,
    )
    if (!response.ok) {
      throw new Error(
        response.status === 404 ? 'Session introuvable.' : `L'API a répondu ${response.status}`,
      )
    }
    const detail = (await response.json()) as SessionDetail
    sessionAgents.value = detail.agents
  } catch (err) {
    sessionDetailError.value = err instanceof Error ? err.message : 'Erreur réseau inconnue'
    sessionAgents.value = []
  } finally {
    sessionDetailLoading.value = false
  }
}

// Fusionne par `id` sans réordonner ni écraser les projets non concernés : le serveur
// n'envoie que les projets dont l'agrégat a réellement changé.
function mergeProjects(updated: ProjectSummary[]): void {
  const byId = new Map(projects.value.map((project) => [project.id, project]))
  for (const project of updated) {
    byId.set(project.id, project)
  }
  projects.value = Array.from(byId.values())

  if (currentProject.value) {
    const refreshed = updated.find((project) => project.id === currentProject.value?.id)
    if (refreshed) currentProject.value = refreshed
  }
}

function findAgentById(nodes: AgentNode[], id: string): AgentNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findAgentById(node.children, id)
    if (found) return found
  }
  return null
}

function applySessionUpdate(detail: SessionDetail): void {
  const { agents, ...summary } = detail
  currentSession.value = summary
  sessionAgents.value = agents
  if (selectedAgent.value) {
    selectedAgent.value = findAgentById(agents, selectedAgent.value.id) ?? selectedAgent.value
  }
}

// Discrimine sur `.type` et ne rafraîchit que la vue affichée : un événement `sessions`
// d'un autre projet ou `session` d'une autre session est ignoré silencieusement.
function applyStreamEvent(event: StreamEvent): void {
  switch (event.type) {
    case 'snapshot':
      projects.value = event.projects
      break
    case 'projects':
      mergeProjects(event.projects)
      break
    case 'sessions':
      if (currentProject.value?.id === event.projectId) {
        sessions.value = event.sessions
      }
      break
    case 'session':
      // Comparé à `currentSession.projectId`, jamais à `currentProject` : la page de session
      // peut être ouverte sans qu'aucun projet ne soit ouvert (cf.
      // `openSession`/`openSessionInProject`).
      if (
        currentSession.value?.id === event.session.id &&
        currentSession.value?.projectId === event.session.projectId
      ) {
        applySessionUpdate(event.session)
      }
      break
    case 'live': {
      // Contrairement à `sessions`/`session`, jamais filtré sur le projet ouvert : les
      // cartes de session live vivent pour tous les projets affichés à l'accueil à la fois.
      const next = { ...liveSessions.value }
      if (event.sessions.length === 0) {
        delete next[event.projectId]
      } else {
        next[event.projectId] = event.sessions
      }
      liveSessions.value = next
      break
    }
    case 'heartbeat':
      break
  }
}

// Ouvre (ou rouvre, en fermant l'abonnement précédent) l'EventSource sur /api/stream en
// propageant la fenêtre courante. La reconnexion sur coupure est laissée au comportement
// natif d'EventSource : aucune logique de retry ici. Un flux en échec n'affecte jamais
// l'état déjà affiché, ni ne remonte d'exception.
function connectStream(): void {
  eventSource?.close()
  eventSource = new EventSource(`/api/stream?window=${currentWindow.value}`)

  eventSource.onopen = () => {
    streamConnected.value = true
  }

  eventSource.onmessage = (message) => {
    try {
      applyStreamEvent(JSON.parse(message.data) as StreamEvent)
    } catch {
      // Message malformé : ignoré, l'écran affiché reste tel quel.
    }
  }

  eventSource.onerror = () => {
    // Reconnexion gérée nativement par EventSource ; ne jamais casser l'écran ici, seul
    // l'indicateur de connexion se met à jour.
    streamConnected.value = false
  }
}

function openProjectsScreen(): void {
  currentScreen.value = 'projects'
}

function closeProjectsScreen(): void {
  currentScreen.value = 'command'
}

function openProject(project: ProjectSummary): void {
  currentProject.value = project
  sessions.value = []
  sessionsError.value = null
  closeSession()
  void fetchSessions()
}

function closeProject(): void {
  currentProject.value = null
  sessions.value = []
  sessionsError.value = null
  closeSession()
}

// Ouvre la page de détail d'une session (SessionView.vue) SANS toucher `currentProject` :
// resté tel quel (accueil, ou projet déjà ouvert), il reste affiché derrière tant que la page
// est ouverte et réapparaît naturellement à la fermeture. `sessionOrigin` capture l'écran
// d'origine à cet instant précis, pour que `SessionView` sache où ramener le bouton Retour /
// Échap. Le détail est chargé par `session.projectId` (cf. `fetchSessionDetail`), jamais par
// `currentProject` : ce comportement est donc correct que l'appel vienne de l'accueil (aucun
// projet ouvert) ou de l'écran d'un projet.
function openSession(session: SessionSummary): void {
  sessionOrigin.value = currentProject.value ? 'project' : 'command'
  currentSession.value = session
  sessionAgents.value = []
  sessionDetailError.value = null
  selectedAgent.value = null
  void fetchSessionDetail()
}

function closeSession(): void {
  currentSession.value = null
  sessionAgents.value = []
  sessionDetailError.value = null
  selectedAgent.value = null
}

// Ouvre une session depuis une carte de session live (accueil ou écran projet) : signature à
// deux paramètres conservée pour les appelants existants (SessionCard/ProjectsView), mais
// `project` ne sert plus à naviguer — `openSession` seule porte le comportement d'ouverture
// (page dédiée + `sessionOrigin`), et `currentProject` n'est jamais modifié ici.
function openSessionInProject(_project: ProjectSummary, session: SessionSummary): void {
  openSession(session)
}

function selectAgent(agent: AgentNode): void {
  selectedAgent.value = agent
}

function closeAgentDetail(): void {
  selectedAgent.value = null
}

function setWindow(next: Window): void {
  if (next === currentWindow.value) return
  currentWindow.value = next
  void fetchProjects()
  void fetchLive()
  if (currentProject.value) {
    void fetchSessions()
  }
  connectStream()
}

function setScope(next: 'active' | 'all'): void {
  scope.value = next
}

function setStatusFilter(next: 'all' | 'running' | 'idle'): void {
  statusFilter.value = next
}

function setProjectFilter(next: string | null): void {
  projectFilter.value = next
}

// Aplatit l'arbre d'agents (`children` récursifs) d'une session déjà chargée — même besoin que
// `findAgentById` ci-dessus, pour `sessionToolCalls`.
function flattenAgentNodes(nodes: AgentNode[]): AgentNode[] {
  return nodes.flatMap((node) => [node, ...flattenAgentNodes(node.children)])
}

export function useDashboard() {
  if (!initialized) {
    initialized = true
    void fetchProjects()
    void fetchLive()
    connectStream()
  }

  // Tick partagé (cf. useNow.ts) : ré-évalue la fraîcheur des projets toutes les 15 s pour
  // qu'un projet devenu inactif quitte la grille « actifs » sans attendre un nouvel événement
  // SSE (qui ne pousse que des deltas) ni un rechargement de page.
  const { now } = useNow()

  // Re-dérive `status` côté client contre `lastActivity` avant de filtrer : le champ
  // `status` du serveur peut dater de plusieurs minutes si aucune session du projet n'a émis
  // d'événement depuis.
  const activeProjects = computed(() =>
    projects.value.filter(
      (project) => deriveStatus(project.status, project.lastActivity, now.value) === 'running',
    ),
  )

  const activeProjectCount = computed(() => activeProjects.value.length)

  const visibleProjects = computed(() => (scope.value === 'active' ? activeProjects.value : projects.value))

  // Toutes les sessions vivantes de tous les projets affichés à l'accueil, aplaties avec le
  // `ProjectSummary` de leur projet (nécessaire à l'affichage — nom, chemin — sans faire
  // porter cette jointure à chaque composant consommateur). Un projet présent dans
  // `liveSessions` mais absent de `projects` (fenêtre différente entre les deux appels, cas
  // transitoire) voit ses sessions ignorées plutôt que de planter le tri.
  const allLiveSessions = computed(() => {
    const projectById = new Map(projects.value.map((project) => [project.id, project]))

    const flattened = Object.entries(liveSessions.value).flatMap(([projectId, projectSessions]) => {
      const project = projectById.get(projectId)
      if (!project) return []
      return projectSessions.map((session) => ({ session, project }))
    })

    // Waiting avant idle avant running avant terminé : une session qui attend une réponse ou
    // une permission de l'utilisateur réclame l'attention avant même une session simplement
    // inactive, elle-même avant une session qui tourne encore normalement. À statut égal, la
    // plus récemment active passe devant.
    const statusRank: Record<AgentStatus, number> = { waiting: 0, idle: 1, running: 2, done: 3 }

    return [...flattened].sort((a, b) => {
      const statusA = deriveStatus(a.session.status, a.session.lastActivity, now.value, a.session.hasUserExchange)
      const statusB = deriveStatus(b.session.status, b.session.lastActivity, now.value, b.session.hasUserExchange)
      if (statusRank[statusA] !== statusRank[statusB]) return statusRank[statusA] - statusRank[statusB]
      return new Date(b.session.lastActivity).getTime() - new Date(a.session.lastActivity).getTime()
    })
  })

  // Filtre 'running' de la grille live : une session `waiting` (attend une réponse ou une
  // permission de l'utilisateur) reste une session active — elle compte comme 'running', tout
  // comme le fait déjà `runningSessionCount` côté serveur (cf. `shared/types.ts`,
  // `ProjectSummary.runningSessionCount`). Seul le filtre 'idle' l'exclut explicitement.
  const visibleLiveSessions = computed(() =>
    allLiveSessions.value.filter(({ session, project }) => {
      if (projectFilter.value && project.id !== projectFilter.value) return false
      if (statusFilter.value === 'all') return true
      const status = deriveStatus(session.status, session.lastActivity, now.value, session.hasUserExchange)
      if (statusFilter.value === 'running') return status === 'running' || status === 'waiting'
      return status === statusFilter.value
    }),
  )

  // `done` se déduit plutôt que de se stocker : nombre total de sessions des projets affichés
  // moins celles actuellement vivantes. Borné à 0 pour amortir un instant transitoire où
  // `liveSessions` et `projects` proviennent de deux réponses légèrement désynchronisées.
  // `waiting` est compté dans `running` (même convention que côté serveur, cf. commentaire de
  // `visibleLiveSessions` ci-dessus) : pas de bucket dédié, `FilterBar`/`CommandSidebar` n'ont
  // que trois compteurs (running/idle/done).
  const liveCounts = computed(() => {
    const all = allLiveSessions.value.length
    let running = 0
    let idle = 0
    for (const { session } of allLiveSessions.value) {
      const status = deriveStatus(session.status, session.lastActivity, now.value, session.hasUserExchange)
      if (status === 'running' || status === 'waiting') {
        running += 1
      } else {
        idle += 1
      }
    }
    const totalSessions = projects.value.reduce((sum, project) => sum + project.sessionCount, 0)
    return { all, running, idle, done: Math.max(0, totalSessions - all) }
  })

  // Total des appels d'outils de la session ouverte dans le tiroir, toutes profondeurs
  // confondues : une seule métrique agrégée, jamais détaillée par outil ici (cf. AgentDetail
  // pour le détail par agent).
  const sessionToolCalls = computed(() =>
    flattenAgentNodes(sessionAgents.value).reduce(
      (sum, agent) => sum + agent.tools.reduce((toolSum, tool) => toolSum + tool.count, 0),
      0,
    ),
  )

  return {
    window: currentWindow,
    projects,
    loading,
    error,
    setWindow,
    refresh: fetchProjects,
    streamConnected,

    currentScreen,
    openProjectsScreen,
    closeProjectsScreen,

    scope,
    setScope,
    activeProjects,
    activeProjectCount,
    visibleProjects,

    liveSessions,
    statusFilter,
    setStatusFilter,
    projectFilter,
    setProjectFilter,
    allLiveSessions,
    visibleLiveSessions,
    liveCounts,

    currentProject,
    sessions,
    sessionsLoading,
    sessionsError,
    openProject,
    closeProject,
    refreshSessions: fetchSessions,

    currentSession,
    sessionOrigin,
    sessionAgents,
    sessionDetailLoading,
    sessionDetailError,
    sessionToolCalls,
    openSession,
    closeSession,
    openSessionInProject,
    refreshSessionDetail: fetchSessionDetail,

    selectedAgent,
    selectAgent,
    closeAgentDetail,
  }
}
