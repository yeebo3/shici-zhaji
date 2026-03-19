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
import {
  getPoemNotebookDefinitions,
  matchesPoemNotebook,
  normalizePoemNotebookId,
} from './notebooks'

export type StaticPoemsBridge = {
  queryPoems: (query: {
    q?: string
    dynasty?: string
    author?: string
    tag?: string
    notebook?: PoemNotebookId
    offset?: number
    limit?: number
  }) => Promise<{
    items: PoemIndex[]
    total: number
    offset: number
    limit: number
    hasMore: boolean
  }>
  searchPoemsFullText: (params: {
    q: string
    offset?: number
    limit?: number
    notebook?: PoemNotebookId
    withTotal?: boolean
  }) => Promise<FullTextSearchResult>
  getPoemById: (id: string, shard?: number) => Promise<Poem | null>
  getPoemIndexById: (id: string) => Promise<PoemIndex | null>
  getPoemIndexByIds: (ids: string[]) => Promise<PoemIndex[]>
  getRandomPoemIndex: (notebook?: PoemNotebookId) => Promise<PoemIndex>
  getDailyPoemIndex: (notebook?: PoemNotebookId) => Promise<PoemIndex>
  getPoemNotebooks: () => Promise<PoemNotebook[]>
  loadManifest: () => Promise<Manifest>
}

const DEFAULT_PAGE_LIMIT = 120
const MAX_PAGE_LIMIT = 300
const DEFAULT_FULLTEXT_LIMIT = 60
const MAX_FULLTEXT_LIMIT = 200
const MAX_CACHED_SHARDS = 64

type QueryOptions = {
  q?: string
  dynasty?: string
  author?: string
  tag?: string
  notebook?: PoemNotebookId
  offset: number
  limit: number
}

type SearchOptions = {
  q: string
  offset: number
  limit: number
  notebook?: PoemNotebookId
  withTotal?: boolean
}

function buildPreview(content: string[] | undefined): string {
  return (content || []).slice(0, 2).join('')
}

function hasAnnotation(poem: Pick<Poem, 'annotation'>): boolean {
  return Array.isArray(poem.annotation) && poem.annotation.length > 0
}

function toPoemIndex(poem: Poem, shard: number): PoemIndex {
  return {
    id: poem.id,
    title: poem.title,
    author: poem.author,
    dynasty: poem.dynasty,
    tags: poem.tags || [],
    preview: buildPreview(poem.content),
    source: poem.source || '',
    shard,
    hasAnnotation: hasAnnotation(poem),
  }
}

function toNotebookMatchInputFromIndex(
  poem: Pick<PoemIndex, 'dynasty' | 'author' | 'tags' | 'source'>,
  hasAnnotationFlag: boolean
) {
  return {
    dynasty: poem.dynasty,
    author: poem.author,
    tags: poem.tags || [],
    source: poem.source || '',
    hasAnnotation: hasAnnotationFlag,
  }
}

function toNotebookMatchInputFromPoem(
  poem: Pick<Poem, 'dynasty' | 'author' | 'tags' | 'source' | 'annotation'>
) {
  return {
    dynasty: poem.dynasty,
    author: poem.author,
    tags: poem.tags || [],
    source: poem.source || '',
    annotation: poem.annotation,
  }
}

function matches(
  poem: PoemIndex,
  opts: Omit<QueryOptions, 'offset' | 'limit' | 'notebook'>
): boolean {
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
    hasAnnotation: hasAnnotation(poem),
    matchedLines,
    matchFields,
  }
}

function parseNonNegativeInt(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === '') return fallback
  const n = Number.parseInt(String(value), 10)
  if (!Number.isFinite(n) || n < 0) return fallback
  return n
}

