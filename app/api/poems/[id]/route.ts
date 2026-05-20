import { NextResponse } from 'next/server'
import { getPoemById } from '@/lib/server-poems'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params
    const id = decodeURIComponent(rawId)
    const url = new URL(req.url)
    const rawShard = url.searchParams.get('shard')
    const shardHint = rawShard !== null ? Number.parseInt(rawShard, 10) : undefined
    const poem = await getPoemById(id, Number.isInteger(shardHint) ? shardHint : undefined)
    if (!poem) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    return NextResponse.json(poem)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'query failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
