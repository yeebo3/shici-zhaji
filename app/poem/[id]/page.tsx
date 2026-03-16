'use client'

import { useEffect, useState } from 'react'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Loading from '@/components/Loading'
import GroupPicker from '@/components/GroupPicker'
import { getPoemById } from '@/lib/poems'
import { Poem, ViewMode } from '@/lib/types'
import { markViewed } from '@/lib/storage'
import { useFavorite, useFontSize } from '@/hooks/useStudy'
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
} from 'lucide-react'

const viewModes: { key: ViewMode; label: string; icon: React.ElementType }[] = [
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

export default function PoemDetailPage() {
  const params = useParams()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const id = decodeURIComponent(params.id as string)
  const [poem, setPoem] = useState<Poem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('original')
  const [showFontPanel, setShowFontPanel] = useState(false)
  const [showGroupPanel, setShowGroupPanel] = useState(false)
  const { isFavorite, toggle: toggleFav } = useFavorite(id)
  const { fontSize, setFontSize, fontClass } = useFontSize()

  useEffect(() => {
    async function load() {
      try {
        const p = await getPoemById(id)
        if (p) {
          setPoem(p)
          markViewed(id)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : '数据加载失败'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  if (loading) return <div className="min-h-screen"><Navbar /><Loading /></div>

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

  const from = searchParams.get('from')
  const backTarget = from && from.startsWith('/') && from !== pathname ? from : null
  const reciteFrom = backTarget || pathname || `/poem/${poem.id}`

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Back + Actions */}
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
              onClick={toggleFav}
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

        {/* Font Size Panel */}
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

        {/* Title Block */}
        <div className="text-center mb-8">
          <h1 className="font-serif text-2xl font-semibold mb-2">{poem.title}</h1>
          <p className="text-sm text-ash">〔{poem.dynasty}〕{poem.author}</p>
        </div>

        {/* View Mode Tabs */}
        <div className="flex justify-center gap-1 mb-8">
          {viewModes.map(({ key, label, icon: Icon }) => (
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

        {/* Poem Content */}
        <section className="mb-8">
          <div className="text-center space-y-1">
            {poem.content.map((line, i) => (
              <p key={i} className={`font-serif poem-line ${fontClass} text-ink/90 dark:text-night-text/90`}>
                {line}
              </p>
            ))}
          </div>
        </section>

        {/* Annotations */}
        {(viewMode === 'annotated' || viewMode === 'all') && (
          <section className="mb-8">
            <h3 className="text-xs text-ash tracking-widest uppercase mb-3 text-center">注释</h3>
            <div className="card p-5 space-y-2">
              {poem.annotation.map((note, i) => (
                <p key={i} className="text-sm text-ink/70 dark:text-night-text/70 leading-relaxed">{note}</p>
              ))}
            </div>
          </section>
        )}

        {/* Translation */}
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

        {/* Appreciation */}
        {(viewMode === 'appreciation' || viewMode === 'all') && (
          <section className="mb-8">
            <h3 className="text-xs text-ash tracking-widest uppercase mb-3 text-center">赏析</h3>
            <div className="card p-5">
              <p className="text-sm text-ink/70 dark:text-night-text/70 leading-relaxed">{poem.appreciation}</p>
            </div>
          </section>
        )}

        {/* Tags */}
        <div className="flex justify-center gap-2 mb-8">
          {poem.tags.map(tag => (
            <span key={tag} className="tag">{tag}</span>
          ))}
        </div>

        {/* Start Recite */}
        <div className="text-center pb-8">
          <Link
            href={`/recite/${poem.id}?from=${encodeURIComponent(reciteFrom)}`}
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
