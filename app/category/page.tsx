'use client'

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
import { Calendar, Search, User, Tag } from 'lucide-react'

type FilterType = 'dynasty' | 'author' | 'tag'

const filterTabs: { key: FilterType; label: string; icon: React.ElementType }[] = [
  { key: 'dynasty', label: '朝代', icon: Calendar },
  { key: 'author', label: '作者', icon: User },
  { key: 'tag', label: '主题', icon: Tag },
]

const PAGE_SIZE = 48
const FILTER_ITEM_LIMIT = 48
const MIN_SEARCH_QUERY_LENGTH = 1
const MAX_SEARCH_QUERY_LENGTH = 80

function toSearchHit(poem: PoemIndex): PoemSearchHit {
  return {
    ...poem,
    matchedLines: [],
    matchFields: [],
  }
}

function CategoryPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialFilterType = (() => {
    const value = searchParams.get('type')
    return value === 'author' || value === 'tag' ? value : 'dynasty'
  })()
  const initialSearchQuery = (searchParams.get('q') || '').trim().slice(0, MAX_SEARCH_QUERY_LENGTH)
  const initialSelected = initialSearchQuery ? null : (searchParams.get('value') || '').trim() || null
  const [poems, setPoems] = useState<PoemSearchHit[]>([])
  const [total, setTotal] = useState<number | null>(0)
  const [hasMore, setHasMore] = useState(false)
  const [dynasties, setDynasties] = useState<string[]>([])
  const [authors, setAuthors] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [queryLoading, setQueryLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [filterType, setFilterType] = useState<FilterType>(initialFilterType)
  const [selected, setSelected] = useState<string | null>(initialSelected)
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery)
  const [filterQuery, setFilterQuery] = useState('')
  const queryAbortRef = useRef<AbortController | null>(null)

  const returnPath = useMemo(() => {
    const params = new URLSearchParams()
    if (searchQuery) {
      params.set('q', searchQuery)
    } else {
      params.set('type', filterType)
      if (selected) params.set('value', selected)
    }
    const query = params.toString()
    return query ? `/category?${query}` : '/category'
  }, [filterType, searchQuery, selected])

  useEffect(() => {
    const currentQuery = searchParams.toString()
    const currentPath = currentQuery ? `/category?${currentQuery}` : '/category'
    if (currentPath !== returnPath) {
      router.replace(returnPath, { scroll: false })
    }
  }, [returnPath, router, searchParams])

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
    const controller = new AbortController()

    if (queryAbortRef.current) {
      queryAbortRef.current.abort()
    }
    queryAbortRef.current = controller

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
            signal: controller.signal,
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
          signal: controller.signal,
        })
        if (cancelled) return
        setPoems(res.items.map(toSearchHit))
        setTotal(res.total)
        setHasMore(res.hasMore)
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
        if (cancelled) return
        const msg = e instanceof Error ? e.message : '数据加载失败'
        setError(msg)
      } finally {
        if (!cancelled && queryAbortRef.current === controller) {
          setQueryLoading(false)
        }
      }
    }

    loadFirstPage()
    return () => {
      cancelled = true
      controller.abort()
      if (queryAbortRef.current === controller) {
        queryAbortRef.current = null
      }
    }
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
  const matchingFilterItems = useMemo(() => {
    const q = filterQuery.trim().toLocaleLowerCase('zh-CN')
    const matched = q
      ? items.filter(item => item.toLocaleLowerCase('zh-CN').includes(q))
      : items
    const visible = matched.slice(0, FILTER_ITEM_LIMIT)
    if (selected && matched.includes(selected) && !visible.includes(selected)) {
      return [selected, ...visible].slice(0, FILTER_ITEM_LIMIT)
    }
    return visible
  }, [filterQuery, items, selected])
  const matchingFilterCount = useMemo(() => {
    const q = filterQuery.trim().toLocaleLowerCase('zh-CN')
    return q ? items.filter(item => item.toLocaleLowerCase('zh-CN').includes(q)).length : items.length
  }, [filterQuery, items])

  const handleSearch = useCallback((q: string) => {
    const next = q.trim().slice(0, MAX_SEARCH_QUERY_LENGTH)
    setSearchQuery(next)
    if (next) setSelected(null)
  }, [])

  const handleFilterChange = (type: FilterType) => {
    setFilterType(type)
    setSelected(null)
    setSearchQuery('')
    setFilterQuery('')
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
          <SearchBar
            onSearch={handleSearch}
            placeholder="搜索诗名、作者、诗句..."
            minLength={MIN_SEARCH_QUERY_LENGTH}
            maxLength={MAX_SEARCH_QUERY_LENGTH}
            initialValue={initialSearchQuery}
          />
        </div>

        {!searchQuery && (
          <>
            <div className="flex gap-1 mb-4">
              {filterTabs.map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => handleFilterChange(key)}
                  aria-pressed={filterType === key}
                  className={`flex min-h-11 items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-colors
                    ${filterType === key ? 'bg-ink/8 dark:bg-white/8 text-ink dark:text-night-text'
                      : 'text-ash hover:text-ink/70 dark:hover:text-night-text/70'}`}>
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>

            {items.length > FILTER_ITEM_LIMIT && (
              <label className="relative block mb-3">
                <span className="sr-only">筛选{filterTabs.find(item => item.key === filterType)?.label}</span>
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ash" />
                <input
                  value={filterQuery}
                  onChange={event => setFilterQuery(event.target.value.slice(0, 40))}
                  placeholder={`输入${filterTabs.find(item => item.key === filterType)?.label}名称快速筛选`}
                  className="w-full rounded-lg border border-stone/20 bg-cream py-2.5 pl-9 pr-3 text-sm dark:border-stone/10 dark:bg-night-card"
                />
              </label>
            )}

            <div className="flex flex-wrap gap-2 mb-3">
              <button onClick={() => setSelected(null)}
                aria-pressed={!selected}
                className={`tag min-h-9 cursor-pointer transition-colors ${!selected ? 'bg-ink/15 dark:bg-white/15 text-ink dark:text-night-text' : ''}`}>
                全部
              </button>
              {matchingFilterItems.map(item => (
                <button key={item} onClick={() => setSelected(item)}
                  aria-pressed={selected === item}
                  className={`tag min-h-9 cursor-pointer transition-colors ${selected === item ? 'bg-ink/15 dark:bg-white/15 text-ink dark:text-night-text' : ''}`}>
                  {item}
                </button>
              ))}
            </div>

            {matchingFilterCount > FILTER_ITEM_LIMIT && (
              <p className="text-xs text-ash mb-6">
                当前匹配 {matchingFilterCount} 项，先显示前 {FILTER_ITEM_LIMIT} 项；继续输入可缩小范围。
              </p>
            )}
          </>
        )}

        {searchQuery && (
          <p className="text-xs text-ash mb-4">
            搜索 &ldquo;{searchQuery}&rdquo;
            {total === null ? ` 已加载 ${poems.length} 首（增量检索）` : ` 找到 ${total} 首`}
            （支持诗句全文）
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
                returnPath={returnPath}
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
              {loadingMore
                ? '加载中...'
                : total === null
                ? `加载更多 (${poems.length}${hasMore ? '+' : ''})`
                : `加载更多 (${poems.length}/${total})`}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

function CategoryPageFallback() {
  return <div className="min-h-screen"><Navbar /><Loading /></div>
}

export default function CategoryPage() {
  return (
    <Suspense fallback={<CategoryPageFallback />}>
      <CategoryPageContent />
    </Suspense>
  )
}
