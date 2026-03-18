import { NextRequest, NextResponse } from 'next/server'
import { queryPoemIndex } from '@/lib/server-poems'
import { normalizePoemNotebookId } from '@/lib/notebooks'

const DEFAULT_LIMIT = 120
const MAX_LIMIT = 300

function parseNonNegativeInt(value: string | null, fallback: number): number {
  if (!value) return fallback
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n) || n < 0) return fallback
  return n
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim() || undefined
    const dynasty = searchParams.get('dynasty')?.trim() || undefined
    const author = searchParams.get('author')?.trim() || undefined
    const tag = searchParams.get('tag')?.trim() || undefined
    const notebook = normalizePoemNotebookId(searchParams.get('notebook'))
    const offset = parseNonNegativeInt(searchParams.get('offset'), 0)
    const reqLimit = parseNonNegativeInt(searchParams.get('limit'), DEFAULT_LIMIT)
    const limit = Math.max(1, Math.min(reqLimit, MAX_LIMIT))

    const { items, total } = await queryPoemIndex({
      q,
      dynasty,
      author,
      tag,
      notebook,
      offset,
      limit,
    })

    return NextResponse.json({
      items,
      total,
      offset,
      limit,
      hasMore: offset + items.length < total,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'query failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
