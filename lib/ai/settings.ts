import { DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL, assertSafeAiBaseUrl, normalizeAiBaseUrl, normalizeAiModel, toChatMessages } from '@/lib/ai/compatible'
import { getDesktopAiSettingsBridge } from '@/lib/ai/desktop-bridge'
import { requestNativeChatCompletion } from '@/lib/ai/native-client'
import { AiSettings, AiSettingsInput, AiSettingsStatus, AiTestResult } from '@/lib/ai/types'

const STORAGE_PREFIX = 'shici-ai_'
const API_KEY_KEY = 'api-key'
const BASE_URL_KEY = 'base-url'
const MODEL_KEY = 'model'
const NATIVE_STORAGE_READ_TIMEOUT_MS = 4000
const NATIVE_STORAGE_WRITE_TIMEOUT_MS = 8000
const FALLBACK_STORAGE_PREFIX = `${STORAGE_PREFIX}fallback_`
const FALLBACK_WARNING = '安卓安全存储暂不可用，API Key 只会保留在当前应用会话内；重启后需要重新输入。'
let nativeFallbackApiKey = ''

type ServerStatusPayload = Partial<AiSettingsStatus> & {
  error?: string
}

async function isNativeRuntime(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  try {
    const { Capacitor } = await import('@capacitor/core')
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

async function getSecureStorage() {
  const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
  await SecureStorage.setKeyPrefix(STORAGE_PREFIX)
  return SecureStorage
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs)
  })
  return Promise.race([
    operation.finally(() => {
      if (timeout) clearTimeout(timeout)
    }),
    timeoutPromise,
  ])
}

function getNativeFallbackItem(key: string): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(`${FALLBACK_STORAGE_PREFIX}${key}`) || ''
  } catch {
    return ''
  }
}

function takeLegacyNativeFallbackApiKey(): string {
  const legacy = getNativeFallbackItem(API_KEY_KEY)
  if (!legacy) return ''
  setNativeFallbackItem(API_KEY_KEY, '')
  nativeFallbackApiKey = legacy
  return legacy
}

function setNativeFallbackItem(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    if (value) {
      window.localStorage.setItem(`${FALLBACK_STORAGE_PREFIX}${key}`, value)
    } else {
      window.localStorage.removeItem(`${FALLBACK_STORAGE_PREFIX}${key}`)
    }
  } catch {
    // Ignore storage failures; the caller will still surface the current status.
  }
}

function getNativeFallbackSettings(): AiSettings {
  return {
    apiKey: nativeFallbackApiKey || takeLegacyNativeFallbackApiKey(),
    baseUrl: normalizeAiBaseUrl(getNativeFallbackItem(BASE_URL_KEY) || DEFAULT_AI_BASE_URL),
    model: normalizeAiModel(getNativeFallbackItem(MODEL_KEY) || DEFAULT_AI_MODEL),
  }
}

function getNativeFallbackStatus(warning = FALLBACK_WARNING): AiSettingsStatus {
  const settings = getNativeFallbackSettings()
  return {
    hasApiKey: Boolean(settings.apiKey),
    baseUrl: settings.baseUrl,
    model: settings.model,
    source: 'native',
    editable: true,
    secure: false,
    warning,
  }
}

function saveNativeFallbackSettings(input: AiSettingsInput): AiSettingsStatus {
  const existing = getNativeFallbackSettings()
  const apiKey = input.apiKey?.trim() || existing.apiKey
  const baseUrl = assertSafeAiBaseUrl(input.baseUrl)
  const model = normalizeAiModel(input.model)
  nativeFallbackApiKey = apiKey
  setNativeFallbackItem(API_KEY_KEY, '')
  setNativeFallbackItem(BASE_URL_KEY, baseUrl)
  setNativeFallbackItem(MODEL_KEY, model)
  return getNativeFallbackStatus()
}

function clearNativeFallbackSettings(): void {
  nativeFallbackApiKey = ''
  setNativeFallbackItem(API_KEY_KEY, '')
  setNativeFallbackItem(BASE_URL_KEY, '')
  setNativeFallbackItem(MODEL_KEY, '')
}

async function getSecureNativeSettings(): Promise<AiSettings> {
  const storage = await getSecureStorage()
  const [apiKey, baseUrl, model] = await Promise.all([
    storage.getItem(API_KEY_KEY),
    storage.getItem(BASE_URL_KEY),
    storage.getItem(MODEL_KEY),
  ])
  return {
    apiKey: apiKey || '',
    baseUrl: normalizeAiBaseUrl(baseUrl || DEFAULT_AI_BASE_URL),
    model: normalizeAiModel(model || DEFAULT_AI_MODEL),
  }
}

async function getNativeSettings(): Promise<AiSettings> {
  try {
    const settings = await withTimeout(
      getSecureNativeSettings(),
      NATIVE_STORAGE_READ_TIMEOUT_MS,
      '安卓安全存储读取超时。'
    )
    const fallback = getNativeFallbackSettings()
    return !settings.apiKey && fallback.apiKey ? fallback : settings
  } catch {
    return getNativeFallbackSettings()
  }
}

