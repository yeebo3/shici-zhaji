const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const ROOT = path.resolve(__dirname, '..')
const BUILD_DIR = path.join(ROOT, 'build')
const OUT_ICO = path.join(BUILD_DIR, 'icon.ico')
const OUT_PNG = path.join(BUILD_DIR, 'icon-256.png')

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function createCanvas(size) {
  return {
    width: size,
    height: size,
    data: Buffer.alloc(size * size * 4, 0),
  }
}

function setPixel(canvas, x, y, color) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return
  const idx = (y * canvas.width + x) * 4
  canvas.data[idx] = color.r
  canvas.data[idx + 1] = color.g
  canvas.data[idx + 2] = color.b
  canvas.data[idx + 3] = color.a
}

function fillRect(canvas, x, y, w, h, color) {
  const x0 = clamp(Math.floor(x), 0, canvas.width)
  const y0 = clamp(Math.floor(y), 0, canvas.height)
  const x1 = clamp(Math.ceil(x + w), 0, canvas.width)
  const y1 = clamp(Math.ceil(y + h), 0, canvas.height)
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      setPixel(canvas, xx, yy, color)
    }
  }
}

function fillCircle(canvas, cx, cy, r, color) {
  const x0 = Math.floor(cx - r)
  const x1 = Math.ceil(cx + r)
  const y0 = Math.floor(cy - r)
  const y1 = Math.ceil(cy + r)
  const rr = r * r
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= rr) {
        setPixel(canvas, x, y, color)
      }
    }
  }
}

function fillRoundedRect(canvas, x, y, w, h, r, color) {
  const radius = Math.max(0, Math.min(Math.floor(r), Math.floor(w / 2), Math.floor(h / 2)))
  if (radius === 0) {
    fillRect(canvas, x, y, w, h, color)
    return
  }

  fillRect(canvas, x + radius, y, w - radius * 2, h, color)
  fillRect(canvas, x, y + radius, radius, h - radius * 2, color)
  fillRect(canvas, x + w - radius, y + radius, radius, h - radius * 2, color)
  fillCircle(canvas, x + radius, y + radius, radius, color)
  fillCircle(canvas, x + w - radius - 1, y + radius, radius, color)
  fillCircle(canvas, x + radius, y + h - radius - 1, radius, color)
  fillCircle(canvas, x + w - radius - 1, y + h - radius - 1, radius, color)
}

function drawBackground(canvas) {
  const top = { r: 250, g: 239, b: 216, a: 255 }
  const bottom = { r: 236, g: 213, b: 169, a: 255 }
  for (let y = 0; y < canvas.height; y++) {
    const t = y / Math.max(1, canvas.height - 1)
    const rowColor = {
      r: Math.round(top.r * (1 - t) + bottom.r * t),
      g: Math.round(top.g * (1 - t) + bottom.g * t),
      b: Math.round(top.b * (1 - t) + bottom.b * t),
      a: 255,
    }
    fillRect(canvas, 0, y, canvas.width, 1, rowColor)
  }
}

function drawShiGlyph(canvas) {
  const n = canvas.width
  const fg = { r: 48, g: 36, b: 22, a: 255 }
  const m = Math.round(n * 0.08)
  const card = n - m * 2
  const cardRadius = Math.round(n * 0.15)

  fillRoundedRect(canvas, m, m, card, card, cardRadius, { r: 247, g: 236, b: 214, a: 255 })
  fillRoundedRect(canvas, m + Math.round(n * 0.015), m + Math.round(n * 0.015), card - Math.round(n * 0.03), card - Math.round(n * 0.03), Math.round(cardRadius * 0.86), { r: 243, g: 226, b: 194, a: 255 })

  const x0 = Math.round(n * 0.2)
  const y0 = Math.round(n * 0.2)
  const w = Math.round(n * 0.6)
  const h = Math.round(n * 0.6)
  const strokeRadius = Math.max(2, Math.round(n * 0.02))

  const rr = (rx, ry, rw, rh) => fillRoundedRect(
    canvas,
    Math.round(x0 + w * rx),
    Math.round(y0 + h * ry),
    Math.max(2, Math.round(w * rw)),
    Math.max(2, Math.round(h * rh)),
    strokeRadius,
    fg
  )

  // 左部“讠”
  rr(0.00, 0.05, 0.16, 0.12)
  rr(0.10, 0.23, 0.12, 0.55)
  rr(0.00, 0.47, 0.24, 0.12)
  rr(0.05, 0.74, 0.20, 0.10)

  // 右部“寺”
  rr(0.34, 0.05, 0.60, 0.12)
  rr(0.59, 0.05, 0.12, 0.64)
  rr(0.34, 0.33, 0.60, 0.12)
  rr(0.30, 0.59, 0.66, 0.12)
  rr(0.52, 0.74, 0.32, 0.10)

  // 右下角红色印章点缀
  fillCircle(
    canvas,
    Math.round(n * 0.77),
    Math.round(n * 0.77),
    Math.max(2, Math.round(n * 0.045)),
    { r: 178, g: 49, b: 38, a: 255 }
  )
}

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1)
      crc = (crc >>> 1) ^ (0xedb88320 & mask)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const name = Buffer.from(type, 'ascii')
  const body = Buffer.concat([name, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePNG(canvas) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(canvas.width, 0)
  ihdr.writeUInt32BE(canvas.height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const stride = canvas.width * 4
  const raw = Buffer.alloc((stride + 1) * canvas.height)
  for (let y = 0; y < canvas.height; y++) {
    const rowStart = y * (stride + 1)
    raw[rowStart] = 0 // no filter
    canvas.data.copy(raw, rowStart + 1, y * stride, y * stride + stride)
  }

  const compressed = zlib.deflateSync(raw, { level: 9 })
  const chunks = [
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]
  return Buffer.concat([signature, ...chunks])
}

function toIco(pngImages) {
  const count = pngImages.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // icon
  header.writeUInt16LE(count, 4)

  const entries = []
  const bodies = []
  let offset = 6 + count * 16

  for (const item of pngImages) {
    const entry = Buffer.alloc(16)
    entry[0] = item.size >= 256 ? 0 : item.size
    entry[1] = item.size >= 256 ? 0 : item.size
    entry[2] = 0
    entry[3] = 0
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(item.png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += item.png.length
    entries.push(entry)
    bodies.push(item.png)
  }

  return Buffer.concat([header, ...entries, ...bodies])
}

function generateIconForSize(size) {
  const canvas = createCanvas(size)
  drawBackground(canvas)
  drawShiGlyph(canvas)
  const png = encodePNG(canvas)
  return { size, png }
}

function main() {
  fs.mkdirSync(BUILD_DIR, { recursive: true })

  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const images = sizes.map(generateIconForSize)
  const ico = toIco(images)

  fs.writeFileSync(OUT_ICO, ico)
  fs.writeFileSync(OUT_PNG, images[images.length - 1].png)

  const icoKb = (fs.statSync(OUT_ICO).size / 1024).toFixed(1)
  console.log(`[generate-app-icon] wrote ${OUT_ICO} (${icoKb} KB)`)
  console.log(`[generate-app-icon] wrote ${OUT_PNG}`)
}

main()
