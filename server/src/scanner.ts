import { EventEmitter } from 'node:events'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PROJECTS_ROOT, SCAN_INTERVAL_MS } from './config'
import { readJsonlCached } from './cache'

/**
 * Détection périodique de changement sous `PROJECTS_ROOT`, au service du flux SSE
 * (`stream.ts`). Ne duplique pas le cache de `cache.ts` : chaque tick relit le `mtime` de
 * chaque transcript via `readJsonlCached`, qui ne reparse que si ce `mtime` a bougé (sinon
 * simple lecture en mémoire). Ce module se contente de comparer les `mtime` obtenus d'un tick à
 * l'autre pour savoir si « quelque chose a changé », sans second mécanisme d'invalidation ; le
 * tick qui détecte un changement a, en prime, déjà réchauffé le cache pour les agrégats qui
 * seront recalculés juste après par `stream.ts`.
 */

/** chemin de fichier → mtime au dernier tick. */
type Signature = Map<string, number>

const emitter = new EventEmitter()
let lastSignature: Signature = new Map()
let started = false

/** Démarre le minuteur de scan (idempotent) : un seul par processus, partagé par toutes les
 *  connexions SSE, quel que soit leur nombre. */
export function startScanner(): void {
  if (started) return
  started = true

  // Amorce la signature de référence sans notifier : le premier tick ne doit pas déclencher un
  // `change` juste parce qu'il part d'une signature vide.
  lastSignature = computeSignature()

  setInterval(() => {
    const nextSignature = computeSignature()
    if (signaturesDiffer(lastSignature, nextSignature)) {
      lastSignature = nextSignature
      emitter.emit('change')
    }
  }, SCAN_INTERVAL_MS)
}

/** S'abonne aux changements détectés par le scan ; renvoie la fonction de désabonnement à
 *  appeler à la fermeture de la connexion (`req.on('close', ...)` côté `stream.ts`). */
export function onScanChange(listener: () => void): () => void {
  emitter.on('change', listener)
  return () => emitter.off('change', listener)
}

function computeSignature(): Signature {
  const signature: Signature = new Map()

  for (const projectDir of listEntries(PROJECTS_ROOT, (entry) => entry.isDirectory())) {
    const projectPath = join(PROJECTS_ROOT, projectDir)

    for (const sessionFileName of listEntries(
      projectPath,
      (entry) => entry.isFile() && entry.name.endsWith('.jsonl'),
    )) {
      const sessionFilePath = join(projectPath, sessionFileName)
      signature.set(sessionFilePath, readJsonlCached(sessionFilePath).mtimeMs)

      const sessionId = sessionFileName.slice(0, -'.jsonl'.length)
      const subagentsDir = join(projectPath, sessionId, 'subagents')

      for (const agentFileName of listEntries(
        subagentsDir,
        (entry) => entry.isFile() && entry.name.endsWith('.jsonl'),
      )) {
        const agentFilePath = join(subagentsDir, agentFileName)
        signature.set(agentFilePath, readJsonlCached(agentFilePath).mtimeMs)
      }
    }
  }

  return signature
}

function signaturesDiffer(a: Signature, b: Signature): boolean {
  if (a.size !== b.size) return true
  for (const [filePath, mtimeMs] of a) {
    if (b.get(filePath) !== mtimeMs) return true
  }
  return false
}

function listEntries(
  dirPath: string,
  keep: (entry: { isDirectory(): boolean; isFile(): boolean; name: string }) => boolean,
): string[] {
  try {
    return readdirSync(dirPath, { withFileTypes: true })
      .filter(keep)
      .map((entry) => entry.name)
  } catch {
    // Dossier absent ou illisible (ex. session concurrente en cours de création) : pas d'entrée.
    return []
  }
}
