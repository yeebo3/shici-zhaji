import { Buffer } from 'node:buffer'
import { NextResponse } from 'next/server'

const DEFAULT_BODY_LIMIT_BYTES = 64 * 1024
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000
const DEFAULT_RATE_LIMIT_MAX = 12
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

type RateLimitOptions = {
  bodyLimitBytes?: number
  rateLimitMax?: number
  rateLimitWindowMs?: number
}

type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; response: NextResponse }

function getClientKey(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (forwardedFor) return forwardedFor
  return req.headers.get('x-real-ip')?.trim() || 'local'
}

function isSameOrigin(req: Request): boolean {
  const requestOrigin = new URL(req.url).origin
  const origin = req.headers.get('origin')
  if (origin) {
    try {
      return new URL(origin).origin === requestOrigin
    } catch {
      return false
    }
  }

  const referer = req.headers.get('referer')
  if (!referer) return true
  try {
    return new URL(referer).origin === requestOrigin
  } catch {
    return false
  }
}

function hasRequiredProxyToken(req: Request): boolean {
  const requiredToken = process.env.AI_PROXY_TOKEN?.trim()
  if (!requiredToken) return true

  const headerToken = req.headers.get('x-ai-proxy-token')?.trim()
  const auth = req.headers.get('authorization')?.trim()
  const bearerToken = auth?.toLowerCase().startsWith('bearer ')
    ? auth.slice(7).trim()
    : ''
  return headerToken === requiredToken || bearerToken === requiredToken
}

export function guardAiRoute(req: Request, opts: RateLimitOptions = {}): NextResponse | null {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: '不允许跨站调用 AI 接口。' }, { status: 403 })
  }

  if (!hasRequiredProxyToken(req)) {
    return NextResponse.json({ error: 'AI 接口缺少访问凭证。' }, { status: 401 })
  }

  const now = Date.now()
  const windowMs = opts.rateLimitWindowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS
  const max = opts.rateLimitMax ?? DEFAULT_RATE_LIMIT_MAX
  const key = getClientKey(req)
  const bucket = rateBuckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs })
    return null
  }

  bucket.count += 1
  if (bucket.count > max) {
    return NextResponse.json(
      { error: 'AI 请求过于频繁，请稍后再试。' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((bucket.resetAt - now) / 1000)) } }
    )
  }

  if (rateBuckets.size > 1024) {
    for (const [bucketKey, value] of rateBuckets) {
      if (value.resetAt <= now) rateBuckets.delete(bucketKey)
    }
  }

  return null
}

export async function readLimitedJsonBody(
  req: Request,
  limitBytes = DEFAULT_BODY_LIMIT_BYTES
): Promise<JsonBodyResult> {
  const rawLength = req.headers.get('content-length')
  const contentLength = rawLength ? Number.parseInt(rawLength, 10) : 0
  if (Number.isFinite(contentLength) && contentLength > limitBytes) {
    return {
      ok: false,
      response: NextResponse.json({ error: '请求内容过大。' }, { status: 413 }),
    }
  }

  const text = await req.text()
  if (Buffer.byteLength(text, 'utf8') > limitBytes) {
    return {
      ok: false,
      response: NextResponse.json({ error: '请求内容过大。' }, { status: 413 }),
    }
  }

  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: '请求内容格式不正确。' }, { status: 400 }),
    }
  }
}
