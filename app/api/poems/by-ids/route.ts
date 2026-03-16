import { NextRequest, NextResponse } from 'next/server'
import { getPoemIndexByIds } from '@/lib/server-poems'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const raw = searchParams.get('ids')?.trim()
    if (!raw) return NextResponse.json({ items: [] })

    const ids = raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    if (ids.length === 0) return NextResponse.json({ items: [] })
    const items = await getPoemIndexByIds(ids)
    return NextResponse.json({ items })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'query failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
