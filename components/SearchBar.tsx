'use client'

import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const DEFAULT_HISTORY_KEY = 'shici-search-history'
const MAX_HISTORY_ITEMS = 5

export default function SearchBar({
  onSearch,
  placeholder = '搜索诗名、作者...',
  debounceMs = 350,
  minLength = 2,
  maxLength = 80,
  historyKey = DEFAULT_HISTORY_KEY,
}: {
  onSearch: (query: string) => void
  placeholder?: string
  debounceMs?: number
  minLength?: number
  maxLength?: number
  historyKey?: string
}) {
  const [query, setRawQuery] = useState('')
  const [isComposing, setIsComposing] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const onSearchRef = useRef(onSearch)

  useEffect(() => {
    onSearchRef.current = onSearch
  }, [onSearch])

  useEffect(() => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(historyKey) || '[]')
      if (Array.isArray(parsed)) {
        setHistory(parsed.map(String).map(s => s.trim()).filter(Boolean).slice(0, MAX_HISTORY_ITEMS))
      }
    } catch {
      setHistory([])
    }
  }, [historyKey])

  const rememberQuery = (next: string) => {
    const trimmed = next.trim()
    if (trimmed.length < minLength) return
    setHistory(prev => {
      const out = [trimmed, ...prev.filter(item => item !== trimmed)].slice(0, MAX_HISTORY_ITEMS)
      try {
        window.localStorage.setItem(historyKey, JSON.stringify(out))
      } catch {
        // History is a convenience only.
      }
      return out
    })
  }

  useEffect(() => {
    if (isComposing) return
    const timer = window.setTimeout(() => {
      const trimmed = query.trim()
      const next = trimmed.length >= minLength ? trimmed : ''
      onSearchRef.current(next)
      if (next) rememberQuery(next)
    }, debounceMs)
    return () => window.clearTimeout(timer)
  }, [query, isComposing, debounceMs, minLength])

  const setQuery = (next: string) => {
    const value = next.slice(0, maxLength)
    setRawQuery(value)
  }

  const handleChange = (val: string) => setQuery(val)
  const trimmedQuery = query.trim()
  const showShortHint = trimmedQuery.length > 0 && trimmedQuery.length < minLength

  return (
    <div>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ash" />
        <input
          type="text"
          value={query}
          maxLength={maxLength}
          onChange={e => handleChange(e.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={e => {
            setIsComposing(false)
            setQuery(e.currentTarget.value)
          }}
          placeholder={placeholder}
          className="w-full pl-9 pr-9 py-2.5 rounded-lg bg-cream dark:bg-night-card
                     border border-stone/20 dark:border-stone/10
                     text-sm text-ink dark:text-night-text placeholder:text-ash/50
                     focus:outline-none focus:border-stone/40 dark:focus:border-stone/20
                     transition-colors"
        />
        {query && (
          <button
            type="button"
            onClick={() => handleChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ash hover:text-ink dark:hover:text-night-text"
            aria-label="清除搜索"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {showShortHint && (
        <p className="mt-2 text-xs text-ash">至少输入 {minLength} 个字开始搜索</p>
      )}

      {!query && history.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {history.map(item => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setQuery(item)
                rememberQuery(item)
              }}
              className="tag cursor-pointer text-xs"
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
