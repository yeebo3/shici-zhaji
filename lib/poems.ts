import { FullTextSearchResult, Manifest, Poem, PoemIndex, PoemNotebook, PoemNotebookId } from './types'

export type PoemQuery = {
  q?: string
  dynasty?: string
  author?: string
  tag?: string
  notebook?: PoemNotebookId
  offset?: number
  limit?: number
}

export type PoemQueryResult = {
  items: PoemIndex[]
  total: number
  offset: number
  limit: number
  hasMore: boolean
}

let manifestCache: Manifest | null = null

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url)
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
  const qs = buildQueryString(query)
  const url = `/api/poems${qs ? `?${qs}` : ''}`
  return fetchJSON<PoemQueryResult>(url)
}

/** 兼容旧接口：返回第一页 */
export async function getAllPoemIndex(): Promise<PoemIndex[]> {
  const res = await queryPoems({ offset: 0, limit: 120 })
  return res.items
}

/** 搜索（默认返回第一页） */
export async function searchPoems(query: string): Promise<PoemIndex[]> {
  const res = await queryPoems({ q: query, offset: 0, limit: 120 })
  return res.items
}

/** 全文搜索（标题/作者/标签/诗句） */
export async function searchPoemsFullText(params: {
  q: string
  offset?: number
  limit?: number
  notebook?: PoemNotebookId
}): Promise<FullTextSearchResult> {
  const usp = new URLSearchParams()
  usp.set('q', params.q)
  usp.set('offset', String(params.offset ?? 0))
  usp.set('limit', String(params.limit ?? 120))
  if (params.notebook) usp.set('notebook', params.notebook)
  return fetchJSON<FullTextSearchResult>(`/api/poems/fulltext?${usp.toString()}`)
}

/** 按朝代筛选（默认返回第一页） */
export async function getPoemsByDynasty(dynasty: string): Promise<PoemIndex[]> {
  const res = await queryPoems({ dynasty, offset: 0, limit: 120 })
  return res.items
}

/** 按作者筛选（默认返回第一页） */
export async function getPoemsByAuthor(author: string): Promise<PoemIndex[]> {
  const res = await queryPoems({ author, offset: 0, limit: 120 })
  return res.items
}

/** 按标签筛选（默认返回第一页） */
export async function getPoemsByTag(tag: string): Promise<PoemIndex[]> {
  const res = await queryPoems({ tag, offset: 0, limit: 120 })
  return res.items
}

/** 获取完整诗词 */
export async function getPoemById(id: string): Promise<Poem | null> {
  try {
    return await fetchJSON<Poem>(`/api/poems/${encodeURIComponent(id)}`)
  } catch {
    return null
  }
}

/** 获取单个索引 */
export async function getPoemIndexById(id: string): Promise<PoemIndex | null> {
  try {
    return await fetchJSON<PoemIndex>(`/api/poems/index/${encodeURIComponent(id)}`)
  } catch {
    return null
  }
}

/** 批量获取索引（用于我的学习页） */
export async function getPoemIndexByIds(ids: string[]): Promise<PoemIndex[]> {
  if (ids.length === 0) return []
  const q = ids.map(encodeURIComponent).join(',')
  const res = await fetchJSON<{ items: PoemIndex[] }>(`/api/poems/by-ids?ids=${q}`)
  return res.items
}

/** 获取随机诗词索引 */
export async function getRandomPoemIndex(notebook: PoemNotebookId = 'all'): Promise<PoemIndex> {
  const usp = new URLSearchParams()
  if (notebook !== 'all') usp.set('notebook', notebook)
  const qs = usp.toString()
  return fetchJSON<PoemIndex>(`/api/poems/random${qs ? `?${qs}` : ''}`)
}

/** 获取今日诗词索引 */
export async function getDailyPoemIndex(notebook: PoemNotebookId = 'all'): Promise<PoemIndex> {
  const usp = new URLSearchParams()
  if (notebook !== 'all') usp.set('notebook', notebook)
  const qs = usp.toString()
  return fetchJSON<PoemIndex>(`/api/poems/daily${qs ? `?${qs}` : ''}`)
}

/** 获取诗词本列表 */
export async function getPoemNotebooks(): Promise<PoemNotebook[]> {
  const res = await fetchJSON<{ items: PoemNotebook[] }>('/api/notebooks')
  return res.items
}

/** 加载清单 */
export async function loadManifest(): Promise<Manifest> {
  if (manifestCache) return manifestCache
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
