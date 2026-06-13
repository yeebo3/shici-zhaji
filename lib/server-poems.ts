import path from 'node:path'
import {
  FullTextSearchResult,
  Manifest,
  Poem,
  PoemIndex,
  PoemNotebook,
  PoemNotebookId,
} from './types'

type PoemQueryOptions = {
  q?: string
  dynasty?: string
  author?: string
  tag?: string
  notebook?: PoemNotebookId
  offset: number
  limit: number
}

type PoemQueryResult = {
  items: PoemIndex[]
  total: number
  offset: number
  limit: number
  hasMore: boolean
}

type FullTextOptions = {
  q: string
  offset: number
  limit: number
  notebook?: PoemNotebookId
  withTotal?: boolean
}

type PoemsService = {
  queryPoemIndex: (opts: PoemQueryOptions) => Promise<PoemQueryResult>
  searchPoemsFullText: (opts: FullTextOptions) => Promise<FullTextSearchResult>
  listPoemNotebooks: () => Promise<PoemNotebook[]>
  getPoemById: (id: string, shardHint?: number) => Promise<Poem | null>
  getPoemIndexById: (id: string) => Promise<PoemIndex | null>
  getPoemIndexByIds: (ids: string[]) => Promise<PoemIndex[]>
  getRandomPoemIndex: (notebook?: PoemNotebookId) => Promise<PoemIndex>
  getDailyPoemIndex: (notebook?: PoemNotebookId) => Promise<PoemIndex>
  loadManifest: () => Promise<Manifest>
}

type PoemsServiceModule = {
  createPoemsService: (options: { dataDir: string }) => PoemsService
}

// The desktop and web runtimes use the same SQLite-backed query implementation.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPoemsService } = require('../electron/poems-service.cjs') as PoemsServiceModule

const service = createPoemsService({
  dataDir: path.join(process.cwd(), 'public', 'data'),
})

export const queryPoemIndex = service.queryPoemIndex
export const searchPoemsFullText = service.searchPoemsFullText
export const listPoemNotebooks = service.listPoemNotebooks
export const getPoemById = service.getPoemById
export const getPoemIndexById = service.getPoemIndexById
export const getPoemIndexByIds = service.getPoemIndexByIds
export const getRandomPoemIndex = service.getRandomPoemIndex
export const getDailyPoemIndex = service.getDailyPoemIndex
export const loadManifest = service.loadManifest
