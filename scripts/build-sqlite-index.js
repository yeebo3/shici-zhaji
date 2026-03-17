const fs = require('node:fs')
const path = require('node:path')

let DatabaseSync
try {
  ;({ DatabaseSync } = require('node:sqlite'))
} catch (error) {
  console.error(
    '[build-sqlite-index] 当前 Node 版本不支持 node:sqlite，请使用 Node.js 22+ 或 24+ 运行。'
  )
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'public', 'data')
const MANIFEST_PATH = path.join(DATA_DIR, 'manifest.json')
const SHARDS_DIR = path.join(DATA_DIR, 'shards')
const DB_PATH = path.join(DATA_DIR, 'poems-index.db')

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return []
  const out = []
  const seen = new Set()
  for (const raw of tags) {
    const tag = String(raw || '').trim()
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    out.push(tag)
  }
  return out
}

function normalizeLines(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const raw of value) {
    const line = String(raw || '').trim()
    if (!line) continue
    out.push(line)
  }
  return out
}

function normalizeText(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function ensureDataFiles() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`manifest.json 不存在：${MANIFEST_PATH}`)
  }
  if (!fs.existsSync(SHARDS_DIR)) {
    throw new Error(`shards 目录不存在：${SHARDS_DIR}`)
  }
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

function createSchema(db) {
  db.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    PRAGMA temp_store = MEMORY;
    PRAGMA cache_size = -200000;
    PRAGMA foreign_keys = ON;

    CREATE TABLE poems (
      id TEXT PRIMARY KEY,
      seq INTEGER NOT NULL,
      title TEXT NOT NULL,
      title_lc TEXT NOT NULL,
      author TEXT NOT NULL,
      author_lc TEXT NOT NULL,
      dynasty TEXT NOT NULL,
      preview TEXT NOT NULL,
      source TEXT NOT NULL,
      shard INTEGER NOT NULL,
      has_annotation INTEGER NOT NULL,
      tags_json TEXT NOT NULL,
      tags_text TEXT NOT NULL
    );

    CREATE TABLE poem_tags (
      poem_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (poem_id, tag),
      FOREIGN KEY (poem_id) REFERENCES poems(id) ON DELETE CASCADE
    );

    CREATE TABLE poem_details (
      poem_id TEXT PRIMARY KEY,
      content_json TEXT NOT NULL,
      content_text_lc TEXT NOT NULL,
      annotation_json TEXT NOT NULL,
      translation_json TEXT NOT NULL,
      appreciation TEXT NOT NULL,
      FOREIGN KEY (poem_id) REFERENCES poems(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_poems_seq ON poems(seq);
    CREATE INDEX idx_poems_dynasty ON poems(dynasty);
    CREATE INDEX idx_poems_author ON poems(author);
    CREATE INDEX idx_poems_has_annotation ON poems(has_annotation);
    CREATE INDEX idx_poems_shard ON poems(shard);
    CREATE INDEX idx_poem_tags_tag ON poem_tags(tag);
  `)
}

function resolveShardFile(shardMeta) {
  if (!shardMeta || typeof shardMeta !== 'object') return null
  const byFile = typeof shardMeta.file === 'string' && shardMeta.file.trim()
    ? path.join(DATA_DIR, shardMeta.file)
    : null
  if (byFile && fs.existsSync(byFile)) return byFile

  const index = Number.isInteger(shardMeta.index)
    ? shardMeta.index
    : Number.parseInt(String(shardMeta.index || ''), 10)
  if (!Number.isInteger(index) || index < 0) return null

  const fallback = path.join(SHARDS_DIR, `s-${index}.json`)
  if (fs.existsSync(fallback)) return fallback
  return null
}

function buildSqliteIndex() {
  ensureDataFiles()

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
  const shards = Array.isArray(manifest.shards) ? manifest.shards : []
  if (shards.length === 0) {
    throw new Error(`manifest.shards 为空：${MANIFEST_PATH}`)
  }

  let duplicatedIds = 0
  let writtenPoems = 0
  const seenIds = new Set()

  if (fs.existsSync(DB_PATH)) {
    fs.rmSync(DB_PATH, { force: true })
  }

  const db = new DatabaseSync(DB_PATH)
  try {
    createSchema(db)

    const insertPoem = db.prepare(`
      INSERT INTO poems (
        id, seq, title, title_lc, author, author_lc, dynasty,
        preview, source, shard, has_annotation, tags_json, tags_text
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertTag = db.prepare(`
      INSERT INTO poem_tags (poem_id, tag)
      VALUES (?, ?)
    `)

    const insertDetail = db.prepare(`
      INSERT INTO poem_details (
        poem_id, content_json, content_text_lc, annotation_json, translation_json, appreciation
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    db.exec('BEGIN')

    for (const shardMeta of shards) {
      const shardFile = resolveShardFile(shardMeta)
      if (!shardFile) {
        throw new Error(`分片文件不存在：${JSON.stringify(shardMeta)}`)
      }

      const shardRaw = JSON.parse(fs.readFileSync(shardFile, 'utf8'))
      const poems = Array.isArray(shardRaw.poems) ? shardRaw.poems : []
      const shard = Number.isInteger(shardRaw.shard)
        ? shardRaw.shard
        : Number.isInteger(shardMeta.index)
        ? shardMeta.index
        : 0

      for (const item of poems) {
        const id = normalizeText(item && item.id)
        if (!id) continue
        if (seenIds.has(id)) {
          duplicatedIds++
          continue
        }
        seenIds.add(id)

        const title = normalizeText(item && item.title)
        const author = normalizeText(item && item.author)
        const dynasty = normalizeText(item && item.dynasty)
        const source = normalizeText(item && item.source)

        const content = normalizeLines(item && item.content)
        const annotation = normalizeLines(item && item.annotation)
        const translation = normalizeLines(item && item.translation)
        const appreciation = normalizeText(item && item.appreciation)
        const tags = normalizeTags(item && item.tags)

        const preview = content.slice(0, 2).join('')
        const hasAnnotation = annotation.length > 0 ? 1 : 0
        const tagsJson = JSON.stringify(tags)
        const tagsText = tags.map(tag => tag.toLowerCase()).join('\n')

        insertPoem.run(
          id,
          writtenPoems,
          title,
          title.toLowerCase(),
          author,
          author.toLowerCase(),
          dynasty,
          preview,
          source,
          shard,
          hasAnnotation,
          tagsJson,
          tagsText
        )

        insertDetail.run(
          id,
          JSON.stringify(content),
          content.join('\n').toLowerCase(),
          JSON.stringify(annotation),
          JSON.stringify(translation),
          appreciation
        )

        for (const tag of tags) {
          insertTag.run(id, tag)
        }

        writtenPoems++
      }
    }

    db.exec('COMMIT')
    db.exec('ANALYZE')
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // ignore rollback error
    }
    throw error
  } finally {
    db.close()
  }

  const sizeMb = (fs.statSync(DB_PATH).size / 1024 / 1024).toFixed(1)
  console.log(`[build-sqlite-index] 完成：${DB_PATH} (${sizeMb} MB)`)
  console.log(`[build-sqlite-index] 写入诗词：${writtenPoems}`)
  if (duplicatedIds > 0) {
    console.log(`[build-sqlite-index] 已跳过重复 id：${duplicatedIds}`)
  }
}

try {
  buildSqliteIndex()
} catch (error) {
  console.error('[build-sqlite-index] 失败：', error instanceof Error ? error.message : String(error))
  process.exit(1)
}
