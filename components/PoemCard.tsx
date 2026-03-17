'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PoemIndex } from '@/lib/types'
import { ReactNode } from 'react'

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function renderHighlighted(text: string, query?: string): ReactNode {
  const q = (query || '').trim()
  if (!q) return text
  const re = new RegExp(`(${escapeRegExp(q)})`, 'ig')
  const parts = text.split(re)
  return parts.map((part, idx) => {
    if (part.toLowerCase() === q.toLowerCase()) {
      return (
        <mark
          key={`${part}-${idx}`}
          className="px-0.5 rounded bg-amber-200/70 text-ink dark:bg-amber-300/20 dark:text-night-text"
        >
          {part}
        </mark>
      )
    }
    return <span key={`${part}-${idx}`}>{part}</span>
  })
}

export default function PoemCard({
  poem,
  compact,
  highlightQuery,
  matchedLines,
}: {
  poem: PoemIndex
  compact?: boolean
  highlightQuery?: string
  matchedLines?: string[]
}) {
  const pathname = usePathname()
  const shownMatchedLines = (matchedLines || []).slice(0, 2)
  const currentPath = pathname || '/'
  const poemHref =
    `/poem?id=${encodeURIComponent(poem.id)}` +
    `&s=${poem.shard}` +
    `&from=${encodeURIComponent(currentPath || '/')}`

  return (
    <Link href={poemHref} className="block">
      <div className="card p-5 hover:border-stone/40 dark:hover:border-stone/20 transition-colors">
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-serif text-lg font-medium">
            {renderHighlighted(poem.title, highlightQuery)}
          </h3>
          <span className="text-xs text-ash mt-1">{poem.dynasty}</span>
        </div>
        <p className="text-sm text-ash mb-3">{renderHighlighted(poem.author, highlightQuery)}</p>
        {!compact && shownMatchedLines.length > 0 && (
          <div className="space-y-1 mb-2">
            {shownMatchedLines.map((line, idx) => (
              <p key={`${line}-${idx}`} className="font-serif text-sm text-ink/65 dark:text-night-text/65 leading-relaxed line-clamp-2">
                {renderHighlighted(line, highlightQuery)}
              </p>
            ))}
          </div>
        )}
        {!compact && shownMatchedLines.length === 0 && poem.preview && (
          <p className="font-serif text-sm text-ink/60 dark:text-night-text/60 leading-relaxed line-clamp-2">
            {renderHighlighted(poem.preview, highlightQuery)}
          </p>
        )}
        <div className="flex gap-1.5 mt-3">
          {poem.tags.slice(0, 3).map(tag => (
            <span key={tag} className="tag">{tag}</span>
          ))}
        </div>
      </div>
    </Link>
  )
}
