import {
  AI_REQUEST_TIMEOUT_MS,
  assertSafeAiBaseUrl,
  buildChatCompletionBody,
  extractAiText,
  getProviderError,
  normalizeAiModel,
  parseCompatiblePayload,
} from '@/lib/ai/compatible'
import { AiChatMessage, AiPoemResponse, AiSettings } from '@/lib/ai/types'

export async function requestNativeChatCompletion(
  settings: AiSettings,
  messages: AiChatMessage[],
  maxTokens = 900
): Promise<AiPoemResponse> {
  const { CapacitorHttp } = await import('@capacitor/core')
  const baseUrl = assertSafeAiBaseUrl(settings.baseUrl)
  const response = await CapacitorHttp.post({
    url: `${baseUrl}/chat/completions`,
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json',
    },
    data: buildChatCompletionBody(settings, messages, maxTokens),
    connectTimeout: AI_REQUEST_TIMEOUT_MS,
    readTimeout: AI_REQUEST_TIMEOUT_MS,
  })

  const payload = parseCompatiblePayload(response.data)
  if (response.status < 200 || response.status >= 300) {
    throw new Error(getProviderError(response.status, payload))
  }

  const text = extractAiText(payload)
  if (!text) throw new Error('AI 没有返回可用内容，请重新生成。')
  return { text, model: normalizeAiModel(settings.model) }
}
