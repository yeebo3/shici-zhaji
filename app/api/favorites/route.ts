import { NextRequest, NextResponse } from 'next/server'
import { getPoemIndexByIds } from '@/lib/server-poems'

function normalizeIds(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return [...new Set(input.map(String).map(s => s.trim()).filter(Boolean))]
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const raw = searchParams.get('ids')?.trim() || ''
    const ids = raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    const items = await getPoemIndexByIds(ids)
    return NextResponse.json({ ids, items })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'query failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const action = String(body?.action || 'resolve')
    const poemId = typeof body?.poemId === 'string' ? body.poemId : ''
    let ids = normalizeIds(body?.ids)

    if (poemId) {
      if (action === 'add' && !ids.includes(poemId)) ids = [...ids, poemId]
      if (action === 'remove') ids = ids.filter(id => id !== poemId)
      if (action === 'toggle') {
        ids = ids.includes(poemId)
          ? ids.filter(id => id !== poemId)
          : [...ids, poemId]
      }
    }

    const items = await getPoemIndexByIds(ids)
    return NextResponse.json({
      ids,
      items,
      total: ids.length,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'query failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
