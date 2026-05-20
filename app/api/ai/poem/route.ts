import { NextResponse } from 'next/server'
import {
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_MODEL,
  normalizeAiBaseUrl,
  normalizeAiModel,
  requestCompatibleChatCompletion,
  toChatMessages,
} from '@/lib/ai/compatible'
import { generatePrompt } from '@/lib/ai/prompts'
import { guardAiRoute, readLimitedJsonBody } from '@/lib/ai/server-guard'
import { AiPoemRequest, AiPoemTask } from '@/lib/ai/types'
import { getPoemById } from '@/lib/server-poems'

export const runtime = 'nodejs'

function isTask(input: unknown): input is AiPoemTask {
  return input === 'analysis' || input === 'annotation' || input === 'recitation'
}

function asLimitedString(input: unknown, max = 96): string {
  return typeof input === 'string' ? input.slice(0, max) : ''
}

function normalizeStudyRecord(input: unknown): AiPoemRequest['studyRecord'] {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const reviewCount = typeof raw.reviewCount === 'number' && Number.isFinite(raw.reviewCount)
    ? Math.max(0, Math.min(999, Math.floor(raw.reviewCount)))
    : 0
  return {
    viewedAt: asLimitedString(raw.viewedAt, 64),
    memorized: raw.memorized === true,
    reviewCount,
    favorite: raw.favorite === true,
  }
}

function normalizeRecite(input: unknown): AiPoemRequest['recite'] {
  if (!input || typeof input !== 'object') return undefined
  const raw = input as Record<string, unknown>
  const mode = raw.mode === 'read' || raw.mode === 'mask' || raw.mode === 'line' || raw.mode === 'test'
    ? raw.mode
    : undefined
  return {
    mode,
    scope: asLimitedString(raw.scope, 128),
    scopeName: asLimitedString(raw.scopeName, 128),
  }
}

async function normalizeRequest(input: unknown): Promise<AiPoemRequest | null> {
  if (!input || typeof input !== 'object') return null
  const raw = input as Partial<AiPoemRequest>
  if (!isTask(raw.task)) return null
  const poemId = raw.poem && typeof raw.poem === 'object' ? String(raw.poem.id || '') : ''
  if (!poemId) return null
  const poem = await getPoemById(poemId)
  if (!poem) return null

  return {
    task: raw.task,
    poem: {
      id: String(poem.id),
      title: String(poem.title),
      author: String(poem.author),
      dynasty: String(poem.dynasty),
      content: poem.content.map(String),
      annotation: Array.isArray(poem.annotation) ? poem.annotation.map(String) : [],
      translation: Array.isArray(poem.translation) ? poem.translation.map(String) : [],
      appreciation: typeof poem.appreciation === 'string' ? poem.appreciation : '',
      tags: Array.isArray(poem.tags) ? poem.tags.map(String) : [],
    },
    studyRecord: normalizeStudyRecord(raw.studyRecord),
    recite: normalizeRecite(raw.recite),
  }
}

export async function POST(req: Request) {
  const blocked = guardAiRoute(req)
  if (blocked) return blocked

  const apiKey = process.env.AI_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI 服务还没有配置，请先设置 AI_API_KEY。' },
      { status: 503 }
    )
  }

  const body = await readLimitedJsonBody(req)
  if (!body.ok) return body.response

  const input = await normalizeRequest(body.value)
  if (!input) {
    return NextResponse.json({ error: '缺少生成所需的诗词信息。' }, { status: 400 })
  }

  const model = normalizeAiModel(process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL)
  const baseUrl = normalizeAiBaseUrl(process.env.AI_BASE_URL?.trim() || DEFAULT_AI_BASE_URL)
  const prompt = generatePrompt(input)

  try {
    const result = await requestCompatibleChatCompletion(
      { apiKey, baseUrl, model },
      toChatMessages(prompt.system, prompt.user)
    )
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'AI 服务连接失败，请稍后再试。'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