async function getNativeStatus(): Promise<AiSettingsStatus> {
  try {
    const settings = await withTimeout(
      getSecureNativeSettings(),
      NATIVE_STORAGE_READ_TIMEOUT_MS,
      '安卓安全存储读取超时。'
    )
    const fallback = getNativeFallbackSettings()
    if (!settings.apiKey && fallback.apiKey) {
      return getNativeFallbackStatus('当前使用安卓备用本地存储中的 API Key。')
    }
    return {
      hasApiKey: Boolean(settings.apiKey),
      baseUrl: settings.baseUrl,
      model: settings.model,
      source: 'native',
      editable: true,
      secure: true,
    }
  } catch {
    return getNativeFallbackStatus()
  }
}

async function saveNativeSettings(input: AiSettingsInput): Promise<AiSettingsStatus> {
  const baseUrl = assertSafeAiBaseUrl(input.baseUrl)
  const model = normalizeAiModel(input.model)
  try {
    const storage = await withTimeout(
      getSecureStorage(),
      NATIVE_STORAGE_READ_TIMEOUT_MS,
      '安卓安全存储读取超时。'
    )
    await withTimeout(
      Promise.all([
        input.apiKey?.trim() ? storage.setItem(API_KEY_KEY, input.apiKey.trim()) : Promise.resolve(),
        storage.setItem(BASE_URL_KEY, baseUrl),
        storage.setItem(MODEL_KEY, model),
      ]),
      NATIVE_STORAGE_WRITE_TIMEOUT_MS,
      '安卓安全存储保存超时。'
    )
    clearNativeFallbackSettings()
    return getNativeStatus()
  } catch {
    return saveNativeFallbackSettings({ ...input, baseUrl, model })
  }
}

async function clearNativeSettings(): Promise<AiSettingsStatus> {
  clearNativeFallbackSettings()
  try {
    const storage = await withTimeout(
      getSecureStorage(),
      NATIVE_STORAGE_READ_TIMEOUT_MS,
      '安卓安全存储读取超时。'
    )
    await withTimeout(
      Promise.all([
        storage.removeItem(API_KEY_KEY),
        storage.removeItem(BASE_URL_KEY),
        storage.removeItem(MODEL_KEY),
      ]),
      NATIVE_STORAGE_WRITE_TIMEOUT_MS,
      '安卓安全存储清除超时。'
    )
    return getNativeStatus()
  } catch {
    return getNativeFallbackStatus('已清除安卓备用本地存储；安全存储未响应，如仍显示已配置，请重启后再清除一次。')
  }
}

async function getServerStatus(): Promise<AiSettingsStatus> {
  try {
    const res = await fetch('/api/ai/settings')
    if (!res.ok) throw new Error('server unavailable')
    const payload = await res.json() as ServerStatusPayload
    return {
      hasApiKey: Boolean(payload.hasApiKey),
      baseUrl: payload.baseUrl || DEFAULT_AI_BASE_URL,
      model: payload.model || DEFAULT_AI_MODEL,
      source: 'server',
      editable: false,
      secure: true,
      warning: payload.warning,
    }
  } catch {
    return {
      hasApiKey: false,
      baseUrl: DEFAULT_AI_BASE_URL,
      model: DEFAULT_AI_MODEL,
      source: 'unsupported',
      editable: false,
      secure: false,
      warning: '当前运行环境不支持在页面中保存 API Key。',
    }
  }
}

export async function getAiSettingsStatus(): Promise<AiSettingsStatus> {
  const desktop = getDesktopAiSettingsBridge()
  if (desktop) return desktop.getStatus()
  if (await isNativeRuntime()) return getNativeStatus()
  return getServerStatus()
}

export async function saveAiSettings(input: AiSettingsInput): Promise<AiSettingsStatus> {
  const desktop = getDesktopAiSettingsBridge()
  if (desktop) return desktop.save(input)
  if (await isNativeRuntime()) return saveNativeSettings(input)
  throw new Error('当前运行环境不支持在页面中保存 API Key。')
}

export async function clearAiSettings(): Promise<AiSettingsStatus> {
  const desktop = getDesktopAiSettingsBridge()
  if (desktop) return desktop.clear()
  if (await isNativeRuntime()) return clearNativeSettings()
  throw new Error('当前运行环境不支持清除页面中的 API Key。')
}

export async function getNativeAiSettingsForRequest(): Promise<AiSettings | null> {
  if (!(await isNativeRuntime())) return null
  const settings = await getNativeSettings()
  if (!settings.apiKey) throw new Error('请先到“我的”页配置 API Key。')
  return settings
}

export async function testAiSettings(input?: Partial<AiSettingsInput>): Promise<AiTestResult> {
  const desktop = getDesktopAiSettingsBridge()
  if (desktop) return desktop.test(input)

  if (await isNativeRuntime()) {
    const existing = await getNativeSettings()
    const settings = {
      apiKey: input?.apiKey?.trim() || existing.apiKey,
      baseUrl: assertSafeAiBaseUrl(input?.baseUrl || existing.baseUrl),
      model: normalizeAiModel(input?.model || existing.model),
    }
    if (!settings.apiKey) return { ok: false, message: '请先填写并保存 API Key。' }
    await requestNativeChatCompletion(
      settings,
      toChatMessages('你是连通性测试助手。', '请只回复 OK。'),
      16
    )
    return { ok: true, message: '连接测试通过。' }
  }

  const res = await fetch('/api/ai/settings/test', { method: 'POST' })
  const payload = await res.json().catch(() => ({})) as Partial<AiTestResult> & { error?: string }
  if (!res.ok || !payload.ok) {
    return { ok: false, message: payload.message || payload.error || '连接测试失败。' }
  }
  return { ok: true, message: payload.message || '连接测试通过。' }
}
