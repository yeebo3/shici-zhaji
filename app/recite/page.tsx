'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Navbar from '@/components/Navbar'
import Loading from '@/components/Loading'
import { getPoemById, getPoemIndexById, getRandomPoemIndex } from '@/lib/poems'
import { Poem, PoemGroup, ReciteMode, ReciteScopeId } from '@/lib/types'
import { getPoemGroups, markMemorized, markViewed } from '@/lib/storage'
import { useReciteNotebook } from '@/hooks/useStudy'
import {
  ChevronLeft,
  Eye,
  EyeOff,
  ListOrdered,
  HelpCircle,
  Check,
  X,
  SkipForward,
  RotateCcw,
} from 'lucide-react'

const modes: { key: ReciteMode; label: string; icon: React.ElementType }[] = [
  { key: 'read', label: '阅读', icon: Eye },
  { key: 'mask', label: '遮挡', icon: EyeOff },
  { key: 'line', label: '逐句', icon: ListOrdered },
  { key: 'test', label: '自测', icon: HelpCircle },
]

const GROUP_SCOPE_PREFIX = 'group:'

type ReciteScopeOption = {
  id: ReciteScopeId
  name: string
  count: number
}

function decodePoemId(rawId: string | null): string {
  if (!rawId) return ''
  try {
    return decodeURIComponent(rawId)
  } catch {
    return rawId
  }
}

function parseShardHint(raw: string | null): number | undefined {
  if (raw === null) return undefined
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isInteger(parsed) || parsed < 0) return undefined
  return parsed
}

function isGroupScope(scope: string): scope is `group:${string}` {
  return scope.startsWith(GROUP_SCOPE_PREFIX) && scope.length > GROUP_SCOPE_PREFIX.length
}

function getGroupIdFromScope(scope: `group:${string}`): string {
  return scope.slice(GROUP_SCOPE_PREFIX.length)
}

function splitLineBySentence(line: string): string[] {
  if (!line) return ['']
  const segments: string[] = []
  let start = 0
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== '。') continue
    const part = line.slice(start, i + 1)
    if (part) segments.push(part)
    start = i + 1
  }
  const tail = line.slice(start)
  if (tail) segments.push(tail)
  if (segments.length === 0) segments.push(line)
  return segments
}

function RecitePageFallback() {
  return <div className="min-h-screen"><Navbar /><Loading /></div>
}

function RecitePageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { notebook, setNotebook } = useReciteNotebook()
  const id = decodePoemId(searchParams.get('id'))
  const shardHint = parseShardHint(searchParams.get('s'))
  const [entryFrom, setEntryFrom] = useState('/')
  const [poem, setPoem] = useState<Poem | null>(null)
  const [groups, setGroups] = useState<PoemGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<ReciteMode>('read')
  const [revealedWords, setRevealedWords] = useState<Set<string>>(new Set())
  const [currentSentence, setCurrentSentence] = useState(0)
  const [testRevealed, setTestRevealed] = useState(false)
  const [result, setResult] = useState<'none' | 'memorized' | 'forgot'>('none')
  const pendingMarkRef = useRef<Promise<void> | null>(null)

  useEffect(() => {
    async function load() {
      if (!id) {
        setPoem(null)
        setError('缺少诗词参数')
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const p = await getPoemById(id, shardHint)
        if (p) {
          setPoem(p)
          void markViewed(id, shardHint)
        } else {
          setPoem(null)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : '数据加载失败'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, shardHint])

  useEffect(() => {
    let cancelled = false
    async function loadGroups() {
      try {
        const list = await getPoemGroups()
        if (!cancelled) setGroups(list)
      } catch {
        if (!cancelled) setGroups([])
      }
    }
    void loadGroups()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const from = searchParams.get('from')
    if (from && from.startsWith('/') && !from.startsWith('/recite')) {
      setEntryFrom(from)
      return
    }

    if (typeof window === 'undefined') {
      setEntryFrom('/')
      return
    }

    try {
      const ref = document.referrer
      if (ref) {
        const url = new URL(ref)
        if (url.origin === window.location.origin && !url.pathname.startsWith('/recite')) {
          const path = `${url.pathname}${url.search}`
          setEntryFrom(path || '/')
          return
        }
      }
    } catch {
      // ignore invalid referrer
    }

    setEntryFrom('/')
  }, [searchParams])

  const maskedIndices = useMemo(() => {
    if (!poem) return []
    const indices: { lineIdx: number; charIdx: number; key: string }[] = []
    poem.content.forEach((line, li) => {
      const charPositions: number[] = []
      for (let i = 0; i < line.length; i++) {
        if (!/[，。？！、；：""''（）\s]/.test(line[i])) {
          charPositions.push(i)
        }
      }
      const numToMask = Math.max(1, Math.floor(charPositions.length * 0.4))
      const shuffled = [...charPositions].sort(() => Math.random() - 0.5)
      shuffled.slice(0, numToMask).forEach(ci => {
        indices.push({ lineIdx: li, charIdx: ci, key: `${li}-${ci}` })
      })
    })
    return indices
  }, [poem, mode])

  const lineSentenceSegments = useMemo(() => {
    if (!poem) return [] as { key: string; text: string; sentenceIndex: number }[][]
    let sentenceIndex = 0
    return poem.content.map((line, lineIdx) => (
      splitLineBySentence(line).map((text, partIdx) => ({
        key: `${lineIdx}-${partIdx}`,
        text,
        sentenceIndex: sentenceIndex++,
      }))
    ))
  }, [poem])

  const totalSentences = useMemo(
    () => lineSentenceSegments.reduce((sum, line) => sum + line.length, 0),
    [lineSentenceSegments]
  )

  const scopeOptions = useMemo<ReciteScopeOption[]>(() => ([
    { id: 'annotated', name: '常用诗词本', count: 0 },
    ...groups.map(group => ({
      id: `${GROUP_SCOPE_PREFIX}${group.id}` as ReciteScopeId,
      name: group.name,
      count: group.poemIds.length,
    })),
  ]), [groups])

  const resetState = () => {
    setRevealedWords(new Set())
    setCurrentSentence(0)
    setTestRevealed(false)
    setResult('none')
  }

  useEffect(() => {
    setRevealedWords(new Set())
    setCurrentSentence(0)
    setTestRevealed(false)
    setResult('none')
  }, [poem?.id])

  const handleModeChange = (m: ReciteMode) => {
    setMode(m)
    resetState()
  }

  const handleRevealWord = (key: string) => {
    setRevealedWords(prev => new Set([...prev, key]))
  }

  const queueMemorizedResult = (memorized: boolean, nextResult: 'memorized' | 'forgot') => {
    if (!poem) return
    setResult(nextResult)
    const previousTask = pendingMarkRef.current ?? Promise.resolve()
    const task = previousTask
      .catch(() => undefined)
      .then(() => markMemorized(poem.id, memorized))
      .then(() => undefined)
      .catch(() => undefined)
    pendingMarkRef.current = task
    void task.finally(() => {
      if (pendingMarkRef.current === task) {
        pendingMarkRef.current = null
      }
    })
  }

  const handleMemorized = () => {
    queueMemorizedResult(true, 'memorized')
  }

  const handleForgot = () => {
    queueMemorizedResult(false, 'forgot')
  }

  const handleNext = async () => {
    if (pendingMarkRef.current) {
      await pendingMarkRef.current
    }

    let p = null as Awaited<ReturnType<typeof getRandomPoemIndex>> | null
    if (notebook === 'annotated') {
      p = await getRandomPoemIndex('annotated')
    } else if (isGroupScope(notebook)) {
      const groupId = getGroupIdFromScope(notebook)
      const group = groups.find(item => item.id === groupId)
      if (group) {
        const ids = [...group.poemIds]
        for (let i = ids.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[ids[i], ids[j]] = [ids[j], ids[i]]
        }
        for (const poemId of ids) {
          const next = await getPoemIndexById(poemId)
          if (next) {
            p = next
            break
          }
        }
      }
    }

    if (!p) {
      if (notebook !== 'annotated') {
        await setNotebook('annotated')
      }
      p = await getRandomPoemIndex('annotated')
    }
    router.push(`/recite?id=${encodeURIComponent(p.id)}&s=${p.shard}&from=${encodeURIComponent(entryFrom)}`)
  }

  if (loading) return <RecitePageFallback />

  if (error) {
    return (
      <div className="min-h-screen"><Navbar />
        <div className="max-w-2xl mx-auto px-4 py-20 text-center text-ash">加载失败：{error}</div>
      </div>
    )
  }

  if (!poem) {
    return (
      <div className="min-h-screen"><Navbar />
        <div className="max-w-2xl mx-auto px-4 py-20 text-center text-ash">未找到该诗词</div>
      </div>
    )
  }

  const progress = mode === 'line'
    ? (
      totalSentences > 0
        ? Math.round(((Math.min(currentSentence, totalSentences - 1) + 1) / totalSentences) * 100)
        : 0
    )
    : mode === 'mask'
    ? Math.round((revealedWords.size / Math.max(1, maskedIndices.length)) * 100)
    : mode === 'test'
    ? testRevealed ? 100 : 0
    : 100

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => router.push(entryFrom)} className="btn-ghost flex items-center gap-1 -ml-3">
            <ChevronLeft size={16} /> 返回
          </button>
          <button onClick={resetState} className="btn-ghost flex items-center gap-1">
            <RotateCcw size={14} /> 重置
          </button>
        </div>

        <div className="text-center mb-4">
          <h1 className="font-serif text-xl font-semibold">{poem.title}</h1>
          <p className="text-sm text-ash mt-1">〔{poem.dynasty}〕{poem.author}</p>
        </div>

        <div className="mb-6">
          <div className="h-1 bg-stone/15 dark:bg-stone/10 rounded-full overflow-hidden">
            <div className="h-full bg-ink/30 dark:bg-night-text/30 rounded-full transition-all duration-500"
                 style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-ash text-center mt-1.5">{progress}%</p>
        </div>

        <div className="mb-6">
          <p className="text-xs text-ash tracking-widest uppercase text-center mb-2">背诵范围</p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {scopeOptions.map(item => (
              <button
                key={item.id}
                onClick={() => { void setNotebook(item.id) }}
                className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                  notebook === item.id
                    ? 'bg-ink/10 dark:bg-white/10 text-ink dark:text-night-text'
                    : 'text-ash hover:text-ink/75 dark:hover:text-night-text/75'
                }`}
              >
                {item.name}
                {item.count > 0 ? ` · ${item.count}` : ''}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-center gap-1 mb-8">
          {modes.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => handleModeChange(key)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs transition-colors
                ${mode === key ? 'bg-ink/8 dark:bg-white/8 text-ink dark:text-night-text'
                  : 'text-ash hover:text-ink/70 dark:hover:text-night-text/70'}`}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        <div className="card p-8 mb-6 min-h-[240px] flex flex-col items-center justify-center">
          {mode === 'read' && (
            <div className="text-center space-y-1">
              {poem.content.map((line, i) => (
                <p key={i} className="font-serif text-xl poem-line text-ink/90 dark:text-night-text/90">{line}</p>
              ))}
            </div>
          )}

          {mode === 'mask' && (
            <div className="text-center space-y-1">
              {poem.content.map((line, li) => (
                <p key={li} className="font-serif text-xl poem-line">
                  {line.split('').map((char, ci) => {
                    const key = `${li}-${ci}`
                    const isMasked = maskedIndices.some(m => m.key === key)
                    const isRevealed = revealedWords.has(key)
                    if (!isMasked) return <span key={ci} className="text-ink/90 dark:text-night-text/90">{char}</span>
                    if (isRevealed) return <span key={ci} className="text-emerald-600 dark:text-emerald-400">{char}</span>
                    return (
                      <span key={ci} onClick={() => handleRevealWord(key)}
                        className="inline-block w-[1.2em] h-[1.2em] bg-ink/10 dark:bg-white/10 rounded cursor-pointer
                                   hover:bg-ink/20 dark:hover:bg-white/20 transition-colors mx-px align-middle" />
                    )
                  })}
                </p>
              ))}
            </div>
          )}

          {mode === 'line' && (
            <div className="text-center space-y-1 w-full">
              {lineSentenceSegments.map((line, lineIdx) => (
                <p key={lineIdx} className="font-serif text-xl poem-line">
                  {line.map(segment => (
                    <span key={segment.key} className={`transition-all duration-300
                      ${segment.sentenceIndex <= currentSentence
                        ? 'text-ink/90 dark:text-night-text/90 opacity-100'
                        : 'text-transparent select-none opacity-0'}`}>
                      {segment.text}
                    </span>
                  ))}
                </p>
              ))}
              {currentSentence < totalSentences - 1 && (
                <button
                  onClick={() => setCurrentSentence(prev => Math.min(prev + 1, totalSentences - 1))}
                  className="btn-ghost mt-4 text-sm"
                >
                  显示下一句
                </button>
              )}
            </div>
          )}

          {mode === 'test' && (
            <div className="text-center w-full">
              {!testRevealed ? (
                <div>
                  <p className="text-ash text-sm mb-6">试着回忆这首诗的内容</p>
                  <button onClick={() => setTestRevealed(true)} className="btn-primary">显示答案</button>
                </div>
              ) : (
                <div className="space-y-1">
                  {poem.content.map((line, i) => (
                    <p key={i} className="font-serif text-xl poem-line text-ink/90 dark:text-night-text/90">{line}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {result !== 'none' && (
          <div className={`card p-4 mb-6 text-center text-sm ${
            result === 'memorized' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
            {result === 'memorized' ? '已标记为"记住了"，继续保持！' : '没关系，多复习几次就好了。'}
          </div>
        )}

        <div className="flex justify-center gap-3 pb-8">
          <button onClick={handleMemorized} className="btn-primary flex items-center gap-1.5">
            <Check size={14} /> 记住了
          </button>
          <button onClick={handleForgot} className="btn-ghost flex items-center gap-1.5">
            <X size={14} /> 没记住
          </button>
          <button onClick={handleNext} className="btn-ghost flex items-center gap-1.5">
            <SkipForward size={14} /> 下一首
          </button>
        </div>
      </main>
    </div>
  )
}

export default function RecitePage() {
  return (
    <Suspense fallback={<RecitePageFallback />}>
      <RecitePageContent />
    </Suspense>
  )
}
