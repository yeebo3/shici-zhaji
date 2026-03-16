import fs from 'node:fs/promises'
import path from 'node:path'
import {
  FullTextSearchResult,
  Manifest,
  MatchField,
  Poem,
  PoemIndex,
  PoemNotebook,
  PoemNotebookId,
  PoemSearchHit,
  PoemShard,
} from './types'

const DATA_DIR = path.join(process.cwd(), 'public', 'data')
const INDEX_PATH = path.join(DATA_DIR, 'index.json')
const MANIFEST_PATH = path.join(DATA_DIR, 'manifest.json')
const SHARDS_DIR = path.join(DATA_DIR, 'shards')

let indexCache: PoemIndex[] | null = null
let manifestCache: Manifest | null = null
let idToIndexCache: Map<string, PoemIndex> | null = null
const shardCache = new Map<number, Poem[]>()
let notebookIndexCache: Record<PoemNotebookId, PoemIndex[]> | null = null

function normalizeNotebook(notebook?: string | null): PoemNotebookId {
  if (notebook === 'annotated' || notebook === 'plain') return notebook
  return 'all'
}

function hasAnnotation(poem: Pick<Poem, 'annotation'>): boolean {
  return Array.isArray(poem.annotation) && poem.annotation.length > 0
}

function inNotebook(poem: Pick<Poem, 'annotation'>, notebook: PoemNotebookId): boolean {
  if (notebook === 'all') return true
  if (notebook === 'annotated') return hasAnnotation(poem)
  return !hasAnnotation(poem)
}

function buildPreview(content: string[] | undefined): string {
  return (content || []).slice(0, 2).join('')
}

async function loadIndex(): Promise<PoemIndex[]> {
  if (indexCache) return indexCache
  const raw = await fs.readFile(INDEX_PATH, 'utf-8')
  const parsed = JSON.parse(raw) as PoemIndex[]
  indexCache = parsed
  idToIndexCache = new Map(parsed.map(p => [p.id, p]))
  return parsed
}

async function loadManifest(): Promise<Manifest> {
  if (manifestCache) return manifestCache
  const raw = await fs.readFile(MANIFEST_PATH, 'utf-8')
  const parsed = JSON.parse(raw) as Manifest
  manifestCache = parsed
  return parsed
}

async function loadShard(shard: number): Promise<Poem[]> {
  const cached = shardCache.get(shard)
  if (cached) return cached

  const file = path.join(SHARDS_DIR, `s-${shard}.json`)
  const raw = await fs.readFile(file, 'utf-8')
  const parsed: PoemShard = JSON.parse(raw)
  shardCache.set(shard, parsed.poems)
  return parsed.poems
}

async function ensureNotebookIndexCache() {
  if (notebookIndexCache) return

  const index = await loadIndex()
  const manifest = await loadManifest()
  const annotatedIdSet = new Set<string>()

  for (const shardMeta of manifest.shards) {
    const poems = await loadShard(shardMeta.index)
    for (const poem of poems) {
      if (hasAnnotation(poem)) annotatedIdSet.add(poem.id)
    }
  }

  notebookIndexCache = {
    all: index,
    annotated: index.filter(p => annotatedIdSet.has(p.id)),
    plain: index.filter(p => !annotatedIdSet.has(p.id)),
  }
}

async function getNotebookIndex(notebook: PoemNotebookId): Promise<PoemIndex[]> {
  const normalized = normalizeNotebook(notebook)
  if (normalized === 'all') return loadIndex()
  await ensureNotebookIndexCache()
  return notebookIndexCache?.[normalized] || []
}

type QueryOptions = {
  q?: string
  dynasty?: string
  author?: string
  tag?: string
  notebook?: PoemNotebookId
  offset: number
  limit: number
}

function matches(poem: PoemIndex, opts: Omit<QueryOptions, 'offset' | 'limit' | 'notebook'>): boolean {
  if (opts.dynasty && poem.dynasty !== opts.dynasty) return false
  if (opts.author && poem.author !== opts.author) return false
  if (opts.tag && !poem.tags.includes(opts.tag)) return false

  if (opts.q) {
    const q = opts.q.toLowerCase()
    if (
      !poem.title.toLowerCase().includes(q) &&
      !poem.author.toLowerCase().includes(q) &&
      !poem.tags.some(t => t.toLowerCase().includes(q))
    ) {
      return false
    }
  }

  return true
}

