import type { Request, Response } from 'express'
import { join } from 'node:path'
import { HEARTBEAT_INTERVAL_MS, PROJECTS_ROOT, parseWindow } from './config'
import { listProjectSummaries } from './projects'
import { getSessionDetail, listLiveSessions, listSessionSummaries } from './sessions'
import { onScanChange, startScanner } from './scanner'
import type { ProjectSummary, SessionSummary, StreamEvent } from '../../shared/types'

/**
 * GET /api/stream?window=<Window> — flux SSE du contrat D7. `window` absent ou invalide retombe
 * sur la fenêtre par défaut (`parseWindow`), jamais une erreur.
 *
 * Un `snapshot` (tous les `ProjectSummary` de la fenêtre) est envoyé dès la connexion. Ensuite,
 * au rythme du scan (`scanner.ts`, ~3 s), seuls les agrégats qui ont réellement changé sont
 * poussés : `projects` (uniquement les projets modifiés), `sessions` (toutes les sessions d'un
 * projet dont au moins une a changé), `session` (détail complet, arbre d'agents inclus, d'une
 * session modifiée) et `live` (sessions vivantes du projet, y compris `sessions: []` quand la
 * liste se vide). Un `heartbeat` toutes les `HEARTBEAT_INTERVAL_MS` maintient la connexion.
 *
 * Aucun état n'est conservé après la déconnexion : les `Map`/tableaux ci-dessous ne vivent que
 * le temps de cette connexion, pour calculer les différences au fil de l'eau. Une reconnexion
 * (le comportement natif d'`EventSource`) ne retrouve jamais cet état : elle reçoit un nouveau
 * `snapshot`, jamais un delta.
 */
export function handleStream(req: Request, res: Response): void {
  const window = parseWindow(req.query.window)

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.flushHeaders()

  startScanner()

  let lastProjects: ProjectSummary[] = listProjectSummaries(window)
  const lastSessionsByProject = new Map<string, SessionSummary[]>()

  sendEvent(res, { type: 'snapshot', projects: lastProjects })

  const pushChanges = (): void => {
    const nextProjects = listProjectSummaries(window)
    const changedProjects = diffByKey(lastProjects, nextProjects, (project) => project.id)
    lastProjects = nextProjects

    if (changedProjects.length > 0) {
      sendEvent(res, { type: 'projects', projects: changedProjects })
    }

    for (const project of changedProjects) {
      const projectPath = join(PROJECTS_ROOT, project.id)
      const previousSessions = lastSessionsByProject.get(project.id) ?? []
      const nextSessions = listSessionSummaries(projectPath, project.id, window)
      lastSessionsByProject.set(project.id, nextSessions)

      const changedSessions = diffByKey(previousSessions, nextSessions, (session) => session.id)
      if (changedSessions.length > 0) {
        sendEvent(res, { type: 'sessions', projectId: project.id, sessions: nextSessions })
      }

      for (const session of changedSessions) {
        sendEvent(res, { type: 'session', session: getSessionDetail(projectPath, project.id, session.id) })
      }

      const liveSessions = listLiveSessions(projectPath, project.id, window)
      sendEvent(res, { type: 'live', projectId: project.id, sessions: liveSessions })
    }
  }

  const unsubscribe = onScanChange(pushChanges)

  const heartbeat = setInterval(() => {
    sendEvent(res, { type: 'heartbeat', at: new Date().toISOString() })
  }, HEARTBEAT_INTERVAL_MS)

  req.on('close', () => {
    unsubscribe()
    clearInterval(heartbeat)
  })
}

/** Écrit un `StreamEvent` en `data:` brut (pas de champ `event:` nommé) : le discriminant
 *  `type` porté par le JSON suffit à router côté client, sur le `onmessage` par défaut
 *  d'`EventSource`. */
function sendEvent(res: Response, event: StreamEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

/** Éléments de `next` absents de `previous`, ou dont la valeur diffère, comparés par clé
 *  (`id`) — sert à ne pousser que ce qui a réellement changé depuis le dernier envoi. */
function diffByKey<T>(previous: T[], next: T[], keyOf: (item: T) => string): T[] {
  const previousByKey = new Map(previous.map((item) => [keyOf(item), item]))
  return next.filter((item) => {
    const before = previousByKey.get(keyOf(item))
    return before === undefined || JSON.stringify(before) !== JSON.stringify(item)
  })
}
