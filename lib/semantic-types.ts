export type SemanticTagType = 'topic' | 'emotion' | 'image' | 'style' | 'difficulty' | 'form'

export type SemanticTagSource = 'rule' | 'llm' | 'embedding_cluster' | 'human'

export type SemanticTagRecord = {
  tag_name: string
  tag_type: SemanticTagType
  score: number
  source: SemanticTagSource
  created_at: string
  rule_id?: string
  cluster_id?: string
}

export type SemanticTagShardPoem = {
  poemId: string
  tags: SemanticTagRecord[]
}

export type SemanticTagShard = {
  shard: number
  version: string
  generatedAt: string
  poems: SemanticTagShardPoem[]
}

export type SemanticRecommendationBreakdown = {
  semanticSimilarity: number
  tagOverlap: number
  difficultyFit: number
  weaknessMatch: number
  popularity: number
  repeatPenalty: number
}

export type SemanticRecommendation = {
  poem_id: string
  score: number
  reason: string
  breakdown: SemanticRecommendationBreakdown
}

export type SemanticRecommendationItem = {
  poemId: string
  recommendations: SemanticRecommendation[]
}

export type SemanticRecommendationShard = {
  shard: number
  version: string
  generatedAt: string
  items: SemanticRecommendationItem[]
}

export type SemanticRoutePoemItem = {
  poem_id: string
  reason: string
  difficulty_note?: string
  review_hint?: string
}

export type SemanticRoute = {
  route_id: string
  title: string
  description: string
  target_level: string
  related_images: string[]
  emotion_curve: string[]
  review_plan: Record<string, string>
  poem_sequence: SemanticRoutePoemItem[]
}

export type SemanticRoutesFile = {
  version: string
  generatedAt: string
  routes: SemanticRoute[]
}

export type ImageryNode = {
  id: string
  name: string
  frequency: number
}

export type ImageryEdge = {
  source: string
  target: string
  count: number
  score: number
}

export type SemanticImageryGraph = {
  version: string
  generatedAt: string
  nodes: ImageryNode[]
  edges: ImageryEdge[]
}

export type SemanticFeatureFlags = {
  semanticEnabled: boolean
  tagPanelEnabled: boolean
  recommendationEnabled: boolean
  routesEnabled: boolean
  imageryGraphEnabled: boolean
  visualGenerationEnabled: boolean
}

export type SemanticManifest = {
  version: string
  generatedAt: string
  baseProfile: string
  processedShards: number
  processedPoems: number
  dirs: Record<string, string>
  taxonomy: Record<string, string[]>
}
