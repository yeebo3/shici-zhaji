'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Loading from '@/components/Loading'
import GroupPicker from '@/components/GroupPicker'
import AiAssistBlock from '@/components/AiAssistBlock'
import { getPoemById, getPoemIndexById, getPoemIndexByIds } from '@/lib/poems'
import { loadPoemSemanticRecommendations, loadPoemSemanticTags, loadSemanticFeatures } from '@/lib/semantic'
import { SemanticRecommendation, SemanticTagRecord } from '@/lib/semantic-types'
import { Poem, StudyRecord, ViewMode } from '@/lib/types'
import { getStudyRecord, markViewed } from '@/lib/storage'
import { useFavorite, useFontSize } from '@/hooks/useStudy'
import { useAndroidBackToPath } from '@/hooks/useAndroidBackToPath'
import {
  Heart,
  BookOpen,
  Type,
  ChevronLeft,
  Eye,
  FileText,
  Sparkles,
  Layers,
  FolderTree,
  Compass,
} from 'lucide-react'

const baseViewModes: { key: ViewMode; label: string; icon: React.ElementType }[] = [
  { key: 'original', label: '原文', icon: Eye },
  { key: 'annotated', label: '注释', icon: FileText },
  { key: 'appreciation', label: '赏析', icon: Sparkles },
  { key: 'all', label: '全部', icon: Layers },
]

const fontSizes = [
  { key: 'small', label: '小' },
  { key: 'medium', label: '中' },
  { key: 'large', label: '大' },
]

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

function PoemPageFallback() {
  return <div className="min-h-screen"><Navbar /><Loading /></div>
}

function PoemDetailPageContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const id = decodePoemId(searchParams.get('id'))
  const shardHint = parseShardHint(searchParams.get('s'))
  const from = searchParams.get('from')
  const backTarget = from && from.startsWith('/') && from !== pathname ? from : null
  const [poem, setPoem] = useState<Poem | null>(null)
  const [studyRecord, setStudyRecord] = useState<StudyRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('original')
  const [showFontPanel, setShowFontPanel] = useState(false)
  const [showGroupPanel, setShowGroupPanel] = useState(false)
  const [semanticEnabled, setSemanticEnabled] = useState(false)
  const [semanticTags, setSemanticTags] = useState<SemanticTagRecord[]>([])
  const [semanticRecommendations, setSemanticRecommendations] = useState<SemanticRecommendation[]>([])
  const [semanticRecoMeta, setSemanticRecoMeta] = useState<Record<string, { title: string; author: string; dynasty: string; shard: number }>>({})
  const { isFavorite, toggle: toggleFav } = useFavorite(id || '')
  const { fontSize, setFontSize, fontClass } = useFontSize()

  useAndroidBackToPath(backTarget)

  useEffect(() => {
    let active = true

    async function loadSemantic() {
      setSemanticEnabled(false)
      setSemanticTags([])
      setSemanticRecommendations([])
      setSemanticRecoMeta({})

      if (!poem?.id) return

      const features = await loadSemanticFeatures()
      if (!active || !features.semanticEnabled) return
      setSemanticEnabled(true)

      let semanticShard = shardHint
      if (!Number.isInteger(semanticShard) || semanticShard === undefined) {
        const index = await getPoemIndexById(poem.id)
        if (!active) return
        semanticShard = index?.shard
      }
      if (!Number.isInteger(semanticShard) || semanticShard === undefined) return

      const [tags, recommendations] = await Promise.all([
        loadPoemSemanticTags(poem.id, semanticShard),
        loadPoemSemanticRecommendations(poem.id, semanticShard),
      ])
      if (!active) return

      setSemanticTags(tags)
      const topRecommendations = recommendations.slice(0, 6)
      setSemanticRecommendations(topRecommendations)

      const recommendationIds = topRecommendations.map(item => item.poem_id)
      if (recommendationIds.length === 0) return

      const indices = await getPoemIndexByIds(recommendationIds)
      if (!active) return

      const nextMeta: Record<string, { title: string; author: string; dynasty: string; shard: number }> = {}
      for (const item of indices) {
        nextMeta[item.id] = {
          title: item.title,
          author: item.author,
          dynasty: item.dynasty,
          shard: item.shard,
        }
      }
      setSemanticRecoMeta(nextMeta)
    }

    void loadSemantic()
    return () => {
      active = false
    }
  }, [poem?.id, shardHint])

  const surfaceSemanticTags = useMemo(() => {
    const seen = new Set<string>()
    return semanticTags
      .filter(tag => tag.tag_type === 'emotion' || tag.tag_type === 'style')
      .slice()
      .sort((a, b) => b.score - a.score)
      .filter(tag => {
        if (seen.has(tag.tag_name)) return false
        seen.add(tag.tag_name)
        return true
      })
      .slice(0, 3)
  }, [semanticTags])

  const semanticViewAvailable = semanticEnabled && (surfaceSemanticTags.length > 0 || semanticRecommendations.length > 0)
  const availableViewModes = useMemo(() => {
    if (!semanticViewAvailable) return baseViewModes
    return [
      ...baseViewModes.slice(0, 3),
      { key: 'semantic' as ViewMode, label: '语义', icon: Compass },
      baseViewModes[3],
    ]
  }, [semanticViewAvailable])

  useEffect(() => {
    if (viewMode === 'semantic' && !semanticViewAvailable) {
      setViewMode('original')
    }
  }, [semanticViewAvailable, viewMode])

  useEffect(() => {
    async function load() {
      if (!id) {
        setPoem(null)
        setStudyRecord(null)
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
          try {
            await markViewed(id, shardHint)
            setStudyRecord(await getStudyRecord(id))
          } catch {
            setStudyRecord(null)
          }
        } else {
          setPoem(null)
          setStudyRecord(null)
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

  if (loading) return <PoemPageFallback />

  if (error) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-20 text-center text-ash">加载失败：{error}</div>
      </div>
    )
  }

  if (!poem) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-20 text-center text-ash">未找到该诗词</div>
      </div>
    )
  }

  const currentPoemPath = `/poem?id=${encodeURIComponent(poem.id)}${shardHint !== undefined ? `&s=${shardHint}` : ''}`
  const reciteFrom = backTarget || currentPoemPath

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => backTarget ? router.push(backTarget) : router.back()}
            className="btn-ghost flex items-center gap-1 -ml-3"
          >
            <ChevronLeft size={16} />
            返回
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowFontPanel(!showFontPanel)}
              className="btn-ghost p-2"
              aria-label="字体大小"
            >
              <Type size={16} />
            </button>
            <button
              onClick={() => { void toggleFav() }}
              className={`btn-ghost p-2 ${isFavorite ? 'text-red-400' : ''}`}
              aria-label="收藏"
            >
              <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={() => setShowGroupPanel(v => !v)}
              className="btn-ghost p-2"
              aria-label="分组管理"
            >
              <FolderTree size={16} />
            </button>
          </div>
        </div>

        {showFontPanel && (
          <div className="card p-3 mb-4 flex items-center justify-center gap-2">
            <span className="text-xs text-ash mr-2">字号</span>
            {fontSizes.map(fs => (
              <button
                key={fs.key}
                onClick={() => setFontSize(fs.key)}
                className={`px-3 py-1 rounded text-sm transition-colors
                  ${fontSize === fs.key
                    ? 'bg-ink text-parchment dark:bg-night-text dark:text-night'
                    : 'text-ash hover:text-ink dark:hover:text-night-text'
                  }`}
              >
                {fs.label}
              </button>
            ))}
          </div>
        )}
        <GroupPicker
          poemId={id}
          open={showGroupPanel}
          onClose={() => setShowGroupPanel(false)}
        />

        <div className="text-center mb-8">
          <h1 className="font-serif text-2xl font-semibold mb-2">{poem.title}</h1>
          <p className="text-sm text-ash">〔{poem.dynasty}〕{poem.author}</p>
        </div>

        <div className="flex justify-center gap-1 mb-8">
          {availableViewModes.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setViewMode(key)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs transition-colors
                ${viewMode === key
                  ? 'bg-ink/8 dark:bg-white/8 text-ink dark:text-night-text'
                  : 'text-ash hover:text-ink/70 dark:hover:text-night-text/70'
                }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        <section className="mb-8">
          <div className="text-center space-y-1">
            {poem.content.map((line, i) => (
              <p key={i} className={`font-serif poem-line ${fontClass} text-ink/90 dark:text-night-text/90`}>
                {line}
              </p>
            ))}
          </div>
        </section>

        {(viewMode === 'annotated' || viewMode === 'all') && (
          <section className="mb-8">
            <h3 className="text-xs text-ash tracking-widest uppercase mb-3 text-center">注释</h3>
            <div className="card p-5 space-y-2">
              {poem.annotation.map((note, i) => (
                <p key={i} className="text-sm text-ink/70 dark:text-night-text/70 leading-relaxed">{note}</p>
              ))}
            </div>
            <AiAssistBlock
              task="annotation"
              title="AI 补充注释"
              buttonLabel="生成注释"
              poem={poem}
              studyRecord={studyRecord}
              className="mt-3"
            />
          </section>
        )}

        {(viewMode === 'annotated' || viewMode === 'all') && (
          <section className="mb-8">
            <h3 className="text-xs text-ash tracking-widest uppercase mb-3 text-center">译文</h3>
            <div className="card p-5 space-y-2">
              {poem.translation.map((line, i) => (
                <p key={i} className="text-sm text-ink/70 dark:text-night-text/70 leading-relaxed">{line}</p>
              ))}
            </div>
          </section>
        )}

        {(viewMode === 'appreciation' || viewMode === 'all') && (
          <section className="mb-8">
            <h3 className="text-xs text-ash tracking-widest uppercase mb-3 text-center">赏析</h3>
            <div className="card p-5">
              <p className="text-sm text-ink/70 dark:text-night-text/70 leading-relaxed">{poem.appreciation}</p>
            </div>
            <AiAssistBlock
              task="analysis"
              title="AI 补充赏析"
              buttonLabel="生成赏析"
              poem={poem}
              studyRecord={studyRecord}
              className="mt-3"
            />
          </section>
        )}

        {surfaceSemanticTags.length > 0 && (
          <div className="flex justify-center gap-2 mb-8">
            {surfaceSemanticTags.map(tag => (
              <span key={`${tag.tag_type}-${tag.tag_name}`} className="tag">{tag.tag_name}</span>
            ))}
          </div>
        )}

        {viewMode === 'semantic' && semanticViewAvailable && (
          <section className="mb-8">
            <h3 className="text-xs text-ash tracking-widest uppercase mb-3 text-center">语义</h3>
            <div className="card p-5">
              {semanticRecommendations.length > 0 ? (
                <div className="divide-y divide-stone/15 dark:divide-white/10">
                  {semanticRecommendations.map(item => {
                    const meta = semanticRecoMeta[item.poem_id]
                    if (!meta) return null
                    return (
                      <Link
                        key={item.poem_id}
                        href={`/poem?id=${encodeURIComponent(item.poem_id)}&s=${meta.shard}&from=${encodeURIComponent(currentPoemPath)}`}
                        className="block py-3 first:pt-0 last:pb-0"
                      >
                        <p className="font-serif text-base mb-1">{meta.title}</p>
                        <p className="text-xs text-ash mb-1">〔{meta.dynasty}〕{meta.author}</p>
                        <p className="text-sm text-ink/70 dark:text-night-text/70 leading-relaxed">{item.reason}</p>
                      </Link>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-ash text-center">暂无续学建议</p>
              )}
            </div>
          </section>
        )}

        <div className="text-center pb-8">
          <Link
            href={`/recite?id=${encodeURIComponent(poem.id)}${shardHint !== undefined ? `&s=${shardHint}` : ''}&from=${encodeURIComponent(reciteFrom)}`}
            className="btn-primary inline-flex items-center gap-1.5"
          >
            <BookOpen size={14} />
            开始背诵
          </Link>
        </div>
      </main>
    </div>
  )
}

export default function PoemDetailPage() {
  return (
    <Suspense fallback={<PoemPageFallback />}>
      <PoemDetailPageContent />
    </Suspense>
  )
}
