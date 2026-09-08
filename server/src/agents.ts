import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentNode, AgentStatus, TokenUsage, ToolCall } from '../../shared/types'
import { IDLE_THRESHOLD_MS } from './config'
import { readJsonlCached } from './cache'
import { addUsage, emptyUsage, extractUsage } from './usage'
import type { ParsedLine } from './parser'

/**
 * Métadonnées d'un agent, telles que lues dans son `.meta.json`. `toolUseId` est absent pour un
 * agent de workflow (`{"agentType":"workflow-subagent","spawnDepth":1}`, constaté en réel) : ce
 * n'est pas une anomalie, juste un type d'agent qui n'a jamais de `tool_result` à chercher.
 */
type AgentMeta = {
  agentType: string
  description: string
  toolUseId: string | null
  spawnDepth: number
}

/** Un agent (direct ou de workflow) avant construction de son `AgentNode` : son transcript déjà
 *  lu, ses métadonnées, et le contexte (workflow ou non) dont dépend la résolution du parent. */
type RawAgent = {
  id: string
  lines: ParsedLine[]
  fileSkippedLines: number
  mtimeMs: number
  meta: AgentMeta | null
  isWorkflowChild: boolean
  workflowId: string | null
}

/** Le bloc `tool_use` `Agent` qui a lancé un agent : dans quel transcript il se trouve
 *  (`ownerId`, `null` pour la session elle-même), le prompt et la description qu'il portait
 *  (`input.prompt`/`input.description`) — repli quand `toolUseResult` n'a pas ces champs. */
type ToolUseInfo = { ownerId: string | null; prompt: string; description: string }

/**
 * La ligne `tool_result` qui referme (ou, pour un agent async, accuse simplement réception du
 * lancement de) un agent : son horodatage et son `toolUseResult` structuré s'il existe. Ce champ
 * distingue les deux cas :
 * `{"isAsync":true,"status":"async_launched",...}` constaté en réel n'est jamais une fin.
 */
type ToolResultInfo = { timestamp: string; toolUseResult: Record<string, unknown> | undefined }

/** Résultat de `buildSessionAgentTree` : l'arbre lui-même, plus le mtime le plus frais parmi
 *  tous les transcripts de sous-agents (toutes profondeurs, workflow inclus). Un agent
 *  synchrone n'écrit rien dans le transcript de la session tant qu'il tourne — seul le mtime de
 *  son propre fichier en témoigne — d'où le besoin de le faire remonter à l'appelant pour la
 *  résolution du statut de la session. */
export type SessionAgentTree = {
  roots: AgentNode[]
  latestMtimeMs: number | null
}

/**
 * Construit l'arbre des agents d'une session : ses racines sont les agents lancés directement
 * par la session et, s'il existe des agents de workflow, un nœud synthétique par workflow. Une
 * session sans dossier `subagents/` donne `{ roots: [], latestMtimeMs: null }`, cas normal et
 * fréquent, pas une erreur.
 *
 * `sessionLines` est le transcript déjà lu de la session (par l'appelant, `sessions.ts`) : on
 * évite de le relire ici pour y chercher les blocs `tool_use`/`tool_result` qui referment le
 * lien de parenté et la fin des agents de profondeur 1.
 */
