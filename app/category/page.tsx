'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Navbar from '@/components/Navbar'
import PoemCard from '@/components/PoemCard'
import SearchBar from '@/components/SearchBar'
import Loading from '@/components/Loading'
import {
  getAllDynasties,
  getAllAuthors,
  getAllTags,
  queryPoems,
  searchPoemsFullText,
} from '@/lib/poems'
import { PoemIndex, PoemSearchHit } from '@/lib/types'
import { Calendar, User, Tag, ChevronDown, ChevronUp } from 'lucide-react'

type FilterType = 'dynasty' | 'author' | 'tag'

const filterTabs: { key: FilterType; label: string; icon: React.ElementType }[] = [
  { key: 'dynasty', label: '朝代', icon: Calendar },
  { key: 'author', label: '作者', icon: User },
  { key: 'tag', label: '主题', icon: Tag },
]

const PAGE_SIZE = 120
const MAX_FILTER_CHIPS = 500
const COLLAPSED_CHIPS = 48

function toSearchHit(poem: PoemIndex): PoemSearchHit {
  return {
    ...poem,
    matchedLines: [],
    matchFields: [],
  }
}

export default function CategoryPage() {
  const [poems, setPoems] = useState<PoemSearchHit[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [dynasties, setDynasties] = useState<string[]>([])
  const [authors, setAuthors] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [queryLoading, setQueryLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [filterType, setFilterType] = useState<FilterType>('dynasty')
  const [selected, setSelected] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAllFilters, setShowAllFilters] = useState(false)

  useEffect(() => {
    async function init() {
      try {
        const [d, a, t] = await Promise.all([
          getAllDynasties(),
          getAllAuthors(),
          getAllTags(),
        ])
        setDynasties(d)
        setAuthors(a)
        setTags(t)
      } catch (e) {
        const msg = e instanceof Error ? e.message : '数据加载失败'
        setError(msg)
      } finally {
        setInitialLoading(false)
      }
    }
    init()
  }, [])

  function buildQuery() {
    const q = searchQuery.trim()
    if (q) return { q }
    if (!selected) return {}
    if (filterType === 'dynasty') return { dynasty: selected }
    if (filterType === 'author') return { author: selected }
    return { tag: selected }
  }

  useEffect(() => {
    if (initialLoading) return
    let cancelled = false

    async function loadFirstPage() {
      setQueryLoading(true)
      setError(null)
      try {
        const q = searchQuery.trim()

        if (q) {
          const res = await searchPoemsFullText({
            q,
            offset: 0,
            limit: PAGE_SIZE,
          })
          if (cancelled) return
          setPoems(res.items)
          setTotal(res.total)
          setHasMore(res.hasMore)
          return
        }

        const res = await queryPoems({
          ...buildQuery(),
          offset: 0,
          limit: PAGE_SIZE,
        })
        if (cancelled) return
        setPoems(res.items.map(toSearchHit))
        setTotal(res.total)
        setHasMore(res.hasMore)
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : '数据加载失败'
        setError(msg)
      } finally {
        if (!cancelled) setQueryLoading(false)
      }
    }

    loadFirstPage()
    return () => { cancelled = true }
  }, [filterType, selected, searchQuery, initialLoading])

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const q = searchQuery.trim()

      if (q) {
        const res = await searchPoemsFullText({
          q,
          offset: poems.length,
          limit: PAGE_SIZE,
        })
        setPoems(prev => [...prev, ...res.items])
        setTotal(res.total)
        setHasMore(res.hasMore)
        return
      }

      const res = await queryPoems({
        ...buildQuery(),
        offset: poems.length,
        limit: PAGE_SIZE,
      })
      setPoems(prev => [...prev, ...res.items.map(toSearchHit)])
      setTotal(res.total)
      setHasMore(res.hasMore)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '加载更多失败'
      setError(msg)
    } finally {
      setLoadingMore(false)
    }
  }

  const items = filterType === 'dynasty' ? dynasties : filterType === 'author' ? authors : tags
  const chipItems = useMemo(() => items.slice(0, MAX_FILTER_CHIPS), [items])
  const visibleChipItems = useMemo(() => {
    if (showAllFilters) return chipItems
    return chipItems.slice(0, COLLAPSED_CHIPS)
  }, [chipItems, showAllFilters])

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q)
    if (q) setSelected(null)
  }, [])

  const handleFilterChange = (type: FilterType) => {
    setFilterType(type)
    setSelected(null)
    setSearchQuery('')
    setShowAllFilters(false)
  }

  if (initialLoading) return <div className="min-h-screen"><Navbar /><Loading /></div>

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
        <h1 className="font-serif text-xl font-semibold mb-6">分类浏览</h1>

        <div className="mb-6">
          <SearchBar onSearch={handleSearch} placeholder="搜索诗名、作者、诗句..." />
        </div>

        {!searchQuery && (
          <>
            <div className="flex gap-1 mb-4">
              {filterTabs.map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => handleFilterChange(key)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-colors
                    ${filterType === key ? 'bg-ink/8 dark:bg-white/8 text-ink dark:text-night-text'
                      : 'text-ash hover:text-ink/70 dark:hover:text-night-text/70'}`}>
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              <button onClick={() => setSelected(null)}
                className={`tag cursor-pointer transition-colors ${!selected ? 'bg-ink/15 dark:bg-white/15 text-ink dark:text-night-text' : ''}`}>
                全部
              </button>
              {visibleChipItems.map(item => (
                <button key={item} onClick={() => setSelected(item)}
                  className={`tag cursor-pointer transition-colors ${selected === item ? 'bg-ink/15 dark:bg-white/15 text-ink dark:text-night-text' : ''}`}>
                  {item}
                </button>
              ))}
            </div>

            {chipItems.length > COLLAPSED_CHIPS && (
              <button
                onClick={() => setShowAllFilters(v => !v)}
                className="btn-ghost text-xs inline-flex items-center gap-1 mb-4"
              >
                {showAllFilters ? (
                  <><ChevronUp size={12} /> 收起标签</>
                ) : (
                  <><ChevronDown size={12} /> 展开全部标签（{chipItems.length}）</>
                )}
              </button>
            )}

            {items.length > MAX_FILTER_CHIPS && (
              <p className="text-xs text-ash mb-6">
                该维度条目较多，仅纳入前 {MAX_FILTER_CHIPS} 项；可用上方搜索覆盖全文诗词。
              </p>
            )}
          </>
        )}

        {searchQuery && (
          <p className="text-xs text-ash mb-4">
            搜索 &ldquo;{searchQuery}&rdquo; 找到 {total} 首（支持诗句全文）
          </p>
        )}
        {queryLoading && (
          <p className="text-xs text-ash mb-4">搜索中...</p>
        )}

        <div className="space-y-3">
          {poems.length > 0 ? (
            poems.map(poem => (
              <PoemCard
                key={poem.id}
                poem={poem}
                highlightQuery={searchQuery || undefined}
                matchedLines={poem.matchedLines}
              />
            ))
          ) : (
            <div className="text-center py-12 text-ash text-sm">未找到相关诗词</div>
          )}
        </div>
        {hasMore && (
          <div className="text-center mt-4 pb-2">
            <button
              className="btn-ghost"
              onClick={handleLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? '加载中...' : `加载更多 (${poems.length}/${total})`}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