export function createStaticPoemsBridge(baseDataDir = '/data'): StaticPoemsBridge {
  const dataDir = baseDataDir.replace(/\/+$/, '')
  const indexPath = `${dataDir}/index.json`
  const manifestPath = `${dataDir}/manifest.json`
  const shardsDir = `${dataDir}/shards`

  let indexCache: PoemIndex[] | null = null
  let manifestCache: Manifest | null = null
  let idToIndexCache: Map<string, PoemIndex> | null = null
  let notebookIndexCache: Map<PoemNotebookId, PoemIndex[]> | null = null
  const shardCache = new Map<number, Poem[]>()

  async function fetchJSON<T>(url: string): Promise<T> {
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}: ${res.status}`)
    }
    return res.json() as Promise<T>
  }

  function setShardCache(shard: number, poems: Poem[]) {
    if (shardCache.has(shard)) {
      shardCache.delete(shard)
    }
    shardCache.set(shard, poems)

    if (shardCache.size <= MAX_CACHED_SHARDS) return
    const oldest = shardCache.keys().next().value as number | undefined
    if (oldest !== undefined) {
      shardCache.delete(oldest)
    }
  }

  async function loadIndex(): Promise<PoemIndex[]> {
    if (indexCache) return indexCache
    const parsed = await fetchJSON<PoemIndex[]>(indexPath)
    indexCache = parsed
    idToIndexCache = new Map(parsed.map(p => [p.id, p]))
    return parsed
  }

  async function loadManifest(): Promise<Manifest> {
    if (manifestCache) return manifestCache
    const parsed = await fetchJSON<Manifest>(manifestPath)
    manifestCache = parsed
    return parsed
  }

  async function loadShard(shard: number, opts: { cache?: boolean } = {}): Promise<Poem[]> {
    const useCache = opts.cache !== false
    const cached = shardCache.get(shard)
    if (cached) {
      if (useCache) setShardCache(shard, cached)
      return cached
    }

    const file = `${shardsDir}/s-${shard}.json`
    const parsed = await fetchJSON<PoemShard>(file)
    if (useCache) setShardCache(shard, parsed.poems)
    return parsed.poems
  }

  async function buildAnnotatedIdSet(index: PoemIndex[]): Promise<Set<string>> {
    const hasInlineFlag = index.some(item => typeof item.hasAnnotation === 'boolean')
    if (hasInlineFlag) {
      return new Set(index.filter(item => item.hasAnnotation === true).map(item => item.id))
    }

    const manifest = await loadManifest()
    const annotatedIdSet = new Set<string>()

    for (const shardMeta of manifest.shards) {
      const poems = await loadShard(shardMeta.index, { cache: false })
      for (const poem of poems) {
        if (hasAnnotation(poem)) annotatedIdSet.add(poem.id)
      }
    }

    return annotatedIdSet
  }

  async function ensureNotebookIndexCache() {
    if (notebookIndexCache) return

    const index = await loadIndex()
    const annotatedIdSet = await buildAnnotatedIdSet(index)
    const cache = new Map<PoemNotebookId, PoemIndex[]>()

    for (const notebook of getPoemNotebookDefinitions()) {
      if (notebook.id === 'all') {
        cache.set(notebook.id, index)
        continue
      }
      const items = index.filter(poem => matchesPoemNotebook(
        notebook.id,
        toNotebookMatchInputFromIndex(poem, annotatedIdSet.has(poem.id))
      ))
      cache.set(notebook.id, items)
    }

    notebookIndexCache = cache
  }

  async function getNotebookIndex(notebook: PoemNotebookId): Promise<PoemIndex[]> {
    const normalized = normalizePoemNotebookId(notebook)
    if (normalized === 'all') return loadIndex()
    await ensureNotebookIndexCache()
    return notebookIndexCache?.get(normalized) || []
  }

  async function getPoemIndexByGlobalOffset(globalOffset: number): Promise<PoemIndex | null> {
    const manifest = await loadManifest()
    const total = Number.isFinite(manifest.total) ? manifest.total : 0
    if (!Number.isFinite(globalOffset) || globalOffset < 0 || globalOffset >= total) return null

    let remain = globalOffset
    for (const shardMeta of manifest.shards) {
      if (remain >= shardMeta.count) {
        remain -= shardMeta.count
        continue
      }

      const poems = await loadShard(shardMeta.index)
      const poem = poems[remain]
      if (!poem) return null
      return toPoemIndex(poem, shardMeta.index)
    }

    return null
  }

  async function queryAllByManifest(offset: number, limit: number): Promise<{ items: PoemIndex[]; total: number }> {
    const manifest = await loadManifest()
    const total = Number.isFinite(manifest.total) ? manifest.total : 0
    if (offset >= total) {
      return { items: [], total }
    }

    let remainingSkip = offset
    let remainingTake = limit
    const items: PoemIndex[] = []

    for (const shardMeta of manifest.shards) {
      if (remainingTake <= 0) break

      if (remainingSkip >= shardMeta.count) {
        remainingSkip -= shardMeta.count
        continue
      }

      const poems = await loadShard(shardMeta.index)
      const start = remainingSkip
      const end = Math.min(poems.length, start + remainingTake)

      for (let i = start; i < end; i++) {
        const poem = poems[i]
        if (!poem) continue
        items.push(toPoemIndex(poem, shardMeta.index))
      }

      remainingTake -= (end - start)
      remainingSkip = 0
    }

    return { items, total }
  }

  async function queryPoems(opts: QueryOptions): Promise<{
    items: PoemIndex[]
    total: number
    offset: number
    limit: number
    hasMore: boolean
  }> {
    const notebook = normalizePoemNotebookId(opts.notebook)
    const { q, dynasty, author, tag, offset, limit } = opts

    if (!q && !dynasty && !author && !tag && notebook === 'all') {
      const { items, total } = await queryAllByManifest(offset, limit)
      return {
        items,
        total,
        offset,
        limit,
        hasMore: offset + items.length < total,
      }
    }

    const index = await getNotebookIndex(notebook)

    if (!q && !dynasty && !author && !tag) {
      const items = index.slice(offset, offset + limit)
      return {
        items,
        total: index.length,
        offset,
        limit,
        hasMore: offset + items.length < index.length,
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

    return {
      items,
      total,
      offset,
      limit,
      hasMore: offset + items.length < total,
    }
  }

  async function searchPoemsFullText(opts: SearchOptions): Promise<FullTextSearchResult> {
    const q = opts.q.trim()
    const offset = Math.max(0, opts.offset)
    const limit = Math.max(1, opts.limit)
    const notebook = normalizePoemNotebookId(opts.notebook)
    const withTotal = opts.withTotal === true

    if (!q) {
      return { items: [], total: withTotal ? 0 : null, offset, limit, hasMore: false, nextOffset: offset }
    }

    const qLower = q.toLowerCase()
    const manifest = await loadManifest()
    const items: PoemSearchHit[] = []
    let seenMatches = 0
    let hasMore = false

    if (withTotal) {
      for (const shardMeta of manifest.shards) {
        const poems = await loadShard(shardMeta.index, { cache: false })

        for (const poem of poems) {
          if (!matchesPoemNotebook(notebook, toNotebookMatchInputFromPoem(poem))) continue
          const hit = buildSearchHit(poem, shardMeta.index, qLower)
          if (!hit) continue

          if (seenMatches >= offset && items.length < limit) {
            items.push(hit)
          }
          seenMatches++
        }
      }

      return {
        items,
        total: seenMatches,
        offset,
        limit,
        hasMore: offset + items.length < seenMatches,
        nextOffset: offset + items.length,
      }
    }

    outer: for (const shardMeta of manifest.shards) {
      const poems = await loadShard(shardMeta.index, { cache: false })

      for (const poem of poems) {
        if (!matchesPoemNotebook(notebook, toNotebookMatchInputFromPoem(poem))) continue
        const hit = buildSearchHit(poem, shardMeta.index, qLower)
        if (!hit) continue

        if (seenMatches < offset) {
          seenMatches++
          continue
        }

        if (items.length < limit) {
          items.push(hit)
          seenMatches++
          continue
        }

        hasMore = true
        break outer
      }
    }

    return {
      items,
      total: null,
      offset,
      limit,
      hasMore,
      nextOffset: offset + items.length,
    }
  }

  async function listPoemNotebooks(): Promise<PoemNotebook[]> {
    const all = await loadIndex()
    await ensureNotebookIndexCache()

    return getPoemNotebookDefinitions().map(item => ({
      id: item.id,
      name: item.name,
      description: item.description,
      count: item.id === 'all' ? all.length : (notebookIndexCache?.get(item.id)?.length || 0),
    }))
  }

  async function getPoemIndexById(id: string): Promise<PoemIndex | null> {
    await loadIndex()
    return idToIndexCache?.get(id) || null
  }

  async function getPoemIndexByIds(ids: string[]): Promise<PoemIndex[]> {
    await loadIndex()
    const out: PoemIndex[] = []
    for (const id of ids) {
      const found = idToIndexCache?.get(id)
      if (found) out.push(found)
    }
    return out
  }

  async function getPoemById(id: string, shardHint?: number): Promise<Poem | null> {
    if (Number.isInteger(shardHint) && shardHint !== undefined && shardHint >= 0) {
      const poemsByHint = await loadShard(shardHint)
      const foundByHint = poemsByHint.find(p => p.id === id)
      if (foundByHint) return foundByHint
    }

    const idx = await getPoemIndexById(id)
    if (!idx) return null

    const poems = await loadShard(idx.shard)
    return poems.find(p => p.id === id) || null
  }

  async function getRandomPoemIndex(notebook: PoemNotebookId = 'all'): Promise<PoemIndex> {
    const normalized = normalizePoemNotebookId(notebook)

    if (normalized === 'all') {
      const manifest = await loadManifest()
      const total = Number.isFinite(manifest.total) ? manifest.total : 0
      if (total > 0) {
        const picked = Math.floor(Math.random() * total)
        const fromShard = await getPoemIndexByGlobalOffset(picked)
        if (fromShard) return fromShard
      }
    }

    const source = await getNotebookIndex(normalized)
    if (source.length === 0) {
      const index = await loadIndex()
      return index[Math.floor(Math.random() * index.length)]
    }
    return source[Math.floor(Math.random() * source.length)]
  }

  async function getDailyPoemIndex(notebook: PoemNotebookId = 'all'): Promise<PoemIndex> {
    const normalized = normalizePoemNotebookId(notebook)

    if (normalized === 'all') {
      const manifest = await loadManifest()
      const total = Number.isFinite(manifest.total) ? manifest.total : 0
      if (total > 0) {
        const today = new Date()
        const dayOfYear = Math.floor(
          (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000
        )
        const fromShard = await getPoemIndexByGlobalOffset(dayOfYear % total)
        if (fromShard) return fromShard
      }
    }

    const source = await getNotebookIndex(normalized)
    const index = source.length > 0 ? source : await loadIndex()
    const today = new Date()
    const dayOfYear = Math.floor(
      (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000
    )
    return index[dayOfYear % index.length]
  }

  return {
    queryPoems: async query => {
      const q = query.q?.trim() || undefined
      const dynasty = query.dynasty?.trim() || undefined
      const author = query.author?.trim() || undefined
      const tag = query.tag?.trim() || undefined
      const notebook = normalizePoemNotebookId(query.notebook)
      const offset = parseNonNegativeInt(query.offset, 0)
      const reqLimit = parseNonNegativeInt(query.limit, DEFAULT_PAGE_LIMIT)
      const limit = Math.max(1, Math.min(reqLimit, MAX_PAGE_LIMIT))
      return queryPoems({
        q,
        dynasty,
        author,
        tag,
        notebook,
        offset,
        limit,
      })
    },
    searchPoemsFullText: async params => {
      const q = params.q?.trim() || ''
      const withTotal = params.withTotal === true
      const notebook = normalizePoemNotebookId(params.notebook)
      const offset = parseNonNegativeInt(params.offset, 0)
      const reqLimit = parseNonNegativeInt(params.limit, DEFAULT_FULLTEXT_LIMIT)
      const limit = Math.max(1, Math.min(reqLimit, MAX_FULLTEXT_LIMIT))
      return searchPoemsFullText({
        q,
        notebook,
        offset,
        limit,
        withTotal,
      })
    },
    getPoemById,
    getPoemIndexById,
    getPoemIndexByIds,
    getRandomPoemIndex,
    getDailyPoemIndex,
    getPoemNotebooks: listPoemNotebooks,
    loadManifest,
  }
}
