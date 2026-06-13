import { AiPoemTask } from '@/lib/ai/types'

const AI_CACHE_PREFIX = 'shici-ai-cache'
const AI_CACHE_VERSION = 'v2'

export type AiCacheInput = {
  poemId: string
  task: AiPoemTask
  model: string
  context: string
}

function hashCacheIdentity(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function getAiCacheKey(input: AiCacheInput): string {
  const identity = JSON.stringify({ model: input.model, context: input.context })
  return `${AI_CACHE_PREFIX}:${AI_CACHE_VERSION}:${input.task}:${input.poemId}:${hashCacheIdentity(identity)}`
}

export function readAiCache(input: AiCacheInput): string | null {
  if (typeof window === 'undefined') return null
  try {
    const value = localStorage.getItem(getAiCacheKey(input))
    return value?.trim() || null
  } catch {
    return null
  }
}

export function writeAiCache(input: AiCacheInput, text: string): void {
  if (typeof window === 'undefined') return
  const normalized = text.trim()
  if (!normalized) return
  try {
    localStorage.setItem(getAiCacheKey(input), normalized)
  } catch {
    // Cache failures must not block AI output.
  }
}
