const fs = require('node:fs')
const path = require('node:path')
const { safeStorage } = require('electron')

const DEFAULT_AI_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_AI_MODEL = 'gpt-4o-mini'
const REQUEST_TIMEOUT_MS = 45000

function normalizeBaseUrl(value) {
  const trimmed = typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_AI_BASE_URL
  return trimmed.replace(/\/+$/, '')
}

function isLoopbackHost(hostname) {
  return (
    hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname.startsWith('127.')
    || hostname === '::1'
    || hostname === '[::1]'
  )
}

function assertSafeBaseUrl(value) {
  const normalized = normalizeBaseUrl(value)
  let parsed
  try {
    parsed = new URL(normalized)
  } catch {
    throw new Error('Base URL 格式不正确，请填写完整的 https:// 地址。')
  }
  if (parsed.username || parsed.password) {
    throw new Error('Base URL 不能包含用户名或密码。')
  }
  if (parsed.search || parsed.hash) {
    throw new Error('Base URL 不能包含查询参数或片段。')
  }
  if (parsed.protocol === 'https:') return normalized
  if (parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname)) return normalized
  throw new Error('Base URL 必须使用 https://，本机 localhost 调试地址除外。')
}

function normalizeModel(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_AI_MODEL
}

function safeReadJson(filePath) {
  if (!fs.existsSync(filePath)) return {}
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return {}
  }
}

function safeWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value), 'utf8')
}

function getStorageWarning() {
  if (!safeStorage.isEncryptionAvailable()) {
    return '当前系统没有可用的安全存储，无法保存 API Key。'
  }
  if (
    typeof safeStorage.getSelectedStorageBackend === 'function'
    && safeStorage.getSelectedStorageBackend() === 'basic_text'
  ) {
    return '当前 Linux 环境使用 basic_text 存储后端，安全性弱于系统密钥环。'
  }
  return undefined
}

function getProviderError(status, payload) {
  const providerMessage = payload && payload.error && typeof payload.error.message === 'string'
    ? payload.error.message.trim()
    : ''
  if (providerMessage) return providerMessage
  if (status === 401 || status === 403) return 'AI 服务认证失败，请检查 API Key。'
  if (status === 429) return 'AI 服务请求受限或额度不足，请稍后再试。'
  if (status >= 500) return 'AI 服务暂时不可用，请稍后再试。'
  return 'AI 生成失败，请稍后再试。'
}

async function readProviderPayload(res) {
  try {
    return await res.json()
  } catch {
    return {}
  }
}

function createAiSettingsService({ userDataDir }) {
  const settingsPath = path.join(userDataDir, 'ai-settings.json')
  const state = {
    encryptedApiKey: '',
    baseUrl: DEFAULT_AI_BASE_URL,
    model: DEFAULT_AI_MODEL,
    ...safeReadJson(settingsPath),
  }

  function persist() {
    safeWriteJson(settingsPath, {
      encryptedApiKey: state.encryptedApiKey || '',
      baseUrl: assertSafeBaseUrl(state.baseUrl),
      model: normalizeModel(state.model),
    })
  }

  function encryptApiKey(apiKey) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('当前系统没有可用的安全存储，无法保存 API Key。')
    }
    return safeStorage.encryptString(apiKey).toString('base64')
  }

  function decryptApiKey() {
    if (!state.encryptedApiKey) return ''
    if (!safeStorage.isEncryptionAvailable()) return ''
    try {
      return safeStorage.decryptString(Buffer.from(state.encryptedApiKey, 'base64'))
    } catch {
      return ''
    }
  }

  function getStatus() {
    const warning = getStorageWarning()
    return {
      hasApiKey: Boolean(decryptApiKey()),
      baseUrl: normalizeBaseUrl(state.baseUrl),
      model: normalizeModel(state.model),
      source: 'desktop',
      editable: safeStorage.isEncryptionAvailable(),
      secure: safeStorage.isEncryptionAvailable() && warning === undefined,
      warning,
    }
  }

  function saveSettings(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('AI 设置格式不正确。')
    }
    const nextKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : ''
    if (nextKey) state.encryptedApiKey = encryptApiKey(nextKey)
    state.baseUrl = assertSafeBaseUrl(input.baseUrl)
    state.model = normalizeModel(input.model)
    persist()
    return getStatus()
  }

  function clearSettings() {
    state.encryptedApiKey = ''
    state.baseUrl = DEFAULT_AI_BASE_URL
    state.model = DEFAULT_AI_MODEL
    persist()
    return getStatus()
  }

  function getPrivateSettings(override = {}) {
    const overrideKey = typeof override.apiKey === 'string' ? override.apiKey.trim() : ''
    const apiKey = overrideKey || decryptApiKey()
    if (!apiKey) throw new Error('请先到“我的”页配置 API Key。')
    return {
      apiKey,
      baseUrl: assertSafeBaseUrl(override.baseUrl || state.baseUrl),
      model: normalizeModel(override.model || state.model),
    }
  }

  async function requestChatCompletion(settings, messages, maxTokens = 900) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const baseUrl = assertSafeBaseUrl(settings.baseUrl)
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: normalizeModel(settings.model),
          messages: Array.isArray(messages) ? messages : [],
          temperature: 0.35,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      })

      const payload = await readProviderPayload(res)
      if (!res.ok) throw new Error(getProviderError(res.status, payload))
      const text = payload && payload.choices && payload.choices[0]?.message?.content?.trim()
      if (!text) throw new Error('AI 没有返回可用内容，请重新生成。')
      return { text, model: normalizeModel(settings.model) }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('AI 生成超时，请稍后再试。')
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  async function generatePoem(payload) {
    const settings = getPrivateSettings()
    return requestChatCompletion(settings, payload && payload.messages)
  }

  async function testSettings(input = {}) {
    const settings = getPrivateSettings(input)
    await requestChatCompletion(
      settings,
      [
        { role: 'system', content: '你是连通性测试助手。' },
        { role: 'user', content: '请只回复 OK。' },
      ],
      16
    )
    return { ok: true, message: '连接测试通过。' }
  }

  return {
    getStatus,
    saveSettings,
    clearSettings,
    generatePoem,
    testSettings,
  }
}

module.exports = { createAiSettingsService }
