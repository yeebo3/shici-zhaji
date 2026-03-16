import { NextResponse } from 'next/server'
import { getPoemById } from '@/lib/server-poems'

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = decodeURIComponent(params.id)
    const poem = await getPoemById(id)
    if (!poem) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    return NextResponse.json(poem)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'query failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