export function buildSessionAgentTree(
  projectPath: string,
  sessionId: string,
  sessionLines: ParsedLine[],
): SessionAgentTree {
  const subagentsDir = join(projectPath, sessionId, 'subagents')

  const direct = listAgentIds(subagentsDir).map((id) => readRawAgent(subagentsDir, id, false, null))

  const byWorkflow = new Map<string, RawAgent[]>()
  for (const workflowId of listWorkflowIds(subagentsDir)) {
    const workflowDir = join(subagentsDir, 'workflows', workflowId)
    // Même filtre que pour les agents directs (`agent-<id>.jsonl`) : un dossier de workflow
    // constaté en réel porte aussi un `journal.jsonl` (log de corrélation partagé par tout le
    // workflow, pas le transcript d'un agent — types de ligne `started`/`result`, plusieurs
    // `agentId` différents dedans) qu'on ignore comme n'importe quelle autre entrée étrangère.
    const ids = listAgentIds(workflowDir)
    byWorkflow.set(
      workflowId,
      ids.map((id) => readRawAgent(workflowDir, id, true, workflowId)),
    )
  }

  const allRaw = [...direct, ...[...byWorkflow.values()].flat()]
  if (allRaw.length === 0) return { roots: [], latestMtimeMs: null }

  // Mtime déjà lu par `readJsonlCached` pour chaque transcript de sous-agent (via `readRawAgent`) :
  // aucune relecture ni stat supplémentaire, juste le max de ce qu'on a déjà en main.
  const latestMtimeMs = Math.max(...allRaw.map((raw) => raw.mtimeMs))

  // Index global des blocs `tool_use` (name: 'Agent') et `tool_result`, construit une seule fois
  // sur la session et tous les transcripts d'agents : un agent de profondeur > 1 (non constaté à
  // ce jour, mais pas exclu par le contrat) peut être lancé depuis le transcript d'un autre agent,
  // pas seulement celui de la session.
  const toolUseIndex = new Map<string, ToolUseInfo>()
  const toolResultIndex = new Map<string, ToolResultInfo>()
  indexTranscript(sessionLines, null, toolUseIndex, toolResultIndex)
  for (const raw of allRaw) indexTranscript(raw.lines, raw.id, toolUseIndex, toolResultIndex)

  const now = Date.now()
  const nodesById = new Map<string, AgentNode>()
  for (const raw of allRaw) {
    nodesById.set(raw.id, buildAgentNode(sessionId, raw, toolUseIndex, toolResultIndex, now))
  }

  const roots: AgentNode[] = []

  for (const raw of direct) {
    const node = nodesById.get(raw.id)!
    if (node.parentAgentId !== null) {
      const parent = nodesById.get(node.parentAgentId)
      if (parent) {
        parent.children.push(node)
        continue
      }
      // Bloc `tool_use` retrouvé mais son transcript porteur a disparu de l'index (cas non
      // observé) : plutôt que de perdre l'agent, on le remonte en racine.
      node.parentAgentId = null
    }
    roots.push(node)
  }

  for (const [workflowId, rawChildren] of byWorkflow) {
    const children = rawChildren.map((raw) => nodesById.get(raw.id)!)
    if (children.length === 0) continue // dossier de workflow sans agent exploitable : rien à montrer
    roots.push(buildWorkflowGroupNode(sessionId, workflowId, children))
  }

  for (const root of roots) finalizeTotalUsage(root)

  return { roots, latestMtimeMs }
}

/** Aplatit un arbre d'agents, parcours en profondeur, nœuds de groupe de workflow inclus. */
export function flattenAgentNodes(nodes: AgentNode[]): AgentNode[] {
  const result: AgentNode[] = []
  const visit = (node: AgentNode): void => {
    result.push(node)
    for (const child of node.children) visit(child)
  }
  for (const node of nodes) visit(node)
  return result
}

/** `true` pour le nœud de groupe synthétique d'un workflow — à exclure de `agentCount`, qui ne
 *  compte que des agents réels (ses enfants directs y comptent, eux). */
export function isWorkflowGroupNode(node: AgentNode): boolean {
  return node.agentType === 'workflow'
}

/** `true` pour un agent dont l'absence de `tool_result` doit compter dans le statut de la
 *  session. Le groupe de workflow et ses enfants n'ont jamais de `toolUseId` à résoudre : ils ne
 *  doivent jamais empêcher une session d'être `done`. */
export function countsTowardSessionResolution(node: AgentNode): boolean {
  return node.agentType !== 'workflow' && node.agentType !== 'workflow-subagent'
}

/** Le dernier bloc `tool_use` (id, name) du contenu d'une ligne `assistant`, `null` si son
 *  contenu n'en porte aucun. Utilisé par `sessions.ts` sur la dernière ligne `user`/`assistant`
 *  du transcript de la session : par construction, si cette ligne est la dernière du fichier,
 *  aucune ligne `user` (seule porteuse de `tool_result`) ne la suit — un bloc `tool_use` qu'elle
 *  contient n'a donc jamais de `tool_result` correspondant, sans qu'il soit besoin de le
 *  chercher dans le reste du transcript. */
