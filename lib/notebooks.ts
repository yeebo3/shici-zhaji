import rawNotebookConfig from './poem-notebooks.json'
import { PoemNotebookId } from './types'

export type PoemNotebookRule = {
  requireAnnotation?: boolean
  dynasties?: string[]
  authors?: string[]
  tagsAny?: string[]
  sources?: string[]
}

export type PoemNotebookDefinition = {
  id: PoemNotebookId
  name: string
  description: string
  rule?: PoemNotebookRule
}

export type PoemNotebookMatchInput = {
  dynasty?: string
  author?: string
  tags?: string[]
  source?: string
  hasAnnotation?: boolean
  annotation?: string[]
}

const GROUP_SCOPE_PREFIX = 'group:'
export const DEFAULT_POEM_NOTEBOOK_ID: PoemNotebookId = 'all'
export const DEFAULT_RECITE_NOTEBOOK_ID: PoemNotebookId = 'annotated'

type RawNotebookDefinition = {
  id?: unknown
  name?: unknown
  description?: unknown
  rule?: {
    requireAnnotation?: unknown
    dynasties?: unknown
    authors?: unknown
    tagsAny?: unknown
    sources?: unknown
  }
}

function normalizeStringArray(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined
  const values = [...new Set(input.map(item => String(item || '').trim()).filter(Boolean))]
  return values.length > 0 ? values : undefined
}

function normalizeRule(input: RawNotebookDefinition['rule']): PoemNotebookRule | undefined {
  if (!input || typeof input !== 'object') return undefined
  const normalized: PoemNotebookRule = {}

  if (typeof input.requireAnnotation === 'boolean') {
    normalized.requireAnnotation = input.requireAnnotation
  }

  normalized.dynasties = normalizeStringArray(input.dynasties)
  normalized.authors = normalizeStringArray(input.authors)
  normalized.tagsAny = normalizeStringArray(input.tagsAny)
  normalized.sources = normalizeStringArray(input.sources)

  if (
    normalized.requireAnnotation === undefined
    && !normalized.dynasties
    && !normalized.authors
    && !normalized.tagsAny
    && !normalized.sources
  ) {
    return undefined
  }

  return normalized
}

function normalizeNotebook(input: unknown): PoemNotebookDefinition | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as RawNotebookDefinition

  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const description = typeof raw.description === 'string' ? raw.description.trim() : ''

  if (!id || !name || !description) return null
  if (id.startsWith(GROUP_SCOPE_PREFIX)) return null

  return {
    id,
    name,
    description,
    rule: normalizeRule(raw.rule),
  }
}

function readConfiguredNotebooks(): PoemNotebookDefinition[] {
  const rawList = Array.isArray(rawNotebookConfig)
    ? rawNotebookConfig
    : Array.isArray((rawNotebookConfig as { notebooks?: unknown[] } | undefined)?.notebooks)
    ? (rawNotebookConfig as { notebooks: unknown[] }).notebooks
    : []

  const byId = new Map<string, PoemNotebookDefinition>()
  for (const item of rawList) {
    const normalized = normalizeNotebook(item)
    if (!normalized || byId.has(normalized.id)) continue
    byId.set(normalized.id, normalized)
  }
  return Array.from(byId.values())
}

// 单一扩展点：诗词本列表完全由 lib/poem-notebooks.json 驱动。
const NOTEBOOK_DEFINITIONS = readConfiguredNotebooks()
const NOTEBOOK_MAP = new Map(NOTEBOOK_DEFINITIONS.map(item => [item.id, item]))
const FIRST_NOTEBOOK_ID: PoemNotebookId =
  NOTEBOOK_DEFINITIONS[0]?.id || DEFAULT_POEM_NOTEBOOK_ID

export function getPoemNotebookDefinitions(): PoemNotebookDefinition[] {
  return NOTEBOOK_DEFINITIONS
}

export function normalizePoemNotebookId(
  input: string | null | undefined,
  fallback: PoemNotebookId = DEFAULT_POEM_NOTEBOOK_ID
): PoemNotebookId {
  const value = typeof input === 'string' ? input.trim() : ''
  if (value && NOTEBOOK_MAP.has(value)) return value
  if (NOTEBOOK_MAP.has(fallback)) return fallback
  if (NOTEBOOK_MAP.has(DEFAULT_POEM_NOTEBOOK_ID)) return DEFAULT_POEM_NOTEBOOK_ID
  return FIRST_NOTEBOOK_ID
}

function includes(list: string[] | undefined, value: string | undefined): boolean {
  if (!list || list.length === 0) return true
  if (!value) return false
  return list.includes(value)
}

function matchesTagsAny(list: string[] | undefined, tags: string[] | undefined): boolean {
  if (!list || list.length === 0) return true
  if (!tags || tags.length === 0) return false
  const tagSet = new Set(tags)
  return list.some(tag => tagSet.has(tag))
}

function resolveHasAnnotation(input: PoemNotebookMatchInput): boolean {
  if (typeof input.hasAnnotation === 'boolean') return input.hasAnnotation
  return Array.isArray(input.annotation) && input.annotation.length > 0
}

function matchesRule(rule: PoemNotebookRule | undefined, input: PoemNotebookMatchInput): boolean {
  if (!rule) return true

  if (typeof rule.requireAnnotation === 'boolean') {
    if (resolveHasAnnotation(input) !== rule.requireAnnotation) return false
  }

  if (!includes(rule.dynasties, input.dynasty)) return false
  if (!includes(rule.authors, input.author)) return false
  if (!includes(rule.sources, input.source)) return false
  if (!matchesTagsAny(rule.tagsAny, input.tags)) return false

  return true
}

export function matchesPoemNotebook(notebook: PoemNotebookId, input: PoemNotebookMatchInput): boolean {
  const definition = NOTEBOOK_MAP.get(normalizePoemNotebookId(notebook))
  if (!definition) return true
  return matchesRule(definition.rule, input)
}
