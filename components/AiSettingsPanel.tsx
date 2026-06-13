'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, KeyRound, Loader2, Trash2, Wifi, X } from 'lucide-react'
import {
  clearAiSettings,
  getAiSettingsStatus,
  saveAiSettings,
  testAiSettings,
} from '@/lib/ai/settings'
import { AI_PROVIDER_PRESETS } from '@/lib/ai/presets'
import { AiSettingsStatus } from '@/lib/ai/types'

const inputClass = 'w-full px-3 py-2 rounded-md bg-cream dark:bg-night-card border border-stone/20 dark:border-stone/10 text-sm'
const DRAFT_STORAGE_KEY = 'shici-ai-settings-draft'

type AiSettingsDraft = {
  apiKey: string
  baseUrl: string
  model: string
  imageModel: string
  dirty: boolean
}

const emptyDraft: AiSettingsDraft = {
  apiKey: '',
  baseUrl: '',
  model: '',
  imageModel: '',
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
      imageModel: typeof parsed.imageModel === 'string' ? parsed.imageModel : '',
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
        imageModel: draft.imageModel,
        dirty: draft.dirty,
      }))
    } else {
      window.sessionStorage.removeItem(DRAFT_STORAGE_KEY)
    }
  } catch {
    // keep memory fallback
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
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<AiSettingsStatus | null>(null)
  const [apiKey, setApiKey] = useState(initialDraft.apiKey)
  const [baseUrl, setBaseUrl] = useState(initialDraft.baseUrl)
  const [model, setModel] = useState(initialDraft.model)
  const [imageModel, setImageModel] = useState(initialDraft.imageModel)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const draftDirtyRef = useRef(initialDraft.dirty)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

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
        setImageModel(draft.imageModel || next.imageModel || '')
      } else {
        setBaseUrl(next.baseUrl)
        setModel(next.model)
        setImageModel(next.imageModel || '')
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

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]'
      ))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [open])

  const persistDraft = (next: Partial<AiSettingsDraft>) => {
    const draft = {
      apiKey,
      baseUrl,
      model,
      imageModel,
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
        imageModel,
      })
      clearDraft()
      draftDirtyRef.current = false
      setStatus(next)
      setBaseUrl(next.baseUrl)
      setModel(next.model)
      setImageModel(next.imageModel || '')
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
      setImageModel(next.imageModel || '')
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

  const applyPreset = (base: string, textModel: string, imgModel: string) => {
    setBaseUrl(base)
    setModel(textModel)
    setImageModel(imgModel)
    persistDraft({ baseUrl: base, model: textModel, imageModel: imgModel })
  }

  const configured = Boolean(status?.hasApiKey)
  const editable = Boolean(status?.editable)

  return (
    <section className="mb-4">
      <div className="flex justify-end">
        <button
          onClick={() => setOpen(true)}
          className="btn-ghost inline-flex items-center gap-1.5 text-xs"
          aria-label="打开 AI 设置"
          aria-expanded={open}
        >
          <KeyRound size={14} />
          AI
          {configured ? (
            <CheckCircle2 size={13} className="text-emerald-500" />
          ) : (
            <AlertCircle size={13} className="text-amber-500" />
          )}
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[80] bg-black/35 backdrop-blur-[1px] px-4 py-10"
          style={{
            paddingTop: 'max(2.5rem, env(safe-area-inset-top))',
            paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))',
          }}
          onMouseDown={event => {
            if (event.target === event.currentTarget) setOpen(false)
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-settings-title"
            className="max-w-lg mx-auto card p-4 sm:p-5 max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-1.5 text-sm text-ink/80 dark:text-night-text/80">
                  <KeyRound size={15} />
                  <span id="ai-settings-title">AI 设置</span>
                </div>
                <p className="text-xs text-ash mt-1">
                  {loading ? '读取中' : status ? sourceLabel(status.source) : '未知'}
                  {' · '}
                  {configured ? '已配置 API Key' : '未配置 API Key'}
                </p>
              </div>
              <button ref={closeButtonRef} onClick={() => setOpen(false)} className="btn-ghost p-1.5" aria-label="关闭 AI 设置">
                <X size={15} />
              </button>
            </div>

            {loading && (
              <div className="text-sm text-ash flex items-center gap-2 mb-4">
                <Loader2 size={14} className="animate-spin" />
                读取 AI 设置
              </div>
            )}

            {!loading && status?.warning && (
              <p className="mb-3 text-xs text-ash leading-relaxed">{status.warning}</p>
            )}

            {!loading && (
              <>
                <div className="mb-3">
                  <p className="text-xs text-ash mb-2">快捷模板</p>
                  <div className="flex flex-wrap gap-2">
                    {AI_PROVIDER_PRESETS.map(item => (
                      <button
                        key={item.id}
                        onClick={() => applyPreset(item.baseUrl, item.model, item.imageModel)}
                        className="tag cursor-pointer"
                        title={item.note || item.label}
                        disabled={!editable}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

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
                    <span className="block text-xs text-ash mb-1">文本模型</span>
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

                  <label className="block">
                    <span className="block text-xs text-ash mb-1">生图模型（预留）</span>
                    <input
                      value={imageModel}
                      onChange={e => {
                        const next = e.target.value
                        setImageModel(next)
                        persistDraft({ imageModel: next })
                      }}
                      disabled={!editable}
                      className={`${inputClass} ${editable ? '' : 'opacity-60 cursor-not-allowed'}`}
                    />
                  </label>
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
                      保存
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
                    测试
                  </button>
                  {editable && configured && (
                    <button onClick={() => { void handleClear() }} className="btn-ghost inline-flex items-center gap-1.5 text-rose-500">
                      <Trash2 size={14} />
                      清除
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
