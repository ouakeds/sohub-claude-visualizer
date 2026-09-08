import { readFileSync } from 'node:fs'

/** Une ligne de transcript déjà parsée : forme libre, chaque lecteur y pioche ce qu'il connaît. */
export type ParsedLine = Record<string, unknown>

export type ParseResult = {
  lines: ParsedLine[]
  /** Lignes JSON invalides, ou dont la valeur parsée n'est pas un objet — jamais levées. */
  skippedLines: number
}

/**
 * Lit un `.jsonl` ligne à ligne, tolérant : une ligne illisible est ignorée et comptée dans
 * `skippedLines`, jamais une exception qui remonterait jusqu'à l'écran. Un fichier absent ou
 * illisible (permission, suppression concurrente) vaut un résultat vide.
 */
export function parseJsonlFile(filePath: string): ParseResult {
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch {
    return { lines: [], skippedLines: 0 }
  }

  const lines: ParsedLine[] = []
  let skippedLines = 0

  for (const rawLine of raw.split('\n')) {
    const trimmed = rawLine.trim()
    if (!trimmed) continue

    try {
      const value = JSON.parse(trimmed)
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        lines.push(value as ParsedLine)
      } else {
        skippedLines += 1
      }
    } catch {
      skippedLines += 1
    }
  }

  return { lines, skippedLines }
}
