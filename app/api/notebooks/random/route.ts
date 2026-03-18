import { NextRequest, NextResponse } from 'next/server'
import { getRandomPoemIndex } from '@/lib/server-poems'
import { normalizePoemNotebookId } from '@/lib/notebooks'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const notebook = normalizePoemNotebookId(searchParams.get('notebook'))
    const item = await getRandomPoemIndex(notebook)
    return NextResponse.json(item)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'query failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
