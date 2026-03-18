// 完整诗词（存在分片文件中）
export type Poem = {
  id: string
  title: string
  author: string
  dynasty: string
  content: string[]
  annotation: string[]
  translation: string[]
  appreciation: string
  tags: string[]
  source?: string  // 数据来源：local | chinese-poetry | vmijunv
}

// 轻量索引条目（存在 index.json 中，首屏加载）
export type PoemIndex = {
  id: string
  title: string
  author: string
  dynasty: string
  tags: string[]
  preview: string  // 前两句预览
  source?: string
  shard: number    // 所在分片编号，用于按需加载
  hasAnnotation?: boolean
}

// 分片文件结构（按编号分片，不再按朝代）
export type PoemShard = {
  shard: number
  poems: Poem[]
}

// 清单
export type Manifest = {
  total: number
  shardSize: number
  shards: { file: string; index: number; count: number; size: number }[]
  dynasties: string[]
  authors: string[]
  tags: string[]
  sources: string[]
  generatedAt: string
}

export type StudyRecord = {
  poemId: string
  shard?: number
  viewedAt: string
  memorized: boolean
  reviewCount: number
  favorite: boolean
}

export type FontSize = 'small' | 'medium' | 'large'

export type ViewMode = 'original' | 'annotated' | 'appreciation' | 'all'

export type ReciteMode = 'read' | 'mask' | 'line' | 'test'

export type BuiltinPoemNotebookId = 'all' | 'annotated' | 'plain'

export type PoemNotebookId = BuiltinPoemNotebookId | (string & {})

export type ReciteScopeId = PoemNotebookId | `group:${string}`

export type PoemNotebook = {
  id: PoemNotebookId
  name: string
  description: string
  count: number
}

export type MatchField = 'title' | 'author' | 'tag' | 'content'

export type PoemSearchHit = PoemIndex & {
  matchedLines: string[]
  matchFields: MatchField[]
}

export type FullTextSearchResult = {
  items: PoemSearchHit[]
  total: number | null
  offset: number
  limit: number
  hasMore: boolean
  nextOffset: number
}

export type PoemGroup = {
  id: string
  name: string
  poemIds: string[]
  createdAt: string
  updatedAt: string
}
