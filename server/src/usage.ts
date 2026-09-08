import type { TokenUsage } from '../../shared/types'
import type { ParsedLine } from './parser'

export function emptyUsage(): TokenUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, thinking: 0 }
}

/**
 * Extrait un `TokenUsage` depuis `message.usage` d'une ligne `assistant`. Ne lit que les champs
 * de premier niveau de `usage` : le tableau `usage.iterations` répète les mêmes compteurs et ne
 * doit jamais être additionné en plus, sous peine de compter chaque token deux fois. Un champ
 * absent vaut zéro.
 */
export function extractUsage(line: ParsedLine): TokenUsage {
  const message = asRecord(line.message)
  const usage = asRecord(message?.usage)
  if (!usage) return emptyUsage()

  const details = asRecord(usage.output_tokens_details)

  return {
    input: toNumber(usage.input_tokens),
    output: toNumber(usage.output_tokens),
    cacheRead: toNumber(usage.cache_read_input_tokens),
    cacheCreation: toNumber(usage.cache_creation_input_tokens),
    thinking: toNumber(details?.thinking_tokens),
  }
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheCreation: a.cacheCreation + b.cacheCreation,
    thinking: a.thinking + b.thinking,
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
