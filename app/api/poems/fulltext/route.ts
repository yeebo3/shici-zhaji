import { NextRequest, NextResponse } from 'next/server'
import { searchPoemsFullText } from '@/lib/server-poems'

const DEFAULT_LIMIT = 60
const MAX_LIMIT = 200

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
    const notebookRaw = searchParams.get('notebook')?.trim()
    const notebook = notebookRaw === 'annotated' || notebookRaw === 'plain'
      ? notebookRaw
      : 'all'
    const offset = parseNonNegativeInt(searchParams.get('offset'), 0)
    const reqLimit = parseNonNegativeInt(searchParams.get('limit'), DEFAULT_LIMIT)
    const limit = Math.max(1, Math.min(reqLimit, MAX_LIMIT))

    const result = await searchPoemsFullText({
      q,
      notebook,
      offset,
      limit,
    })

    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'query failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