export type PendingToolUse = { id: string; name: string }

export function findLastToolUseBlock(line: ParsedLine): PendingToolUse | null {
  const content = asRecord(line.message)?.content
  if (!Array.isArray(content)) return null

  let last: PendingToolUse | null = null
  for (const block of content) {
    const item = asRecord(block)
    if (item?.type === 'tool_use' && typeof item.id === 'string' && typeof item.name === 'string') {
      last = { id: item.id, name: item.name }
    }
  }
  return last
}

function buildAgentNode(
  sessionId: string,
  raw: RawAgent,
  toolUseIndex: Map<string, ToolUseInfo>,
  toolResultIndex: Map<string, ToolResultInfo>,
  now: number,
): AgentNode {
  const { usage, models: ownModels, tools, firstTs, lastTs } = ownTranscriptMetrics(raw.lines)

  const meta = raw.meta
  const agentType = meta?.agentType ?? 'unknown'
  const spawnDepth = meta?.spawnDepth ?? 1
  const toolUseId = meta?.toolUseId ?? null

  const skippedLines = raw.fileSkippedLines + (meta === null ? 1 : 0)

  let parentAgentId: string | null
  let description = meta?.description ?? ''
  let prompt = ''
  let endedAt: string | null
  let status: AgentStatus
  let models = ownModels

  const isRunning = now - raw.mtimeMs < IDLE_THRESHOLD_MS

  if (raw.isWorkflowChild) {
    // Pas de `toolUseId` : le parent est le nœud de groupe, jamais un `tool_use`/`tool_result` à
    // chercher. Jamais `idle` (tranché avec l'utilisateur) : `running` ou `done` selon le mtime.
    parentAgentId = raw.workflowId
    endedAt = null
    status = isRunning ? 'running' : 'done'
  } else if (meta === null) {
    // `.meta.json` absent ou illisible : impossible de savoir si l'agent est résolu, on le
    // compte comme une anomalie plutôt que de deviner un statut (comportement déjà en place
    // avant l'arbre complet, préservé à l'identique).
    parentAgentId = null
    endedAt = null
    status = 'idle'
  } else if (toolUseId) {
    const info = toolUseIndex.get(toolUseId)
    parentAgentId = info?.ownerId ?? null

    const resultInfo = toolResultIndex.get(toolUseId)
    const toolUseResult = resultInfo?.toolUseResult

    // Tâche et modèle : d'abord `toolUseResult` (présent qu'un agent soit synchrone ou
    // asynchrone), repli sur le bloc `tool_use` du parent puis, pour la description, sur la
    // meta — mécanisme déjà en place, préservé pour ne faire régresser aucun agent ancien.
    description = pickString(toolUseResult?.description) ?? pickString(info?.description) ?? description
    prompt = pickString(toolUseResult?.prompt) ?? info?.prompt ?? ''
    const resolvedModel = pickString(toolUseResult?.resolvedModel)
    if (resolvedModel !== null && !models.includes(resolvedModel)) {
      models = [resolvedModel, ...models]
    }

    // `toolUseResult.isAsync`/`status` distingue l'accusé de lancement asynchrone (pas une fin)
    // de la vraie preuve de fin d'un agent synchrone.
    const isAsyncLaunch = toolUseResult?.isAsync === true || toolUseResult?.status === 'async_launched'

    if (resultInfo && isAsyncLaunch) {
      // Le `tool_result` n'est que l'accusé de réception du lancement : la vraie fin arrive plus
      // tard dans le transcript parent, en texte libre, non exploitable. La meilleure preuve
      // disponible est la dernière ligne horodatée du transcript de l'agent lui-même. Jamais
      // `idle` : on ne peut pas prouver qu'un agent asynchrone a été interrompu.
      endedAt = lastTs !== null ? new Date(lastTs).toISOString() : null
      status = isRunning ? 'running' : 'done'
    } else {
      endedAt = resultInfo?.timestamp ?? null
      status = isRunning ? 'running' : endedAt !== null ? 'done' : 'idle'
    }
  } else {
    // Meta présente mais sans `toolUseId`, hors contexte de workflow (non constaté en réel) :
    // même traitement que l'anomalie ci-dessus, pour la même raison.
    parentAgentId = null
    endedAt = null
    status = 'idle'
  }

  const startedAtMs = firstTs ?? raw.mtimeMs
  const endedAtMs = endedAt !== null ? Date.parse(endedAt) : null
  const lastKnownMs = endedAtMs ?? lastTs ?? raw.mtimeMs

  return {
    id: raw.id,
    sessionId,
    parentAgentId,
    spawnDepth,
    agentType,
    description,
    prompt,
    models,
    status,
    startedAt: new Date(startedAtMs).toISOString(),
    endedAt,
    durationMs: Math.max(0, lastKnownMs - startedAtMs),
    ownUsage: usage,
    totalUsage: usage, // provisoire : recalculé par `finalizeTotalUsage` une fois l'arbre assemblé
    tools,
    skippedLines,
    children: [],
  }
}

