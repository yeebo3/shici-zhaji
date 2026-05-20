'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, KeyRound, Loader2, Trash2, Wifi } from 'lucide-react'
import {
  clearAiSettings,
  getAiSettingsStatus,
  saveAiSettings,
  testAiSettings,
} from '@/lib/ai/settings'
import { AiSettingsStatus } from '@/lib/ai/types'

const inputClass = 'w-full px-3 py-2 rounded-md bg-cream dark:bg-night-card border border-stone/20 dark:border-stone/10 text-sm'
const DRAFT_STORAGE_KEY = 'shici-ai-settings-draft'

type AiSettingsDraft = {
  apiKey: string
  baseUrl: string
  model: string
  dirty: boolean
}

const emptyDraft: AiSettingsDraft = {
  apiKey: '',
  baseUrl: '',
  model: '',
  dirty: false,
}

let memoryDraft: AiSettingsDraft = emptyDraft

function readDraft(): AiSettingsDraft {
  if (memoryDraft.dirty) return memoryDraft
  if (typeof window === 'undefined') return memoryDraft
  try {
    const value = window.sessionStorage.getItem(DRAFT_STORAGE_KEY)
    if (!value) return memoryDraft
    const parsed = JSON.parse(value) as Partial<AiSettingsDraft>
    return {
      apiKey: '',
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : '',
      model: typeof parsed.model === 'string' ? parsed.model : '',
      dirty: Boolean(parsed.dirty),
    }
  } catch {
    return memoryDraft
  }
}

function writeDraft(draft: AiSettingsDraft): void {
  memoryDraft = draft
  if (typeof window === 'undefined') return
  try {
    if (draft.dirty) {
      window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
        baseUrl: draft.baseUrl,
        model: draft.model,
        dirty: draft.dirty,
      }))
    } else {
      window.sessionStorage.removeItem(DRAFT_STORAGE_KEY)
    }
  } catch {
    // Keep the in-memory draft even if session storage is unavailable.
  }
}

function clearDraft(): void {
  writeDraft(emptyDraft)
}

function sourceLabel(source: AiSettingsStatus['source']): string {
  if (source === 'desktop') return '桌面安全存储'
  if (source === 'native') return '安卓安全存储'
  if (source === 'server') return '服务端环境变量'
  return '不可用'
}

