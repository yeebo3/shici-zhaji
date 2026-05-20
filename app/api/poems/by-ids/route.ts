import { NextRequest, NextResponse } from 'next/server'
import { getPoemIndexByIds } from '@/lib/server-poems'

const MAX_IDS = 200
const MAX_RAW_IDS_CHARS = 16000
const MAX_ID_CHARS = 128

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const raw = searchParams.get('ids')?.trim()
    if (!raw) return NextResponse.json({ items: [] })
    if (raw.length > MAX_RAW_IDS_CHARS) {
      return NextResponse.json({ error: 'ids 参数过长。' }, { status: 400 })
    }

    const ids = [...new Set(raw
      .split(',')
      .map(s => s.trim().slice(0, MAX_ID_CHARS))
      .filter(Boolean)
    )].slice(0, MAX_IDS)

    if (ids.length === 0) return NextResponse.json({ items: [] })
    const items = await getPoemIndexByIds(ids)
    return NextResponse.json({ items })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'query failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
