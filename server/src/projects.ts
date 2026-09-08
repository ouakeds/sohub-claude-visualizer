import { readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { AgentStatus, ProjectSummary, TokenUsage, Window } from '../../shared/types'
import { PROJECTS_ROOT, WINDOW_DURATIONS_MS } from './config'
import { readJsonlCached } from './cache'
import { addUsage, emptyUsage } from './usage'
import type { ParsedLine } from './parser'
import { listSessionSummaries } from './sessions'

/**
 * Construit la liste des `ProjectSummary` pour la fenêtre demandée, en se déduisant des
 * `SessionSummary` de `listSessionSummaries` : un dossier sans aucun transcript n'apparaît
 * jamais, un dossier sans session dans la fenêtre est omis pour cette réponse-là.
 * `~/.claude/projects` absent ou vide donne `[]`, jamais une erreur.
 */
export function listProjectSummaries(window: Window): ProjectSummary[] {
  const windowMs = window === 'all' ? null : WINDOW_DURATIONS_MS[window]
  const now = Date.now()

  const summaries: ProjectSummary[] = []

  for (const dirName of listProjectDirs()) {
    const projectPath = join(PROJECTS_ROOT, dirName)

    // Toutes les sessions, fenêtre ou pas : sert à détecter l'absence totale de transcript et à
    // retrouver le `cwd`, qui ne fait pas partie de `SessionSummary`.
    const allSessions = listSessionSummaries(projectPath, dirName, 'all')
    if (allSessions.length === 0) continue // aucun transcript : jamais retourné

    const projectPathValue = findProjectCwd(
      projectPath,
      allSessions.map((session) => session.id),
    )
    if (!projectPathValue) continue // cwd introuvable dans tous les transcripts du projet

    const sessionsInWindow =
      windowMs === null
        ? allSessions
        : allSessions.filter((session) => now - Date.parse(session.lastActivity) < windowMs)
    if (sessionsInWindow.length === 0) continue // pas de session dans cette fenêtre : omis, pas exclu

    let usage: TokenUsage = emptyUsage()
    let lastActivityMs = -Infinity
    let lastActivityIso = sessionsInWindow[0].lastActivity
    let mostRecentStatus: AgentStatus = sessionsInWindow[0].status
    let runningSessionCount = 0
    for (const session of sessionsInWindow) {
      usage = addUsage(usage, session.totalUsage)
      // `waiting` compte comme actif au même titre que `running` : une session qui attend une
      // réponse (question ou permission) n'est pas une session arrêtée.
      if (session.status === 'running' || session.status === 'waiting') runningSessionCount++
      const ms = Date.parse(session.lastActivity)
      if (ms > lastActivityMs) {
        lastActivityMs = ms
        lastActivityIso = session.lastActivity
        mostRecentStatus = session.status
      }
    }

    // Agrégat de statut au niveau projet, réutilisant le statut déjà résolu par session
    // (`buildSessionSummary`) : `running` prime dès qu'une session `running` ou `waiting` existe,
    // sinon on retombe sur la fraîcheur de la session la plus récente.
    const status: AgentStatus = runningSessionCount > 0 ? 'running' : mostRecentStatus

    // `skippedLines` cumule tout le projet, fenêtre ou pas — comportement déjà observable avant
    // cette refactorisation, conservé à l'identique.
    const skippedLines = allSessions.reduce((sum, session) => sum + session.skippedLines, 0)

    summaries.push({
      id: dirName,
      path: projectPathValue,
      name: basename(projectPathValue),
      sessionCount: sessionsInWindow.length,
      usage,
      lastActivity: lastActivityIso,
      skippedLines,
      status,
      runningSessionCount,
    })
  }

  summaries.sort((a, b) => Date.parse(b.lastActivity) - Date.parse(a.lastActivity))
  return summaries
}

/** `true` si `projectId` est un dossier existant sous `PROJECTS_ROOT`, même sans transcript —
 *  distingue un projet inconnu (404) d'un projet simplement sans session. */
export function projectDirExists(projectId: string): boolean {
  try {
    return statSync(join(PROJECTS_ROOT, projectId)).isDirectory()
  } catch {
    return false
  }
}

/** Cherche le `cwd` dans n'importe quel transcript du projet (session ou sous-agents), dans
 *  l'ordre des sessions fourni ; `null` si introuvable partout. */
function findProjectCwd(projectPath: string, sessionIds: string[]): string | null {
  for (const sessionId of sessionIds) {
    const cwd = readSessionCwd(projectPath, sessionId)
    if (cwd) return cwd
  }
  return null
}

function readSessionCwd(projectPath: string, sessionId: string): string | null {
  const { lines } = readJsonlCached(join(projectPath, `${sessionId}.jsonl`))
  for (const line of lines) {
    const cwd = readCwd(line)
    if (cwd) return cwd
  }

  const subagentsDir = join(projectPath, sessionId, 'subagents')
  for (const agentFile of listJsonlFiles(subagentsDir)) {
    const { lines: agentLines } = readJsonlCached(join(subagentsDir, agentFile))
    for (const line of agentLines) {
      const cwd = readCwd(line)
      if (cwd) return cwd
    }
  }
  return null
}

function readCwd(line: ParsedLine): string | null {
  return typeof line.cwd === 'string' && line.cwd.length > 0 ? line.cwd : null
}

function listProjectDirs(): string[] {
  return listDirEntries(PROJECTS_ROOT, (entry) => entry.isDirectory())
}

function listJsonlFiles(dirPath: string): string[] {
  return listDirEntries(dirPath, (entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
}

function listDirEntries(
  dirPath: string,
  keep: (entry: { isDirectory(): boolean; isFile(): boolean; name: string }) => boolean,
): string[] {
  try {
    return readdirSync(dirPath, { withFileTypes: true })
      .filter(keep)
      .map((entry) => entry.name)
  } catch {
    // Dossier absent (ex. `~/.claude/projects` inexistant) ou illisible : pas d'entrée.
    return []
  }
}