function buildWorkflowGroupNode(sessionId: string, workflowId: string, children: AgentNode[]): AgentNode {
  const startedAtMs = Math.min(...children.map((child) => Date.parse(child.startedAt)))
  // Le point d'arrivée d'un enfant est son `endedAt`, ou à défaut sa dernière ligne horodatée —
  // exactement `startedAt + durationMs`, déjà calculé pour lui.
  const latestMs = Math.max(...children.map((child) => Date.parse(child.startedAt) + child.durationMs))
  const isRunning = children.some((child) => child.status === 'running')

  return {
    id: workflowId,
    sessionId,
    parentAgentId: null,
    spawnDepth: 1,
    agentType: 'workflow',
    description: `Workflow ${workflowId} — ${children.length} agents`,
    prompt: '',
    models: [],
    status: isRunning ? 'running' : 'done',
    startedAt: new Date(startedAtMs).toISOString(),
    endedAt: null,
    durationMs: Math.max(0, latestMs - startedAtMs),
    ownUsage: emptyUsage(),
    totalUsage: emptyUsage(), // provisoire : recalculé par `finalizeTotalUsage`
    tools: [],
    skippedLines: 0, // celles de chaque enfant sont déjà comptées individuellement, pas sommées ici
    children,
  }
}

/** Post-ordre : `totalUsage` d'un nœud est son `ownUsage` plus celui, déjà total, de chacun de
 *  ses descendants. */
function finalizeTotalUsage(node: AgentNode): TokenUsage {
  let total = node.ownUsage
  for (const child of node.children) {
    total = addUsage(total, finalizeTotalUsage(child))
  }
  node.totalUsage = total
  return total
}

/** Usage, modèles et outils propres à un transcript d'agent, plus ses bornes temporelles — un
 *  seul passage sur les lignes `assistant`. */
