import { NextRequest, NextResponse } from 'next/server'
import { searchPoemsFullText } from '@/lib/server-poems'
import { normalizePoemNotebookId } from '@/lib/notebooks'

const DEFAULT_LIMIT = 60
const MAX_LIMIT = 100
const MAX_QUERY_CHARS = 80
const MIN_QUERY_CHARS_FOR_TOTAL = 2

function parseNonNegativeInt(value: string | null, fallback: number): number {
  if (!value) return fallback
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n) || n < 0) return fallback
  return n
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim() || ''
    if (q.length > MAX_QUERY_CHARS) {
      return NextResponse.json({ error: '搜索关键词过长。' }, { status: 400 })
    }
    const withTotalRaw = searchParams.get('withTotal')?.trim()
    const withTotal = q.length >= MIN_QUERY_CHARS_FOR_TOTAL && (withTotalRaw === '1' || withTotalRaw === 'true')
    const notebook = normalizePoemNotebookId(searchParams.get('notebook'))
    const offset = parseNonNegativeInt(searchParams.get('offset'), 0)
    const reqLimit = parseNonNegativeInt(searchParams.get('limit'), DEFAULT_LIMIT)
    const limit = Math.max(1, Math.min(reqLimit, MAX_LIMIT))

    const result = await searchPoemsFullText({
      q,
      notebook,
      offset,
      limit,
      withTotal,
    })

    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'query failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
