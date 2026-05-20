import { NextResponse } from 'next/server'
import { getPoemIndexById } from '@/lib/server-poems'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params
    const id = decodeURIComponent(rawId)
    const item = await getPoemIndexById(id)
    if (!item) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    return NextResponse.json(item)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'query failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
