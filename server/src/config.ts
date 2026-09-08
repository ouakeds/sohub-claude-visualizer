import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  IDLE_THRESHOLD_MS as SHARED_IDLE_THRESHOLD_MS,
  PERMISSION_WAIT_MS as SHARED_PERMISSION_WAIT_MS,
  type Window,
} from '../../shared/types'

/** Port d'écoute unique du serveur : API, flux SSE et front construit. */
export const PORT = 4318

/** Racine en lecture seule stricte : jamais d'écriture, jamais de verrou. */
export const PROJECTS_ROOT = join(homedir(), '.claude', 'projects')

const DAY_MS = 24 * 60 * 60 * 1000

/** Durée de chaque fenêtre bornée. `all` n'a pas de borne, donc pas d'entrée ici. */
export const WINDOW_DURATIONS_MS: Record<'7d' | '30d', number> = {
  '7d': 7 * DAY_MS,
  '30d': 30 * DAY_MS,
}

export const DEFAULT_WINDOW: Window = '7d'

/** Réexport de la constante partagée : une seule définition, dans `shared/types`, dont le front
 *  a aussi besoin. */
export const IDLE_THRESHOLD_MS = SHARED_IDLE_THRESHOLD_MS

/** Réexport de la constante partagée, même raison qu'`IDLE_THRESHOLD_MS`. */
export const PERMISSION_WAIT_MS = SHARED_PERMISSION_WAIT_MS

/** Cadence du scan périodique de `~/.claude/projects` pour le flux SSE (`scanner.ts`). */
export const SCAN_INTERVAL_MS = 3 * 1000

/** Fréquence de l'événement `heartbeat` du flux SSE, pour maintenir la connexion ouverte. */
export const HEARTBEAT_INTERVAL_MS = 30 * 1000

/** `window` absent ou invalide retombe sur la fenêtre par défaut, jamais une erreur 400. */
export function parseWindow(value: unknown): Window {
  return value === '7d' || value === '30d' || value === 'all' ? value : DEFAULT_WINDOW
}
