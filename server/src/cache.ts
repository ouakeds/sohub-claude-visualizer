import { statSync } from 'node:fs'
import { parseJsonlFile, type ParsedLine } from './parser'

type CacheEntry = {
  mtimeMs: number
  lines: ParsedLine[]
  skippedLines: number
}

export type CachedJsonl = {
  lines: ParsedLine[]
  skippedLines: number
  /** `mtime` du fichier au moment de la lecture — sert de repli pour `lastActivity`. */
  mtimeMs: number
}

/** Un seul cache mémoire pour tout le processus, jamais persisté sur disque. */
const cache = new Map<string, CacheEntry>()

/**
 * Lit et parse un `.jsonl`, en réutilisant le résultat en mémoire tant que le `mtime` du
 * fichier n'a pas bougé. Un fichier disparu entre le listing du dossier et la lecture (session
 * concurrente encore écrite) est traité comme vide plutôt que de lever.
 */
export function readJsonlCached(filePath: string): CachedJsonl {
  let mtimeMs: number
  try {
    mtimeMs = statSync(filePath).mtimeMs
  } catch {
    cache.delete(filePath)
    return { lines: [], skippedLines: 0, mtimeMs: 0 }
  }

  const cached = cache.get(filePath)
  if (cached && cached.mtimeMs === mtimeMs) {
    return { lines: cached.lines, skippedLines: cached.skippedLines, mtimeMs }
  }

  const { lines, skippedLines } = parseJsonlFile(filePath)
  cache.set(filePath, { mtimeMs, lines, skippedLines })
  return { lines, skippedLines, mtimeMs }
}
