import { NextResponse } from 'next/server'
import {
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_MODEL,
  normalizeAiBaseUrl,
  normalizeAiModel,
  requestCompatibleChatCompletion,
  toChatMessages,
} from '@/lib/ai/compatible'
import { guardAiRoute } from '@/lib/ai/server-guard'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const blocked = guardAiRoute(req, { rateLimitMax: 6 })
  if (blocked) return blocked

  const apiKey = process.env.AI_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, message: 'AI 服务还没有配置，请先设置 AI_API_KEY。' },
      { status: 503 }
    )
  }

  try {
    await requestCompatibleChatCompletion(
      {
        apiKey,
        baseUrl: normalizeAiBaseUrl(process.env.AI_BASE_URL?.trim() || DEFAULT_AI_BASE_URL),
        model: normalizeAiModel(process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL),
      },
      toChatMessages('你是连通性测试助手。', '请只回复 OK。'),
      16
    )
    return NextResponse.json({ ok: true, message: '连接测试通过。' })
  } catch (e) {
    const message = e instanceof Error ? e.message : '连接测试失败。'
    return NextResponse.json({ ok: false, message }, { status: 502 })
  }
}
