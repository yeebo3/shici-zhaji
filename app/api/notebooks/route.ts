import { NextResponse } from 'next/server'
import { listPoemNotebooks } from '@/lib/server-poems'

export async function GET() {
  try {
    const items = await listPoemNotebooks()
    return NextResponse.json({ items })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'query failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