function ownTranscriptMetrics(lines: ParsedLine[]): {
  usage: TokenUsage
  models: string[]
  tools: ToolCall[]
  firstTs: number | null
  lastTs: number | null
} {
  let usage = emptyUsage()
  const models: string[] = []
  const toolCounts = new Map<string, number>()
  let firstTs: number | null = null
  let lastTs: number | null = null

  for (const line of lines) {
    const ts = readTimestampMs(line)
    if (ts !== null) {
      if (firstTs === null || ts < firstTs) firstTs = ts
      if (lastTs === null || ts > lastTs) lastTs = ts
    }

    if (line.type !== 'assistant') continue
    usage = addUsage(usage, extractUsage(line))

    const message = asRecord(line.message)
    if (typeof message?.model === 'string' && !models.includes(message.model)) {
      models.push(message.model)
    }

    const content = message?.content
    if (Array.isArray(content)) {
      for (const block of content) {
        const item = asRecord(block)
        if (item?.type === 'tool_use' && typeof item.name === 'string') {
          toolCounts.set(item.name, (toolCounts.get(item.name) ?? 0) + 1)
        }
      }
    }
  }

  const tools = [...toolCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  return { usage, models, tools, firstTs, lastTs }
}

/** Indexe, dans un transcript, les blocs `tool_use` `Agent` (qui lancent un agent) et les blocs
 *  `tool_result` (qui en referment un), avec `ownerId` = l'agent porteur du transcript (`null`
 *  pour la session elle-même). */
function indexTranscript(
  lines: ParsedLine[],
  ownerId: string | null,
  toolUseIndex: Map<string, ToolUseInfo>,
  toolResultIndex: Map<string, ToolResultInfo>,
): void {
  for (const line of lines) {
    const content = asRecord(line.message)?.content
    if (!Array.isArray(content)) continue

    if (line.type === 'assistant') {
      for (const block of content) {
        const item = asRecord(block)
        if (item?.type === 'tool_use' && item.name === 'Agent' && typeof item.id === 'string') {
          const input = asRecord(item.input)
          const prompt = typeof input?.prompt === 'string' ? input.prompt : ''
          const description = typeof input?.description === 'string' ? input.description : ''
          toolUseIndex.set(item.id, { ownerId, prompt, description })
        }
      }
    } else if (line.type === 'user' && typeof line.timestamp === 'string') {
      for (const block of content) {
        const item = asRecord(block)
        if (item?.type === 'tool_result' && typeof item.tool_use_id === 'string') {
          // `toolUseResult` est un champ du niveau de la ligne, pas du bloc : porté par la ligne
          // qui référence ce `tool_use_id`, constaté en réel toujours seul par ligne.
          toolResultIndex.set(item.tool_use_id, {
            timestamp: line.timestamp,
            toolUseResult: asRecord(line.toolUseResult),
          })
        }
      }
    }
  }
}

/** `value` si c'est une chaîne non vide, `null` sinon — un champ absent ou vide dans
 *  `toolUseResult` n'est jamais un repli valable. */
function pickString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readRawAgent(dir: string, id: string, isWorkflowChild: boolean, workflowId: string | null): RawAgent {
  const { lines, skippedLines, mtimeMs } = readJsonlCached(join(dir, `agent-${id}.jsonl`))
  return {
    id,
    lines,
    fileSkippedLines: skippedLines,
    mtimeMs,
    meta: readAgentMeta(dir, id),
    isWorkflowChild,
    workflowId,
  }
}

function readAgentMeta(dir: string, agentId: string): AgentMeta | null {
  try {
    const raw = readFileSync(join(dir, `agent-${agentId}.meta.json`), 'utf8')
    const value = JSON.parse(raw)
    const record = asRecord(value)
    if (!record) return null

    return {
      agentType: typeof record.agentType === 'string' ? record.agentType : 'unknown',
      description: typeof record.description === 'string' ? record.description : '',
      toolUseId: typeof record.toolUseId === 'string' ? record.toolUseId : null,
      spawnDepth: typeof record.spawnDepth === 'number' ? record.spawnDepth : 1,
    }
  } catch {
    return null
  }
}

function readTimestampMs(line: ParsedLine): number | null {
  if (typeof line.timestamp !== 'string') return null
  const ms = Date.parse(line.timestamp)
  return Number.isNaN(ms) ? null : ms
}

/** Noms d'agents (`agent-<id>`) trouvés dans `dir`, `.meta.json` mis à part. Ignore les autres
 *  entrées du dossier (ex. `workflows/`, `journal.jsonl`, constatés en réel). */
function listAgentIds(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.startsWith('agent-') && entry.name.endsWith('.jsonl'))
      .map((entry) => entry.name.slice('agent-'.length, -'.jsonl'.length))
  } catch {
    return [] // pas de dossier : cas normal, pas une erreur
  }
}

/** Identifiants (`wf_...`) des workflows sous `subagentsDir/workflows/`. Un projet sans agent de
 *  workflow (l'immense majorité des sessions) donne `[]`, cas normal. */
function listWorkflowIds(subagentsDir: string): string[] {
  try {
    return readdirSync(join(subagentsDir, 'workflows'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}
