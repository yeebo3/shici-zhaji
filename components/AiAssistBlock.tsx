'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { readAiCache, writeAiCache } from '@/lib/ai/cache'
import { requestPoemAi } from '@/lib/ai/client'
import { getAiSettingsStatus } from '@/lib/ai/settings'
import { AiPoemInput, AiPoemTask, AiReciteContext, AiStudyContext } from '@/lib/ai/types'

type AiAssistBlockProps = {
  task: AiPoemTask
  title: string
  buttonLabel: string
  poem: AiPoemInput
  studyRecord?: AiStudyContext | null
  recite?: AiReciteContext
  className?: string
}

export default function AiAssistBlock({
  task,
  title,
  buttonLabel,
  poem,
  studyRecord,
  recite,
  className = '',
}: AiAssistBlockProps) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cacheModel, setCacheModel] = useState('default')
  const cacheContext = useMemo(
    () => JSON.stringify({ poem, studyRecord: studyRecord || null, recite: recite || null }),
    [poem, recite, studyRecord]
  )

  useEffect(() => {
    let cancelled = false
    setContent('')
    setError('')
    setLoading(false)

    async function loadCachedContent() {
      let model = 'default'
      try {
        model = (await getAiSettingsStatus()).model || model
      } catch {
        // The request path will surface configuration errors if generation is attempted.
      }
      if (cancelled) return
      setCacheModel(model)
      setContent(readAiCache({ poemId: poem.id, task, model, context: cacheContext }) || '')
    }

    void loadCachedContent()
    return () => { cancelled = true }
  }, [cacheContext, poem.id, task])

  const handleGenerate = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await requestPoemAi({ task, poem, studyRecord, recite })
      setContent(result.text)
      const model = result.model || cacheModel
      setCacheModel(model)
      writeAiCache({ poemId: poem.id, task, model, context: cacheContext }, result.text)
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败，请稍后再试。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`card p-4 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-sm text-ink/75 dark:text-night-text/75">
          <Sparkles size={14} />
          <span>{title}</span>
        </div>
        <button
          type="button"
          onClick={() => { void handleGenerate() }}
          disabled={loading}
          className={`btn-ghost px-3 py-1.5 inline-flex items-center gap-1.5 text-xs ${
            loading ? 'opacity-60 cursor-not-allowed' : ''
          }`}
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : content ? <RefreshCw size={13} /> : <Sparkles size={13} />}
          {loading ? '生成中' : content ? '重新生成' : buttonLabel}
        </button>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
          <AlertCircle size={14} className="mt-0.5 flex-none" />
          <span>{error}</span>
        </div>
      )}

      {content && (
        <div className="mt-3 border-t border-stone/20 dark:border-stone/10 pt-3">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => <h3 className="font-serif text-base font-semibold mt-4 mb-2 first:mt-0">{children}</h3>,
              h2: ({ children }) => <h3 className="font-serif text-base font-semibold mt-4 mb-2 first:mt-0">{children}</h3>,
              h3: ({ children }) => <h4 className="text-sm font-semibold mt-3 mb-1.5 first:mt-0">{children}</h4>,
              p: ({ children }) => <p className="text-sm text-ink/70 dark:text-night-text/70 leading-relaxed my-2 first:mt-0">{children}</p>,
              ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1 text-sm text-ink/70 dark:text-night-text/70">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1 text-sm text-ink/70 dark:text-night-text/70">{children}</ol>,
              blockquote: ({ children }) => <blockquote className="border-l-2 border-stone/30 pl-3 my-2 text-ash">{children}</blockquote>,
              strong: ({ children }) => <strong className="font-semibold text-ink/85 dark:text-night-text/85">{children}</strong>,
            }}
          >
            {content}
          </ReactMarkdown>
          <p className="mt-3 text-xs text-ash">AI 内容仅供辅助学习。</p>
        </div>
      )}
    </div>
  )
}
