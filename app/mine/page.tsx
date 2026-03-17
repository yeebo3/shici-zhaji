'use client'

import { useState, useEffect, useCallback } from 'react'
import Navbar from '@/components/Navbar'
import PoemCard from '@/components/PoemCard'
import Loading from '@/components/Loading'
import GroupManager from '@/components/GroupManager'
import { useStudyStats } from '@/hooks/useStudy'
import { getFavorites, getMemorized, getRecentlyViewed } from '@/lib/storage'
import { getPoemIndexByIds } from '@/lib/poems'
import { PoemIndex } from '@/lib/types'
import { BookOpen, Heart, Brain, RotateCcw, Clock, FolderTree } from 'lucide-react'

type Tab = 'recent' | 'favorites' | 'memorized' | 'groups'

export default function MinePage() {
  const { stats, refresh } = useStudyStats()
  const [recentIds, setRecentIds] = useState<string[]>([])
  const [tab, setTab] = useState<Tab>('recent')
  const [recentPoems, setRecentPoems] = useState<PoemIndex[]>([])
  const [favoritePoems, setFavoritePoems] = useState<PoemIndex[]>([])
  const [memorizedPoems, setMemorizedPoems] = useState<PoemIndex[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshStudyMeta = useCallback(async () => {
    await refresh()
    const recent = (await getRecentlyViewed()).map(r => r.poemId)
    setRecentIds(recent)
  }, [refresh])

  useEffect(() => {
    void refreshStudyMeta()

    const onFocus = () => { void refreshStudyMeta() }
    window.addEventListener('focus', onFocus)
    window.addEventListener('storage', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('storage', onFocus)
    }
  }, [refreshStudyMeta])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const [favoriteIds, memorizedIds] = await Promise.all([
          getFavorites(),
          getMemorized(),
        ])

        const [recent, favorites, memorized] = await Promise.all([
          getPoemIndexByIds(recentIds),
          getPoemIndexByIds(favoriteIds),
          getPoemIndexByIds(memorizedIds),
        ])

        if (cancelled) return
        setRecentPoems(recent)
        setFavoritePoems(favorites)
        setMemorizedPoems(memorized)
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : '数据加载失败'
        setError(msg)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [recentIds, stats.totalFavorites, stats.totalMemorized, stats.totalViewed])

  const currentPoems = tab === 'recent'
    ? recentPoems
    : tab === 'favorites'
    ? favoritePoems
    : memorizedPoems

  const statCards = [
    { label: '已学习', value: stats.totalViewed, icon: BookOpen, color: 'text-ink/70 dark:text-night-text/70' },
    { label: '已收藏', value: stats.totalFavorites, icon: Heart, color: 'text-red-400' },
    { label: '已掌握', value: stats.totalMemorized, icon: Brain, color: 'text-emerald-500' },
    { label: '复习次数', value: stats.totalReviews, icon: RotateCcw, color: 'text-amber-500' },
  ]

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'recent', label: '最近学习', icon: Clock },
    { key: 'favorites', label: '收藏夹', icon: Heart },
    { key: 'memorized', label: '已掌握', icon: Brain },
    { key: 'groups', label: '分组', icon: FolderTree },
  ]

  if (loading) return <div className="min-h-screen"><Navbar /><Loading /></div>

  if (error) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="max-w-2xl mx-auto px-4 py-20 text-center">
          <p className="text-sm text-ash">加载失败：{error}</p>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="font-serif text-xl font-semibold mb-6">我的学习</h1>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {statCards.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="card p-4 text-center">
              <Icon size={18} className={`mx-auto mb-2 ${color}`} />
              <p className="text-xl font-semibold font-serif">{value}</p>
              <p className="text-xs text-ash mt-1">{label}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-1 mb-6 flex-wrap">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors
                ${tab === key ? 'bg-ink/8 dark:bg-white/8 text-ink dark:text-night-text'
                  : 'text-ash hover:text-ink/70 dark:hover:text-night-text/70'}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {tab === 'groups' ? (
          <GroupManager />
        ) : (
          <div className="space-y-3">
            {currentPoems.length > 0 ? (
              currentPoems.map(poem => <PoemCard key={poem.id} poem={poem} />)
            ) : (
              <div className="text-center py-16 text-ash text-sm">
                {tab === 'recent' && '还没有学习记录，去首页开始吧'}
                {tab === 'favorites' && '收藏夹还没有诗词'}
                {tab === 'memorized' && '还没有标记为已掌握的诗词'}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
