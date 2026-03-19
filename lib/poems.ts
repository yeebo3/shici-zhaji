import { FullTextSearchResult, Manifest, Poem, PoemIndex, PoemNotebook, PoemNotebookId } from './types'

export type PoemQuery = {
  q?: string
  dynasty?: string
  author?: string
  tag?: string
  notebook?: PoemNotebookId
  offset?: number
  limit?: number
  signal?: AbortSignal
}

export type PoemQueryResult = {
  items: PoemIndex[]
  total: number
  offset: number
  limit: number
  hasMore: boolean
}

let manifestCache: Manifest | null = null

type SearchPoemsFullTextParams = {
  q: string
  offset?: number
  limit?: number
  notebook?: PoemNotebookId
  withTotal?: boolean
  signal?: AbortSignal
}

type DesktopPoemsBridge = {
  queryPoems: (query: Omit<PoemQuery, 'signal'>) => Promise<PoemQueryResult>
  searchPoemsFullText: (params: Omit<SearchPoemsFullTextParams, 'signal'>) => Promise<FullTextSearchResult>
  getPoemById: (id: string, shard?: number) => Promise<Poem | null>
  getPoemIndexById: (id: string) => Promise<PoemIndex | null>
  getPoemIndexByIds: (ids: string[]) => Promise<PoemIndex[]>
  getRandomPoemIndex: (notebook?: PoemNotebookId) => Promise<PoemIndex>
  getDailyPoemIndex: (notebook?: PoemNotebookId) => Promise<PoemIndex>
  getPoemNotebooks: () => Promise<PoemNotebook[]>
  loadManifest: () => Promise<Manifest>
}

function getDesktopBridge(): DesktopPoemsBridge | null {
  if (typeof window === 'undefined') return null
  const withBridge = window as Window & {
    desktopMeta?: { runtime?: string }
    desktopPoems?: DesktopPoemsBridge
  }
  if (withBridge.desktopMeta?.runtime !== 'static') return null
  return withBridge.desktopPoems || null
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  return res.json()
}

function buildQueryString(query: PoemQuery): string {
  const params = new URLSearchParams()
  if (query.q) params.set('q', query.q)
  if (query.dynasty) params.set('dynasty', query.dynasty)
  if (query.author) params.set('author', query.author)
  if (query.tag) params.set('tag', query.tag)
  if (query.notebook) params.set('notebook', query.notebook)
  if (query.offset !== undefined) params.set('offset', String(query.offset))
  if (query.limit !== undefined) params.set('limit', String(query.limit))
  return params.toString()
}

/** 查询诗词索引（服务端分页检索） */
export async function queryPoems(query: PoemQuery): Promise<PoemQueryResult> {
  const { signal, ...rest } = query
  const bridge = getDesktopBridge()
  if (bridge) {
    return bridge.queryPoems(rest)
  }
  const qs = buildQueryString(rest)
  const url = `/api/poems${qs ? `?${qs}` : ''}`
  return fetchJSON<PoemQueryResult>(url, signal ? { signal } : undefined)
}

/** 全文搜索（标题/作者/标签/诗句） */
export async function searchPoemsFullText(params: SearchPoemsFullTextParams): Promise<FullTextSearchResult> {
  const bridge = getDesktopBridge()
  if (bridge) {
    const { signal, ...rest } = params
    void signal
    return bridge.searchPoemsFullText(rest)
  }

  const usp = new URLSearchParams()
  usp.set('q', params.q)
  usp.set('offset', String(params.offset ?? 0))
  usp.set('limit', String(params.limit ?? 120))
  if (params.notebook) usp.set('notebook', params.notebook)
  if (params.withTotal) usp.set('withTotal', '1')
  return fetchJSON<FullTextSearchResult>(
    `/api/poems/fulltext?${usp.toString()}`,
    params.signal ? { signal: params.signal } : undefined
  )
}

/** 获取完整诗词 */
export async function getPoemById(id: string, shardHint?: number): Promise<Poem | null> {
  const bridge = getDesktopBridge()
  try {
    if (bridge) return await bridge.getPoemById(id, shardHint)
    const qs = Number.isInteger(shardHint) ? `?shard=${shardHint}` : ''
    return await fetchJSON<Poem>(`/api/poems/${encodeURIComponent(id)}${qs}`)
  } catch {
    return null
  }
}

/** 获取单个索引 */
export async function getPoemIndexById(id: string): Promise<PoemIndex | null> {
  const bridge = getDesktopBridge()
  try {
    if (bridge) return await bridge.getPoemIndexById(id)
    return await fetchJSON<PoemIndex>(`/api/poems/index/${encodeURIComponent(id)}`)
  } catch {
    return null
  }
}

/** 批量获取索引（用于我的学习页） */
export async function getPoemIndexByIds(ids: string[]): Promise<PoemIndex[]> {
  if (ids.length === 0) return []
  const bridge = getDesktopBridge()
  if (bridge) {
    return bridge.getPoemIndexByIds(ids)
  }
  const q = ids.map(encodeURIComponent).join(',')
  const res = await fetchJSON<{ items: PoemIndex[] }>(`/api/poems/by-ids?ids=${q}`)
  return res.items
}

/** 获取随机诗词索引 */
export async function getRandomPoemIndex(notebook: PoemNotebookId = 'all'): Promise<PoemIndex> {
  const bridge = getDesktopBridge()
  if (bridge) {
    return bridge.getRandomPoemIndex(notebook)
  }
  const usp = new URLSearchParams()
  if (notebook !== 'all') usp.set('notebook', notebook)
  const qs = usp.toString()
  return fetchJSON<PoemIndex>(`/api/poems/random${qs ? `?${qs}` : ''}`)
}

/** 获取今日诗词索引 */
export async function getDailyPoemIndex(notebook: PoemNotebookId = 'all'): Promise<PoemIndex> {
  const bridge = getDesktopBridge()
  if (bridge) {
    return bridge.getDailyPoemIndex(notebook)
  }
  const usp = new URLSearchParams()
  if (notebook !== 'all') usp.set('notebook', notebook)
  const qs = usp.toString()
  return fetchJSON<PoemIndex>(`/api/poems/daily${qs ? `?${qs}` : ''}`)
}

/** 获取诗词本列表 */
export async function getPoemNotebooks(): Promise<PoemNotebook[]> {
  const bridge = getDesktopBridge()
  if (bridge) {
    return bridge.getPoemNotebooks()
  }
  const res = await fetchJSON<{ items: PoemNotebook[] }>('/api/notebooks')
  return res.items
}

/** 加载清单 */
export async function loadManifest(): Promise<Manifest> {
  if (manifestCache) return manifestCache
  const bridge = getDesktopBridge()
  if (bridge) {
    manifestCache = await bridge.loadManifest()
    return manifestCache
  }
  manifestCache = await fetchJSON<Manifest>('/data/manifest.json')
  return manifestCache
}

/** 获取所有朝代 */
export async function getAllDynasties(): Promise<string[]> {
  const manifest = await loadManifest()
  return manifest.dynasties
}

/** 获取所有作者 */
export async function getAllAuthors(): Promise<string[]> {
  const manifest = await loadManifest()
  return manifest.authors
}

/** 获取所有标签 */
export async function getAllTags(): Promise<string[]> {
  const manifest = await loadManifest()
  return manifest.tags
}