export async function queryPoemIndex(opts: QueryOptions): Promise<{
  items: PoemIndex[]
  total: number
}> {
  const notebook = normalizeNotebook(opts.notebook)
  const index = await getNotebookIndex(notebook)
  const { q, dynasty, author, tag, offset, limit } = opts

  if (!q && !dynasty && !author && !tag) {
    return {
      items: index.slice(offset, offset + limit),
      total: index.length,
    }
  }

  const items: PoemIndex[] = []
  let total = 0

  for (const poem of index) {
    if (!matches(poem, { q, dynasty, author, tag })) continue
    if (total >= offset && items.length < limit) {
      items.push(poem)
    }
    total++
  }

  return { items, total }
}

function buildSearchHit(poem: Poem, shard: number, qLower: string): PoemSearchHit | null {
  const matchFields: MatchField[] = []

  if (poem.title.toLowerCase().includes(qLower)) matchFields.push('title')
  if (poem.author.toLowerCase().includes(qLower)) matchFields.push('author')
  if ((poem.tags || []).some(tag => tag.toLowerCase().includes(qLower))) matchFields.push('tag')

  const matchedLines = (poem.content || [])
    .filter(line => line.toLowerCase().includes(qLower))
    .slice(0, 3)

  if (matchedLines.length > 0) matchFields.push('content')
  if (matchFields.length === 0) return null

  return {
    id: poem.id,
    title: poem.title,
    author: poem.author,
    dynasty: poem.dynasty,
    tags: poem.tags || [],
    preview: buildPreview(poem.content),
    source: poem.source || '',
    shard,
    matchedLines,
    matchFields,
  }
}

export async function searchPoemsFullText(opts: {
  q: string
  offset: number
  limit: number
  notebook?: PoemNotebookId
}): Promise<FullTextSearchResult> {
  const q = opts.q.trim()
  const offset = Math.max(0, opts.offset)
  const limit = Math.max(1, opts.limit)
  const notebook = normalizeNotebook(opts.notebook)

  if (!q) {
    return { items: [], total: 0, offset, limit, hasMore: false }
  }

  const qLower = q.toLowerCase()
  const manifest = await loadManifest()
  const items: PoemSearchHit[] = []
  let total = 0

  for (const shardMeta of manifest.shards) {
    const poems = await loadShard(shardMeta.index)

    for (const poem of poems) {
      if (!inNotebook(poem, notebook)) continue
      const hit = buildSearchHit(poem, shardMeta.index, qLower)
      if (!hit) continue

      if (total >= offset && items.length < limit) {
        items.push(hit)
      }
      total++
    }
  }

  return {
    items,
    total,
    offset,
    limit,
    hasMore: offset + items.length < total,
  }
}

export async function listPoemNotebooks(): Promise<PoemNotebook[]> {
  const all = await loadIndex()
  await ensureNotebookIndexCache()

  const annotatedCount = notebookIndexCache?.annotated.length || 0
  const plainCount = notebookIndexCache?.plain.length || 0

  return [
    {
      id: 'all',
      name: '全部诗词',
      description: '全量诗词随机背诵',
      count: all.length,
    },
    {
      id: 'annotated',
      name: '常用诗词本',
      description: '优先含注释的诗词（annotation 非空）',
      count: annotatedCount,
    },
    {
      id: 'plain',
      name: '纯原文诗词本',
      description: '仅保留无注释诗词（annotation 为空）',
      count: plainCount,
    },
  ]
}

export async function getPoemIndexById(id: string): Promise<PoemIndex | null> {
  await loadIndex()
  return idToIndexCache?.get(id) ?? null
}

export async function getPoemIndexByIds(ids: string[]): Promise<PoemIndex[]> {
  await loadIndex()
  const out: PoemIndex[] = []
  for (const id of ids) {
    const found = idToIndexCache?.get(id)
    if (found) out.push(found)
  }
  return out
}

export async function getPoemById(id: string): Promise<Poem | null> {
  const idx = await getPoemIndexById(id)
  if (!idx) return null

  const poems = await loadShard(idx.shard)
  return poems.find(p => p.id === id) || null
}

export async function getRandomPoemIndex(notebook: PoemNotebookId = 'all'): Promise<PoemIndex> {
  const source = await getNotebookIndex(notebook)
  if (source.length === 0) {
    const index = await loadIndex()
    return index[Math.floor(Math.random() * index.length)]
  }
  return source[Math.floor(Math.random() * source.length)]
}

export async function getDailyPoemIndex(notebook: PoemNotebookId = 'all'): Promise<PoemIndex> {
  const source = await getNotebookIndex(notebook)
  const index = source.length > 0 ? source : await loadIndex()
  const today = new Date()
  const dayOfYear = Math.floor(
    (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000
  )
  return index[dayOfYear % index.length]
}

export async function getCatalogMeta() {
  const manifest = await loadManifest()
  return {
    total: manifest.total,
    dynasties: manifest.dynasties,
    authors: manifest.authors,
    tags: manifest.tags,
    sources: manifest.sources,
  }
}
