import { Router } from 'express'
import { join } from 'node:path'
import { parseWindow, PROJECTS_ROOT } from './config'
import { listProjectSummaries, projectDirExists } from './projects'
import { getSessionDetail, listLiveSessions, listSessionSummaries, sessionFileExists } from './sessions'
import { handleStream } from './stream'
import type { LiveProject } from '../../shared/types'

export const apiRouter = Router()

// GET /api/stream?window=<Window> → flux SSE (D7) : `snapshot` à la connexion, puis un
// événement par agrégat modifié au rythme du scan, plus un `heartbeat`. Voir stream.ts.
apiRouter.get('/stream', handleStream)

// GET /api/projects?window=<Window> → ProjectSummary[], décroissant par lastActivity.
apiRouter.get('/projects', (req, res) => {
  const window = parseWindow(req.query.window)
  res.json(listProjectSummaries(window))
})

// GET /api/live?window=<Window> → LiveProject[], un élément par projet dont au moins une
// session est vivante (status !== 'done' dans la fenêtre), chacune avec son arbre d'agents.
apiRouter.get('/live', (req, res) => {
  const window = parseWindow(req.query.window)

  const liveProjects: LiveProject[] = []
  for (const project of listProjectSummaries(window)) {
    const projectPath = join(PROJECTS_ROOT, project.id)
    const sessions = listLiveSessions(projectPath, project.id, window)
    if (sessions.length > 0) liveProjects.push({ projectId: project.id, sessions })
  }

  res.json(liveProjects)
})

// GET /api/projects/:projectId/sessions?window=<Window> → SessionSummary[], décroissant par
// startedAt. `projectId` inconnu (dossier absent sous PROJECTS_ROOT) → 404.
apiRouter.get('/projects/:projectId/sessions', (req, res) => {
  const { projectId } = req.params

  if (!projectDirExists(projectId)) {
    res.status(404).json({ error: 'unknown_project' })
    return
  }

  const window = parseWindow(req.query.window)
  const projectPath = join(PROJECTS_ROOT, projectId)
  res.json(listSessionSummaries(projectPath, projectId, window))
})

// GET /api/projects/:projectId/sessions/:sessionId → SessionDetail (résumé + arbre des agents,
// racines). `projectId` inconnu → 404 `unknown_project` ; `sessionId` inconnu (fichier `.jsonl`
// absent sous le projet) → 404 `unknown_session`.
apiRouter.get('/projects/:projectId/sessions/:sessionId', (req, res) => {
  const { projectId, sessionId } = req.params

  if (!projectDirExists(projectId)) {
    res.status(404).json({ error: 'unknown_project' })
    return
  }

  const projectPath = join(PROJECTS_ROOT, projectId)

  if (!sessionFileExists(projectPath, sessionId)) {
    res.status(404).json({ error: 'unknown_session' })
    return
  }

  res.json(getSessionDetail(projectPath, projectId, sessionId))
})
