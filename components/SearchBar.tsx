'use client'

import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export default function SearchBar({
  onSearch,
  placeholder = '搜索诗名、作者...',
  debounceMs = 350,
}: {
  onSearch: (query: string) => void
  placeholder?: string
  debounceMs?: number
}) {
  const [query, setQuery] = useState('')
  const [isComposing, setIsComposing] = useState(false)
  const onSearchRef = useRef(onSearch)

  useEffect(() => {
    onSearchRef.current = onSearch
  }, [onSearch])

  useEffect(() => {
    if (isComposing) return
    const timer = window.setTimeout(() => {
      onSearchRef.current(query)
    }, debounceMs)
    return () => window.clearTimeout(timer)
  }, [query, isComposing, debounceMs])

  const handleChange = (val: string) => setQuery(val)

  return (
    <div className="relative">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ash" />
      <input
        type="text"
        value={query}
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
          onClick={() => handleChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ash hover:text-ink dark:hover:text-night-text"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
