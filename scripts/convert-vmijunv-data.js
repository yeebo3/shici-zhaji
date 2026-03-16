#!/usr/bin/env node
/**
 * 将 vmijunv 原始古诗文数据转换为项目统一结构
 *
 * 输入（默认）:
 *   data/sources/vmijunv/raw/作品/*.json
 *
 * 输出:
 *   data/sources/vmijunv/converted/*.json
 *   data/sources/vmijunv/converted/_summary.json
 *
 * 默认会跳过 works.json（全集），优先使用按朝代分片文件，避免重复。
 *
 * 用法:
 *   node scripts/convert-vmijunv-data.js
 *   node scripts/convert-vmijunv-data.js --include-master
 *   node scripts/convert-vmijunv-data.js --limit 100
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const RAW_WORKS_DIR = path.join(ROOT, 'data', 'sources', 'vmijunv', 'raw', '作品')
const OUTPUT_DIR = path.join(ROOT, 'data', 'sources', 'vmijunv', 'converted')

const KNOWN_KEYS = new Set([
  'Id', 'Title', 'Dynasty', 'Author', 'AuthorId', 'Kind',
  'Content', 'Translation', 'Comment', 'Intro', 'Annotation', 'PostsCount',
])

function getArg(args, name, defaultVal) {
  const i = args.indexOf(name)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : defaultVal
}

function hasFlag(args, name) {
  return args.includes(name)
}

function toStringSafe(val) {
  if (val === null || val === undefined) return ''
  if (Array.isArray(val)) return val.map(v => toStringSafe(v)).filter(Boolean).join('\n')
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  return typeof val === 'string' ? val : ''
}

function splitToLines(val) {
  const text = toStringSafe(val).replace(/\r\n/g, '\n').trim()
  if (!text) return []
  return text
    .split(/\n+/)
    .map(s => s.trim())
    .filter(Boolean)
}

function parseTags(kindVal) {
  const kind = toStringSafe(kindVal).trim()
  if (!kind) return []
  return kind
    .split(/[，,、;；|/]+/)
    .map(s => s.trim())
    .filter(Boolean)
}

function buildAppreciation(raw) {
  const intro = toStringSafe(raw.Intro).trim()
  const comment = toStringSafe(raw.Comment).trim()
  if (intro && comment) return `${intro}\n\n${comment}`
  return intro || comment || ''
}

function extractExtraFields(raw) {
  const extra = {}
  for (const [k, v] of Object.entries(raw)) {
    if (!KNOWN_KEYS.has(k) && v !== null && v !== undefined && v !== '') {
      extra[k] = v
    }
  }
  return extra
}

function normalizeRecord(raw, fileName, index) {
  const rawId = raw.Id ?? `${fileName}-${index}`
  const id = `vm-${rawId}`

  const title = toStringSafe(raw.Title).trim() || `未命名-${id}`
  const author = toStringSafe(raw.Author).trim() || '佚名'
  const dynasty = toStringSafe(raw.Dynasty).trim() || '未知'

  const content = splitToLines(raw.Content)
  const annotation = splitToLines(raw.Annotation)
  const translation = toStringSafe(raw.Translation).trim()
  const appreciation = buildAppreciation(raw)
  const tags = parseTags(raw.Kind)

  const extraFields = extractExtraFields(raw)
  const sourceMeta = {
    rawId: raw.Id ?? null,
    authorId: raw.AuthorId ?? null,
    postsCount: raw.PostsCount ?? null,
    kind: toStringSafe(raw.Kind).trim() || null,
  }
  if (Object.keys(extraFields).length > 0) sourceMeta.extra = extraFields

  return {
    id,
    title,
    author,
    dynasty,
    content,
    annotation,
    translation,
    appreciation,
    tags,
    source: 'vmijunv',
    sourceMeta,
  }
}

function main() {
  const args = process.argv.slice(2)
  const includeMaster = hasFlag(args, '--include-master')
  const limit = parseInt(getArg(args, '--limit', '0'), 10)

  if (!fs.existsSync(RAW_WORKS_DIR)) {
    console.error(`未找到原始目录: ${RAW_WORKS_DIR}`)
    process.exit(1)
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  let files = fs.readdirSync(RAW_WORKS_DIR)
    .filter(f => f.endsWith('.json') && f.startsWith('works'))
    .sort()

  if (!includeMaster) {
    files = files.filter(f => f !== 'works.json')
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    sourceDir: RAW_WORKS_DIR,
    outputDir: OUTPUT_DIR,
    includeMaster,
    limitPerFile: limit > 0 ? limit : null,
    files: [],
    totals: {
      inputRecords: 0,
      outputRecords: 0,
      emptyContent: 0,
      emptyAnnotation: 0,
      emptyTranslation: 0,
      emptyAppreciation: 0,
      emptyTags: 0,
    },
  }

  console.log('=== vmijunv 数据转换 ===')
  console.log(`输入目录: ${RAW_WORKS_DIR}`)
  console.log(`输出目录: ${OUTPUT_DIR}`)
  console.log(`文件数: ${files.length} (includeMaster=${includeMaster})`)

  for (const fileName of files) {
    const inputPath = path.join(RAW_WORKS_DIR, fileName)
    const outputPath = path.join(OUTPUT_DIR, fileName)

    const raw = JSON.parse(fs.readFileSync(inputPath, 'utf-8'))
    if (!Array.isArray(raw)) {
      console.warn(`跳过 ${fileName}: 顶层不是数组`)
      continue
    }

    const sourceItems = limit > 0 ? raw.slice(0, limit) : raw
    const converted = sourceItems.map((item, idx) => normalizeRecord(item, fileName, idx))

    let emptyContent = 0
    let emptyAnnotation = 0
    let emptyTranslation = 0
    let emptyAppreciation = 0
    let emptyTags = 0

    for (const item of converted) {
      if (item.content.length === 0) emptyContent++
      if (item.annotation.length === 0) emptyAnnotation++
      if (!item.translation) emptyTranslation++
      if (!item.appreciation) emptyAppreciation++
      if (item.tags.length === 0) emptyTags++
    }

    fs.writeFileSync(outputPath, JSON.stringify(converted))

    summary.files.push({
      file: fileName,
      inputRecords: raw.length,
      outputRecords: converted.length,
      emptyContent,
      emptyAnnotation,
      emptyTranslation,
      emptyAppreciation,
      emptyTags,
    })

    summary.totals.inputRecords += raw.length
    summary.totals.outputRecords += converted.length
    summary.totals.emptyContent += emptyContent
    summary.totals.emptyAnnotation += emptyAnnotation
    summary.totals.emptyTranslation += emptyTranslation
    summary.totals.emptyAppreciation += emptyAppreciation
    summary.totals.emptyTags += emptyTags

    console.log(`  ${fileName}: ${raw.length} -> ${converted.length}`)
  }

  const summaryPath = path.join(OUTPUT_DIR, '_summary.json')
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2))
  console.log(`\n完成，汇总: ${summaryPath}`)
}

main()
