'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import PoemCard from '@/components/PoemCard'
import Loading from '@/components/Loading'
import { PoemIndex } from '@/lib/types'
import { getRecentlyViewed } from '@/lib/storage'
import {
  getDailyPoemIndex,
  getRandomPoemIndex,
  getPoemIndexById,
  queryPoems,
} from '@/lib/poems'
import { BookOpen, Shuffle, ArrowRight, Bookmark } from 'lucide-react'

const PAGE_SIZE = 120

export default function HomePage() {
  const router = useRouter()
  const pathname = usePathname()
  const currentPath = pathname || '/'
  const [daily, setDaily] = useState<PoemIndex | null>(null)
  const [continuePoem, setContinuePoem] = useState<PoemIndex | null>(null)
  const [allPoems, setAllPoems] = useState<PoemIndex[]>([])
  const [totalPoems, setTotalPoems] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      try {
        const [dailyP, firstPage] = await Promise.all([
          getDailyPoemIndex(),
          queryPoems({ offset: 0, limit: PAGE_SIZE }),
        ])
        setDaily(dailyP)
        setAllPoems(firstPage.items)
        setTotalPoems(firstPage.total)

        // Check continue learning
        const recent = getRecentlyViewed()
        if (recent.length > 0) {
          const found = await getPoemIndexById(recent[0].poemId)
          if (found) setContinuePoem(found)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : '数据加载失败'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  const handleLoadMore = async () => {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const next = await queryPoems({
        offset: allPoems.length,
        limit: PAGE_SIZE,
      })
      setAllPoems(prev => [...prev, ...next.items])
      setTotalPoems(next.total)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '加载更多失败'
      setError(msg)
    } finally {
      setLoadingMore(false)
    }
  }

  const handleRandom = async () => {
    const p = await getRandomPoemIndex()
    router.push(`/poem/${p.id}?from=${encodeURIComponent(currentPath || '/')}`)
  }

  if (loading) return <div className="min-h-screen"><Navbar /><Loading /></div>

  if (error) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="max-w-2xl mx-auto px-4 py-20 text-center">
          <p className="text-sm text-ash">加载失败：{error}</p>
          <p className="text-xs text-ash mt-2">可尝试重新执行 `npm run generate` 后刷新页面</p>
        </main>
      </div>
    )
  }

  if (!daily) return <div className="min-h-screen"><Navbar /><Loading /></div>

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Daily Poem Hero */}
        <section className="mb-10">
          <p className="text-xs text-ash mb-4 tracking-widest uppercase">今日诗词</p>
          <div className="card p-8">
            <div className="text-center mb-6">
              <h2 className="font-serif text-2xl font-semibold mb-2">{daily.title}</h2>
              <p className="text-sm text-ash">〔{daily.dynasty}〕{daily.author}</p>
            </div>
            <div className="text-center mb-8">
              <p className="font-serif text-lg poem-line text-ink/80 dark:text-night-text/80">
                {daily.preview}
              </p>
            </div>
            <div className="flex justify-center gap-3">
              <Link href={`/poem/${daily.id}?from=${encodeURIComponent(currentPath || '/')}`} className="btn-primary flex items-center gap-1.5">
                <BookOpen size={14} />
                阅读全文
              </Link>
              <Link href={`/recite/${daily.id}?from=${encodeURIComponent(currentPath || '/')}`} className="btn-ghost flex items-center gap-1.5">
                <Bookmark size={14} />
                开始背诵
              </Link>
            </div>
          </div>
        </section>

        {/* Continue Learning */}
        {continuePoem && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-ash tracking-widest uppercase">继续学习</p>
              <Link href={`/poem/${continuePoem.id}?from=${encodeURIComponent(currentPath || '/')}`} className="text-xs text-ash hover:text-ink dark:hover:text-night-text flex items-center gap-1">
                继续 <ArrowRight size={12} />
              </Link>
            </div>
            <PoemCard poem={continuePoem} />
          </section>
        )}

        {/* Quick Actions */}
        <section className="mb-10">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleRandom}
              className="card p-5 text-left hover:border-stone/40 dark:hover:border-stone/20 transition-colors"
            >
              <Shuffle size={18} className="text-ash mb-2" />
              <p className="text-sm font-medium">随机诗词</p>
              <p className="text-xs text-ash mt-1">偶遇一首好诗</p>
            </button>
            <Link href="/category" className="card p-5 hover:border-stone/40 dark:hover:border-stone/20 transition-colors">
              <BookOpen size={18} className="text-ash mb-2" />
              <p className="text-sm font-medium">分类浏览</p>
              <p className="text-xs text-ash mt-1">按朝代、作者、主题</p>
            </Link>
          </div>
        </section>

        {/* Poem List */}
        <section>
          <p className="text-xs text-ash mb-4 tracking-widest uppercase">诗词集</p>
          <div className="space-y-3">
            {allPoems.map(poem => (
              <PoemCard key={poem.id} poem={poem} />
            ))}
          </div>
          {allPoems.length < totalPoems && (
            <div className="text-center mt-4">
              <button
                className="btn-ghost"
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? '加载中...' : `加载更多 (${allPoems.length}/${totalPoems})`}
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