export default function AiSettingsPanel() {
  const initialDraft = readDraft()
  const [status, setStatus] = useState<AiSettingsStatus | null>(null)
  const [apiKey, setApiKey] = useState(initialDraft.apiKey)
  const [baseUrl, setBaseUrl] = useState(initialDraft.baseUrl)
  const [model, setModel] = useState(initialDraft.model)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const draftDirtyRef = useRef(initialDraft.dirty)

  const loadStatus = async () => {
    setLoading(true)
    setError('')
    try {
      const next = await getAiSettingsStatus()
      setStatus(next)
      const draft = readDraft()
      if (draft.dirty || draftDirtyRef.current) {
        setApiKey(draft.apiKey)
        setBaseUrl(draft.baseUrl || next.baseUrl)
        setModel(draft.model || next.model)
      } else {
        setBaseUrl(next.baseUrl)
        setModel(next.model)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI 设置加载失败。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadStatus()
  }, [])

  const persistDraft = (next: Partial<AiSettingsDraft>) => {
    const draft = {
      apiKey,
      baseUrl,
      model,
      ...next,
      dirty: true,
    }
    draftDirtyRef.current = true
    writeDraft(draft)
  }

  const handleSave = async () => {
    if (!status?.editable) return
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const next = await saveAiSettings({
        apiKey: apiKey.trim() || undefined,
        baseUrl,
        model,
      })
      clearDraft()
      draftDirtyRef.current = false
      setStatus(next)
      setBaseUrl(next.baseUrl)
      setModel(next.model)
      setApiKey('')
      setMessage('AI 设置已保存。')
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败。')
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    if (!status?.editable) return
    if (!window.confirm('确定清除已保存的 AI 设置吗？')) return
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const next = await clearAiSettings()
      clearDraft()
      draftDirtyRef.current = false
      setStatus(next)
      setBaseUrl(next.baseUrl)
      setModel(next.model)
      setApiKey('')
      setMessage('AI 设置已清除。')
    } catch (e) {
      setError(e instanceof Error ? e.message : '清除失败。')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setMessage('')
    setError('')
    try {
      const result = await testAiSettings({
        apiKey: apiKey.trim() || undefined,
        baseUrl,
        model,
      })
      if (result.ok) {
        setMessage(result.message)
      } else {
        setError(result.message)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '连接测试失败。')
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="card p-4 mb-8 text-sm text-ash flex items-center gap-2">
        <Loader2 size={14} className="animate-spin" />
        读取 AI 设置
      </div>
    )
  }

  const configured = Boolean(status?.hasApiKey)
  const editable = Boolean(status?.editable)

  return (
    <section className="card p-4 mb-8">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-1.5 text-sm text-ink/80 dark:text-night-text/80">
            <KeyRound size={15} />
            <span>AI 设置</span>
          </div>
          <p className="text-xs text-ash mt-1">
            {status ? sourceLabel(status.source) : '读取中'}
            {' · '}
            {configured ? '已配置 API Key' : '未配置 API Key'}
          </p>
        </div>
        {configured ? (
          <CheckCircle2 size={16} className="text-emerald-500 mt-0.5" />
        ) : (
          <AlertCircle size={16} className="text-amber-500 mt-0.5" />
        )}
      </div>

      {status?.warning && (
        <p className="mb-4 text-xs text-ash leading-relaxed">{status.warning}</p>
      )}

      <div className="space-y-3">
        <label className="block">
          <span className="block text-xs text-ash mb-1">API Key</span>
          <input
            value={apiKey}
            onChange={e => {
              const next = e.target.value
              setApiKey(next)
              persistDraft({ apiKey: next })
            }}
            disabled={!editable}
            type="password"
            autoComplete="off"
            placeholder={editable ? (configured ? '留空则保留已保存的 Key' : '填写兼容接口的 API Key') : '请在服务端环境变量中配置'}
            className={`${inputClass} ${editable ? '' : 'opacity-60 cursor-not-allowed'}`}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="block text-xs text-ash mb-1">Base URL</span>
            <input
              value={baseUrl}
              onChange={e => {
                const next = e.target.value
                setBaseUrl(next)
                persistDraft({ baseUrl: next })
              }}
              disabled={!editable}
              className={`${inputClass} ${editable ? '' : 'opacity-60 cursor-not-allowed'}`}
            />
          </label>
          <label className="block">
            <span className="block text-xs text-ash mb-1">Model</span>
            <input
              value={model}
              onChange={e => {
                const next = e.target.value
                setModel(next)
                persistDraft({ model: next })
              }}
              disabled={!editable}
              className={`${inputClass} ${editable ? '' : 'opacity-60 cursor-not-allowed'}`}
            />
          </label>
        </div>
      </div>

      {(message || error) && (
        <p className={`mt-3 text-xs leading-relaxed ${error ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-400'}`}>
          {error || message}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mt-4">
        {editable && (
          <button
            onClick={() => { void handleSave() }}
            disabled={saving}
            className={`btn-primary inline-flex items-center gap-1.5 ${saving ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
            保存设置
          </button>
        )}
        <button
          onClick={() => { void handleTest() }}
          disabled={testing || (!configured && !apiKey.trim())}
          className={`btn-ghost inline-flex items-center gap-1.5 ${
            testing || (!configured && !apiKey.trim()) ? 'opacity-60 cursor-not-allowed' : ''
          }`}
        >
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
          测试连接
        </button>
        {editable && configured && (
          <button onClick={() => { void handleClear() }} className="btn-ghost inline-flex items-center gap-1.5 text-rose-500">
            <Trash2 size={14} />
            清除
          </button>
        )}
      </div>
    </section>
  )
}
