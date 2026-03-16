import { NextRequest, NextResponse } from 'next/server'
import { PoemGroup } from '@/lib/types'
import { getPoemIndexByIds } from '@/lib/server-poems'

type GroupInput = {
  id?: unknown
  name?: unknown
  poemIds?: unknown
}

function normalizeGroup(group: GroupInput): PoemGroup | null {
  const id = typeof group.id === 'string' ? group.id.trim() : ''
  const name = typeof group.name === 'string' ? group.name.trim() : ''
  if (!id || !name) return null
  const poemIds = Array.isArray(group.poemIds)
    ? [...new Set(group.poemIds.map(String).map(s => s.trim()).filter(Boolean))]
    : []
  const now = new Date().toISOString()
  return {
    id,
    name,
    poemIds,
    createdAt: now,
    updatedAt: now,
  }
}

function normalizeGroups(input: unknown): PoemGroup[] {
  if (!Array.isArray(input)) return []
  const out: PoemGroup[] = []
  for (const item of input) {
    const g = normalizeGroup(item as GroupInput)
    if (g) out.push(g)
  }
  return out
}

function makeGroupId(): string {
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
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
    return NextResponse.json({ items })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'query failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const action = String(body?.action || '')
    const groupId = typeof body?.groupId === 'string' ? body.groupId.trim() : ''
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const poemId = typeof body?.poemId === 'string' ? body.poemId.trim() : ''
    const groups = normalizeGroups(body?.groups)

    if (action === 'create') {
      const next: PoemGroup = {
        id: makeGroupId(),
        name: name || '未命名分组',
        poemIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      return NextResponse.json({ groups: [next, ...groups], changed: true })
    }

    const found = groups.find(g => g.id === groupId)

    if (action === 'rename' && found && name) {
      found.name = name
      found.updatedAt = new Date().toISOString()
      return NextResponse.json({ groups, changed: true })
    }

    if (action === 'delete') {
      return NextResponse.json({
        groups: groups.filter(g => g.id !== groupId),
        changed: true,
      })
    }

    if (action === 'add-poem' && found && poemId) {
      if (!found.poemIds.includes(poemId)) found.poemIds.push(poemId)
      found.updatedAt = new Date().toISOString()
      return NextResponse.json({ groups, changed: true })
    }

    if (action === 'remove-poem' && found && poemId) {
      found.poemIds = found.poemIds.filter(id => id !== poemId)
      found.updatedAt = new Date().toISOString()
      return NextResponse.json({ groups, changed: true })
    }

    if (action === 'resolve' && found) {
      const items = await getPoemIndexByIds(found.poemIds)
      return NextResponse.json({ groups, group: found, items, changed: false })
    }

    return NextResponse.json({ groups, changed: false })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'query failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
