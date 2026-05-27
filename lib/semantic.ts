import {
  SemanticFeatureFlags,
  SemanticImageryGraph,
  SemanticManifest,
  SemanticRecommendation,
  SemanticRecommendationShard,
  SemanticRoute,
  SemanticRoutesFile,
  SemanticTagRecord,
  SemanticTagShard,
} from '@/lib/semantic-types'

const SEMANTIC_BASE_URL = '/data/semantic'

export const DEFAULT_SEMANTIC_FEATURES: SemanticFeatureFlags = {
  semanticEnabled: false,
  tagPanelEnabled: false,
  recommendationEnabled: false,
  routesEnabled: false,
  imageryGraphEnabled: false,
  visualGenerationEnabled: false,
}

let featureCache: SemanticFeatureFlags | null = null
let manifestCache: SemanticManifest | null = null
let routesCache: SemanticRoute[] | null = null
let imageryCache: SemanticImageryGraph | null = null
const tagShardCache = new Map<number, Map<string, SemanticTagRecord[]>>()
const recoShardCache = new Map<number, Map<string, SemanticRecommendation[]>>()

function normalizeFeatureFlags(input: Partial<SemanticFeatureFlags> | null | undefined): SemanticFeatureFlags {
  if (!input) return { ...DEFAULT_SEMANTIC_FEATURES }
  return {
    semanticEnabled: Boolean(input.semanticEnabled),
    tagPanelEnabled: Boolean(input.tagPanelEnabled),
    recommendationEnabled: Boolean(input.recommendationEnabled),
    routesEnabled: Boolean(input.routesEnabled),
    imageryGraphEnabled: Boolean(input.imageryGraphEnabled),
    visualGenerationEnabled: Boolean(input.visualGenerationEnabled),
  }
}

async function fetchJsonOrNull<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return await res.json() as T
  } catch {
    return null
  }
}

export async function loadSemanticFeatures(): Promise<SemanticFeatureFlags> {
  if (featureCache) return featureCache
  const raw = await fetchJsonOrNull<Partial<SemanticFeatureFlags>>(`${SEMANTIC_BASE_URL}/features.json`)
  featureCache = normalizeFeatureFlags(raw)
  return featureCache
}

export async function loadSemanticManifest(): Promise<SemanticManifest | null> {
  if (manifestCache) return manifestCache
  const raw = await fetchJsonOrNull<SemanticManifest>(`${SEMANTIC_BASE_URL}/manifest.json`)
  manifestCache = raw
  return manifestCache
}

async function loadTagShard(shard: number): Promise<Map<string, SemanticTagRecord[]> | null> {
  if (!Number.isInteger(shard) || shard < 0) return null
  const cached = tagShardCache.get(shard)
  if (cached) return cached

  const raw = await fetchJsonOrNull<SemanticTagShard>(`${SEMANTIC_BASE_URL}/poem-tags/st-${shard}.json`)
  if (!raw || !Array.isArray(raw.poems)) return null

  const byPoem = new Map<string, SemanticTagRecord[]>()
  for (const item of raw.poems) {
    const poemId = typeof item?.poemId === 'string' ? item.poemId : ''
    if (!poemId) continue
    byPoem.set(poemId, Array.isArray(item.tags) ? item.tags : [])
  }
  tagShardCache.set(shard, byPoem)
  return byPoem
}

async function loadRecoShard(shard: number): Promise<Map<string, SemanticRecommendation[]> | null> {
  if (!Number.isInteger(shard) || shard < 0) return null
  const cached = recoShardCache.get(shard)
  if (cached) return cached

  const raw = await fetchJsonOrNull<SemanticRecommendationShard>(`${SEMANTIC_BASE_URL}/poem-reco/rs-${shard}.json`)
  if (!raw || !Array.isArray(raw.items)) return null

  const byPoem = new Map<string, SemanticRecommendation[]>()
  for (const item of raw.items) {
    const poemId = typeof item?.poemId === 'string' ? item.poemId : ''
    if (!poemId) continue
    byPoem.set(poemId, Array.isArray(item.recommendations) ? item.recommendations : [])
  }
  recoShardCache.set(shard, byPoem)
  return byPoem
}

export async function loadPoemSemanticTags(poemId: string, shard: number): Promise<SemanticTagRecord[]> {
  const features = await loadSemanticFeatures()
  if (!features.semanticEnabled || !features.tagPanelEnabled) return []

  const map = await loadTagShard(shard)
  if (!map) return []
  const tags = map.get(poemId) || []
  return tags
    .slice()
    .sort((a, b) => b.score - a.score || a.tag_type.localeCompare(b.tag_type))
}

export async function loadPoemSemanticRecommendations(poemId: string, shard: number): Promise<SemanticRecommendation[]> {
  const features = await loadSemanticFeatures()
  if (!features.semanticEnabled || !features.recommendationEnabled) return []

  const map = await loadRecoShard(shard)
  if (!map) return []
  const items = map.get(poemId) || []
  return items.slice().sort((a, b) => b.score - a.score)
}

export async function loadSemanticRoutes(): Promise<SemanticRoute[]> {
  const features = await loadSemanticFeatures()
  if (!features.semanticEnabled || !features.routesEnabled) return []
  if (routesCache) return routesCache

  const raw = await fetchJsonOrNull<SemanticRoutesFile>(`${SEMANTIC_BASE_URL}/routes/routes.json`)
  routesCache = raw && Array.isArray(raw.routes) ? raw.routes : []
  return routesCache
}

export async function loadSemanticImageryGraph(): Promise<SemanticImageryGraph | null> {
  const features = await loadSemanticFeatures()
  if (!features.semanticEnabled || !features.imageryGraphEnabled) return null
  if (imageryCache) return imageryCache

  const raw = await fetchJsonOrNull<SemanticImageryGraph>(`${SEMANTIC_BASE_URL}/imagery/graph.json`)
  imageryCache = raw
  return imageryCache
}
