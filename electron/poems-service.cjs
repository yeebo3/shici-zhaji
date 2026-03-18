const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const path = require('node:path')

const DEFAULT_PAGE_LIMIT = 120
const DEFAULT_FULLTEXT_LIMIT = 60
const DEFAULT_NOTEBOOK_ID = 'all'
const NOTEBOOK_CONFIG_PATH = path.join(__dirname, '..', 'lib', 'poem-notebooks.json')

function normalizeStringArray(input) {
  if (!Array.isArray(input)) return undefined
  const values = [...new Set(input.map(item => String(item || '').trim()).filter(Boolean))]
  return values.length > 0 ? values : undefined
}

function normalizeNotebookRule(rule) {
  if (!rule || typeof rule !== 'object') return undefined
  const normalized = {}

  if (typeof rule.requireAnnotation === 'boolean') {
    normalized.requireAnnotation = rule.requireAnnotation
  }

  normalized.dynasties = normalizeStringArray(rule.dynasties)
  normalized.authors = normalizeStringArray(rule.authors)
  normalized.tagsAny = normalizeStringArray(rule.tagsAny)
  normalized.sources = normalizeStringArray(rule.sources)

  if (
    normalized.requireAnnotation === undefined
    && !normalized.dynasties
    && !normalized.authors
    && !normalized.tagsAny
    && !normalized.sources
  ) {
    return undefined
  }

  return normalized
}

function normalizeNotebookDefinition(input) {
  if (!input || typeof input !== 'object') return null

  const id = typeof input.id === 'string' ? input.id.trim() : ''
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const description = typeof input.description === 'string' ? input.description.trim() : ''
  if (!id || !name || !description) return null
  if (id.startsWith('group:')) return null

  return {
    id,
    name,
    description,
    rule: normalizeNotebookRule(input.rule),
  }
}

function loadNotebookDefinitions() {
  let rawList = []
  try {
    const parsed = JSON.parse(fsSync.readFileSync(NOTEBOOK_CONFIG_PATH, 'utf8'))
    rawList = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed && parsed.notebooks) ? parsed.notebooks : []
  } catch {
    rawList = []
  }

  const byId = new Map()
  for (const item of rawList) {
    const normalized = normalizeNotebookDefinition(item)
    if (!normalized || byId.has(normalized.id)) continue
    byId.set(normalized.id, normalized)
  }
  return Array.from(byId.values())
}

const NOTEBOOK_DEFINITIONS = loadNotebookDefinitions()
const NOTEBOOK_DEFINITION_MAP = new Map(NOTEBOOK_DEFINITIONS.map(item => [item.id, item]))
const FIRST_NOTEBOOK_ID = NOTEBOOK_DEFINITIONS[0]
  ? NOTEBOOK_DEFINITIONS[0].id
  : DEFAULT_NOTEBOOK_ID

function normalizeNotebookId(input) {
  const value = typeof input === 'string' ? input.trim() : ''
  if (value && NOTEBOOK_DEFINITION_MAP.has(value)) return value
  if (NOTEBOOK_DEFINITION_MAP.has(DEFAULT_NOTEBOOK_ID)) return DEFAULT_NOTEBOOK_ID
  return FIRST_NOTEBOOK_ID
}

function includesValue(list, value) {
  if (!list || list.length === 0) return true
  if (!value) return false
  return list.includes(value)
}

function matchesTagsAny(list, tags) {
  if (!list || list.length === 0) return true
  if (!Array.isArray(tags) || tags.length === 0) return false
  const tagSet = new Set(tags)
  return list.some(tag => tagSet.has(tag))
}

function resolveHasAnnotation(input) {
  if (typeof input.hasAnnotation === 'boolean') return input.hasAnnotation
  return Array.isArray(input.annotation) && input.annotation.length > 0
}

function matchesNotebookRule(rule, input) {
  if (!rule) return true

  if (typeof rule.requireAnnotation === 'boolean') {
    if (resolveHasAnnotation(input) !== rule.requireAnnotation) return false
  }

  if (!includesValue(rule.dynasties, input.dynasty)) return false
  if (!includesValue(rule.authors, input.author)) return false
  if (!includesValue(rule.sources, input.source)) return false
  if (!matchesTagsAny(rule.tagsAny, input.tags)) return false
  return true
}

function matchesNotebookById(notebookId, input) {
  const normalized = normalizeNotebookId(notebookId)
  const definition = NOTEBOOK_DEFINITION_MAP.get(normalized)
  if (!definition) return true
  return matchesNotebookRule(definition.rule, input)
}

function toNotebookInputFromIndex(poem, hasAnnotation) {
  return {
    dynasty: poem.dynasty,
    author: poem.author,
    tags: poem.tags || [],
    source: poem.source || '',
    hasAnnotation,
  }
}

function toNotebookInputFromPoem(poem) {
  return {
    dynasty: poem.dynasty,
    author: poem.author,
    tags: poem.tags || [],
    source: poem.source || '',
    annotation: poem.annotation,
    hasAnnotation: poem.hasAnnotation,
  }
}

function buildSqlNotebookClause(notebookId, poemAlias = 'p') {
  const definition = NOTEBOOK_DEFINITION_MAP.get(normalizeNotebookId(notebookId))
  if (!definition || !definition.rule) {
    return { where: [], params: [] }
  }

  const where = []
  const params = []
  const rule = definition.rule

  if (typeof rule.requireAnnotation === 'boolean') {
    where.push(`${poemAlias}.has_annotation = ?`)
    params.push(rule.requireAnnotation ? 1 : 0)
  }

  if (Array.isArray(rule.dynasties) && rule.dynasties.length > 0) {
    const placeholders = rule.dynasties.map(() => '?').join(', ')
    where.push(`${poemAlias}.dynasty IN (${placeholders})`)
    params.push(...rule.dynasties)
  }

  if (Array.isArray(rule.authors) && rule.authors.length > 0) {
    const placeholders = rule.authors.map(() => '?').join(', ')
    where.push(`${poemAlias}.author IN (${placeholders})`)
    params.push(...rule.authors)
  }

  if (Array.isArray(rule.sources) && rule.sources.length > 0) {
    const placeholders = rule.sources.map(() => '?').join(', ')
    where.push(`${poemAlias}.source IN (${placeholders})`)
    params.push(...rule.sources)
  }

  if (Array.isArray(rule.tagsAny) && rule.tagsAny.length > 0) {
    const placeholders = rule.tagsAny.map(() => '?').join(', ')
    where.push(`EXISTS (SELECT 1 FROM poem_tags pt WHERE pt.poem_id = ${poemAlias}.id AND pt.tag IN (${placeholders}))`)
    params.push(...rule.tagsAny)
  }

  return { where, params }
}

function createPoemsService({ dataDir, maxCachedShards = 64 }) {
  const indexPath = path.join(dataDir, 'index.json')
  const manifestPath = path.join(dataDir, 'manifest.json')
  const sqlitePath = path.join(dataDir, 'poems-index.db')
  const shardsDir = path.join(dataDir, 'shards')

  let indexCache = null
  let manifestCache = null
  let idToIndexCache = null
  let notebookIndexCache = null
  const shardCache = new Map()
  let sqliteStore = undefined

  function setShardCache(shard, poems) {
    if (shardCache.has(shard)) {
      shardCache.delete(shard)
    }
    shardCache.set(shard, poems)

    if (shardCache.size <= maxCachedShards) return
    const oldest = shardCache.keys().next().value
    if (oldest !== undefined) {
      shardCache.delete(oldest)
    }
  }

  function normalizeNotebook(notebook) {
    return normalizeNotebookId(notebook)
  }

  function hasAnnotation(poem) {
    return Array.isArray(poem.annotation) && poem.annotation.length > 0
  }

  function inNotebook(poem, notebook) {
    return matchesNotebookById(notebook, toNotebookInputFromPoem(poem))
  }

  function buildPreview(content) {
    return (content || []).slice(0, 2).join('')
  }

  function toPoemIndex(poem, shard) {
    return {
      id: poem.id,
      title: poem.title,
      author: poem.author,
      dynasty: poem.dynasty,
      tags: poem.tags || [],
      preview: buildPreview(poem.content),
      source: poem.source || '',
      shard,
      hasAnnotation: hasAnnotation(poem),
    }
  }

  function parseSqliteTags(raw) {
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  function parseSqliteLines(raw) {
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  function toPoemIndexFromSqliteRow(row) {
    return {
      id: row.id,
      title: row.title,
      author: row.author,
      dynasty: row.dynasty,
      tags: parseSqliteTags(row.tagsJson),
      preview: row.preview || '',
      source: row.source || '',
      shard: row.shard,
      hasAnnotation: row.hasAnnotation === 1,
    }
  }

  function createSqliteStore() {
    if (!fsSync.existsSync(sqlitePath)) return null

    let DatabaseSync
    try {
      ;({ DatabaseSync } = require('node:sqlite'))
    } catch {
      process.stderr.write('[poems] node:sqlite unavailable, fallback to JSON index.\n')
      return null
    }

    let db
    try {
      db = new DatabaseSync(sqlitePath, { readOnly: true })
    } catch (error) {
      process.stderr.write(`[poems] open sqlite failed, fallback to JSON index: ${error instanceof Error ? error.message : String(error)}\n`)
      return null
    }
    const selectCols =
      'p.id, p.title, p.author, p.dynasty, p.preview, p.source, p.shard, ' +
      'p.has_annotation AS hasAnnotation, p.tags_json AS tagsJson'
    const selectDetailCols =
      `${selectCols}, d.content_json AS contentJson, d.annotation_json AS annotationJson, ` +
      'd.translation_json AS translationJson, d.appreciation AS appreciation'
    const hasPoemDetails = Boolean(
      db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'poem_details'`).get()
    )

    function buildWhereClause(opts) {
      const where = []
      const params = []

      const notebookClause = buildSqlNotebookClause(opts.notebook, 'p')
      if (notebookClause.where.length > 0) {
        where.push(...notebookClause.where)
        params.push(...notebookClause.params)
      }
      if (opts.dynasty) {
        where.push('p.dynasty = ?')
        params.push(opts.dynasty)
      }
      if (opts.author) {
        where.push('p.author = ?')
        params.push(opts.author)
      }
      if (opts.tag) {
        where.push('EXISTS (SELECT 1 FROM poem_tags pt WHERE pt.poem_id = p.id AND pt.tag = ?)')
        params.push(opts.tag)
      }
      if (opts.q) {
        const qLike = `%${opts.q.toLowerCase()}%`
        where.push('(p.title_lc LIKE ? OR p.author_lc LIKE ? OR p.tags_text LIKE ?)')
        params.push(qLike, qLike, qLike)
      }

      return {
        whereSql: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '',
        params,
      }
    }

    function buildFullTextWhereClause(opts) {
      const where = []
      const params = []

      const notebookClause = buildSqlNotebookClause(opts.notebook, 'p')
      if (notebookClause.where.length > 0) {
        where.push(...notebookClause.where)
        params.push(...notebookClause.params)
      }

      if (opts.q) {
        const qLike = `%${opts.q.toLowerCase()}%`
        where.push('(p.title_lc LIKE ? OR p.author_lc LIKE ? OR p.tags_text LIKE ? OR d.content_text_lc LIKE ?)')
        params.push(qLike, qLike, qLike, qLike)
      }

      return {
        whereSql: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '',
        params,
      }
    }

    function queryPoemIndex(opts) {
      const normalized = normalizeNotebook(opts.notebook)
      const q = typeof opts.q === 'string' ? opts.q.trim() : ''
      const dynasty = typeof opts.dynasty === 'string' ? opts.dynasty.trim() : ''
      const author = typeof opts.author === 'string' ? opts.author.trim() : ''
      const tag = typeof opts.tag === 'string' ? opts.tag.trim() : ''
      const offset = Math.max(0, Number.isFinite(opts.offset) ? opts.offset : Number.parseInt(String(opts.offset || 0), 10) || 0)
      const reqLimit = Number.isFinite(opts.limit) ? opts.limit : Number.parseInt(String(opts.limit || DEFAULT_PAGE_LIMIT), 10) || DEFAULT_PAGE_LIMIT
      const limit = Math.max(1, Math.min(reqLimit, 300))

      const { whereSql, params } = buildWhereClause({ notebook: normalized, q, dynasty, author, tag })
      const countRow = db.prepare(`SELECT COUNT(*) AS total FROM poems p ${whereSql}`).get(...params)
      const total = Number(countRow && countRow.total ? countRow.total : 0)

      const rows = db
        .prepare(`SELECT ${selectCols} FROM poems p ${whereSql} ORDER BY p.seq LIMIT ? OFFSET ?`)
        .all(...params, limit, offset)

      return {
        items: rows.map(toPoemIndexFromSqliteRow),
        total,
        offset,
        limit,
        hasMore: offset + rows.length < total,
      }
    }

    function getPoemIndexById(id) {
      const row = db
        .prepare(`SELECT ${selectCols} FROM poems p WHERE p.id = ?`)
        .get(id)
      return row ? toPoemIndexFromSqliteRow(row) : null
    }

    function getPoemIndexByIds(ids) {
      if (!Array.isArray(ids) || ids.length === 0) return []
      const placeholders = ids.map(() => '?').join(', ')
      const rows = db
        .prepare(`SELECT ${selectCols} FROM poems p WHERE p.id IN (${placeholders})`)
        .all(...ids)
      const byId = new Map(rows.map(row => [row.id, toPoemIndexFromSqliteRow(row)]))
      return ids.map(id => byId.get(id)).filter(Boolean)
    }

    function pickByOffset(opts, pickedOffset) {
      const { whereSql, params } = buildWhereClause(opts)
      const row = db
        .prepare(`SELECT ${selectCols} FROM poems p ${whereSql} ORDER BY p.seq LIMIT 1 OFFSET ?`)
        .get(...params, pickedOffset)
      return row ? toPoemIndexFromSqliteRow(row) : null
    }

    function getRandomPoemIndex(notebook = 'all') {
      const normalized = normalizeNotebook(notebook)
      const { whereSql, params } = buildWhereClause({ notebook: normalized })
      const countRow = db.prepare(`SELECT COUNT(*) AS total FROM poems p ${whereSql}`).get(...params)
      const total = Number(countRow && countRow.total ? countRow.total : 0)
      if (total <= 0) return null
      const pickedOffset = Math.floor(Math.random() * total)
      return pickByOffset({ notebook: normalized }, pickedOffset)
    }

    function getDailyPoemIndex(notebook = 'all') {
      const normalized = normalizeNotebook(notebook)
      const { whereSql, params } = buildWhereClause({ notebook: normalized })
      const countRow = db.prepare(`SELECT COUNT(*) AS total FROM poems p ${whereSql}`).get(...params)
      const total = Number(countRow && countRow.total ? countRow.total : 0)
      if (total <= 0) return null

      const today = new Date()
      const dayOfYear = Math.floor(
        (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000
      )
      return pickByOffset({ notebook: normalized }, dayOfYear % total)
    }

    function listPoemNotebooks() {
      return NOTEBOOK_DEFINITIONS.map(notebook => {
        const { whereSql, params } = buildWhereClause({ notebook: notebook.id })
        const row = db.prepare(`SELECT COUNT(*) AS total FROM poems p ${whereSql}`).get(...params)
        return {
          id: notebook.id,
          name: notebook.name,
          description: notebook.description,
          count: Number(row && row.total ? row.total : 0),
        }
      })
    }

    function getPoemById(id) {
      if (!hasPoemDetails) return null
      const row = db
        .prepare(`SELECT ${selectDetailCols} FROM poems p INNER JOIN poem_details d ON d.poem_id = p.id WHERE p.id = ?`)
        .get(id)
      if (!row) return null
      return {
        id: row.id,
        title: row.title,
        author: row.author,
        dynasty: row.dynasty,
        content: parseSqliteLines(row.contentJson),
        annotation: parseSqliteLines(row.annotationJson),
        translation: parseSqliteLines(row.translationJson),
        appreciation: row.appreciation || '',
        tags: parseSqliteTags(row.tagsJson),
        source: row.source || '',
      }
    }

    function toSearchHitFromSqliteRow(row, qLower) {
      const tags = parseSqliteTags(row.tagsJson)
      const content = parseSqliteLines(row.contentJson)
      const matchFields = []
      if (String(row.title || '').toLowerCase().includes(qLower)) matchFields.push('title')
      if (String(row.author || '').toLowerCase().includes(qLower)) matchFields.push('author')
      if (tags.some(tag => String(tag || '').toLowerCase().includes(qLower))) matchFields.push('tag')
      const matchedLines = content
        .filter(line => String(line || '').toLowerCase().includes(qLower))
        .slice(0, 3)
      if (matchedLines.length > 0) matchFields.push('content')
      if (matchFields.length === 0) return null
      return {
        id: row.id,
        title: row.title,
        author: row.author,
        dynasty: row.dynasty,
        tags,
        preview: row.preview || '',
        source: row.source || '',
        shard: row.shard,
        hasAnnotation: row.hasAnnotation === 1,
        matchedLines,
        matchFields,
      }
    }

    function searchPoemsFullText(opts = {}) {
      if (!hasPoemDetails) return null
      const q = typeof opts.q === 'string' ? opts.q.trim() : ''
      const offset = Math.max(0, Number.isFinite(opts.offset) ? opts.offset : Number.parseInt(String(opts.offset || 0), 10) || 0)
      const reqLimit = Number.isFinite(opts.limit) ? opts.limit : Number.parseInt(String(opts.limit || DEFAULT_FULLTEXT_LIMIT), 10) || DEFAULT_FULLTEXT_LIMIT
      const limit = Math.max(1, Math.min(reqLimit, 200))
      const notebook = normalizeNotebook(opts.notebook)
      const withTotal = opts.withTotal === true

      if (!q) {
        return { items: [], total: withTotal ? 0 : null, offset, limit, hasMore: false, nextOffset: offset }
      }

      const { whereSql, params } = buildFullTextWhereClause({ q, notebook })
      const qLower = q.toLowerCase()

      if (withTotal) {
        const countRow = db
          .prepare(`SELECT COUNT(*) AS total FROM poems p INNER JOIN poem_details d ON d.poem_id = p.id ${whereSql}`)
          .get(...params)
        const total = Number(countRow && countRow.total ? countRow.total : 0)
        const rows = db
          .prepare(`
            SELECT ${selectDetailCols}
            FROM poems p
            INNER JOIN poem_details d ON d.poem_id = p.id
            ${whereSql}
            ORDER BY p.seq
            LIMIT ? OFFSET ?
          `)
          .all(...params, limit, offset)
        const items = rows
          .map(row => toSearchHitFromSqliteRow(row, qLower))
          .filter(Boolean)
        return {
          items,
          total,
          offset,
          limit,
          hasMore: offset + items.length < total,
          nextOffset: offset + items.length,
        }
      }

      const rows = db
        .prepare(`
          SELECT ${selectDetailCols}
          FROM poems p
          INNER JOIN poem_details d ON d.poem_id = p.id
          ${whereSql}
          ORDER BY p.seq
          LIMIT ? OFFSET ?
        `)
        .all(...params, limit + 1, offset)
      const hasMore = rows.length > limit
      const items = rows
        .slice(0, limit)
        .map(row => toSearchHitFromSqliteRow(row, qLower))
        .filter(Boolean)
      return {
        items,
        total: null,
        offset,
        limit,
        hasMore,
        nextOffset: offset + items.length,
      }
    }

    return {
      queryPoemIndex,
      getPoemIndexById,
      getPoemIndexByIds,
      getRandomPoemIndex,
      getDailyPoemIndex,
      listPoemNotebooks,
      getPoemById: hasPoemDetails ? getPoemById : null,
      searchPoemsFullText: hasPoemDetails ? searchPoemsFullText : null,
    }
  }

  function getSqliteStore() {
    if (sqliteStore !== undefined) return sqliteStore
    sqliteStore = createSqliteStore()
    return sqliteStore
  }

  async function loadIndex() {
    if (indexCache) return indexCache
    const raw = await fs.readFile(indexPath, 'utf-8')
    const parsed = JSON.parse(raw)
    indexCache = parsed
    idToIndexCache = new Map(parsed.map(item => [item.id, item]))
    return parsed
  }

  async function loadManifest() {
    if (manifestCache) return manifestCache
    const raw = await fs.readFile(manifestPath, 'utf-8')
    const parsed = JSON.parse(raw)
    manifestCache = parsed
    return parsed
  }

  async function loadShard(shard, opts = {}) {
    const useCache = opts.cache !== false
    const cached = shardCache.get(shard)
    if (cached) {
      if (useCache) setShardCache(shard, cached)
      return cached
    }

    const file = path.join(shardsDir, `s-${shard}.json`)
    const raw = await fs.readFile(file, 'utf-8')
    const parsed = JSON.parse(raw)
    const poems = parsed && Array.isArray(parsed.poems) ? parsed.poems : []

    if (useCache) setShardCache(shard, poems)
    return poems
  }

  async function buildAnnotatedIdSet(index) {
    const hasInlineFlag = index.some(item => typeof item.hasAnnotation === 'boolean')
    if (hasInlineFlag) {
      return new Set(index.filter(item => item.hasAnnotation === true).map(item => item.id))
    }

    const manifest = await loadManifest()
    const annotatedIdSet = new Set()
    for (const shardMeta of manifest.shards || []) {
      const poems = await loadShard(shardMeta.index, { cache: false })
      for (const poem of poems) {
        if (hasAnnotation(poem)) annotatedIdSet.add(poem.id)
      }
    }
    return annotatedIdSet
  }

  async function ensureNotebookIndexCache() {
    if (notebookIndexCache) return

    const index = await loadIndex()
    const annotatedIdSet = await buildAnnotatedIdSet(index)
    const cache = new Map()

    for (const notebook of NOTEBOOK_DEFINITIONS) {
      if (notebook.id === 'all') {
        cache.set(notebook.id, index)
        continue
      }
      const items = index.filter(item => (
        matchesNotebookById(
          notebook.id,
          toNotebookInputFromIndex(item, annotatedIdSet.has(item.id))
        )
      ))
      cache.set(notebook.id, items)
    }

    notebookIndexCache = cache
  }

  async function getNotebookIndex(notebook) {
    const normalized = normalizeNotebook(notebook)
    if (normalized === 'all') return loadIndex()
    await ensureNotebookIndexCache()
    return notebookIndexCache && notebookIndexCache.get(normalized) ? notebookIndexCache.get(normalized) : []
  }

  async function getPoemIndexByGlobalOffset(globalOffset) {
    const manifest = await loadManifest()
    const total = Number.isFinite(manifest.total) ? manifest.total : 0
    if (!Number.isFinite(globalOffset) || globalOffset < 0 || globalOffset >= total) return null

    let remain = globalOffset
    for (const shardMeta of manifest.shards || []) {
      const count = Number.isFinite(shardMeta.count) ? shardMeta.count : 0
      if (remain >= count) {
        remain -= count
        continue
      }

      const poems = await loadShard(shardMeta.index)
      const poem = poems[remain]
      if (!poem) return null
      return toPoemIndex(poem, shardMeta.index)
    }

    return null
  }

  async function queryAllByManifest(offset, limit) {
    const manifest = await loadManifest()
    const total = Number.isFinite(manifest.total) ? manifest.total : 0
    if (offset >= total) {
      return { items: [], total, offset, limit, hasMore: false }
    }

    let remainingSkip = offset
    let remainingTake = limit
    const items = []

    for (const shardMeta of manifest.shards || []) {
      if (remainingTake <= 0) break

      const count = Number.isFinite(shardMeta.count) ? shardMeta.count : 0
      if (remainingSkip >= count) {
        remainingSkip -= count
        continue
      }

      const poems = await loadShard(shardMeta.index)
      const start = remainingSkip
      const end = Math.min(poems.length, start + remainingTake)

      for (let i = start; i < end; i++) {
        const poem = poems[i]
        if (!poem) continue
        items.push(toPoemIndex(poem, shardMeta.index))
      }

      remainingTake -= (end - start)
      remainingSkip = 0
    }

    return {
      items,
      total,
      offset,
      limit,
      hasMore: offset + items.length < total,
    }
  }

  function matches(poem, opts) {
    if (opts.dynasty && poem.dynasty !== opts.dynasty) return false
    if (opts.author && poem.author !== opts.author) return false
    if (opts.tag && !poem.tags.includes(opts.tag)) return false

    if (opts.q) {
      const q = opts.q.toLowerCase()
      if (
        !poem.title.toLowerCase().includes(q) &&
        !poem.author.toLowerCase().includes(q) &&
        !poem.tags.some(tag => tag.toLowerCase().includes(q))
      ) {
        return false
      }
    }

    return true
  }

  async function queryPoemIndex(opts = {}) {
    const sqlite = getSqliteStore()
    if (sqlite) {
      return sqlite.queryPoemIndex(opts)
    }

    const notebook = normalizeNotebook(opts.notebook)
    const q = typeof opts.q === 'string' ? opts.q.trim() : ''
    const dynasty = typeof opts.dynasty === 'string' ? opts.dynasty.trim() : ''
    const author = typeof opts.author === 'string' ? opts.author.trim() : ''
    const tag = typeof opts.tag === 'string' ? opts.tag.trim() : ''
    const offset = Math.max(0, Number.isFinite(opts.offset) ? opts.offset : Number.parseInt(String(opts.offset || 0), 10) || 0)
    const reqLimit = Number.isFinite(opts.limit) ? opts.limit : Number.parseInt(String(opts.limit || DEFAULT_PAGE_LIMIT), 10) || DEFAULT_PAGE_LIMIT
    const limit = Math.max(1, Math.min(reqLimit, 300))

    if (!q && !dynasty && !author && !tag && notebook === 'all') {
      return queryAllByManifest(offset, limit)
    }

    const index = await getNotebookIndex(notebook)

    if (!q && !dynasty && !author && !tag) {
      const items = index.slice(offset, offset + limit)
      return {
        items,
        total: index.length,
        offset,
        limit,
        hasMore: offset + items.length < index.length,
      }
    }

    const items = []
    let total = 0

    for (const poem of index) {
      if (!matches(poem, { q, dynasty, author, tag })) continue
      if (total >= offset && items.length < limit) {
        items.push(poem)
      }
      total++
    }

    return {
      items,
      total,
      offset,
      limit,
      hasMore: offset + items.length < total,
    }
  }

  function buildSearchHit(poem, shard, qLower) {
    const matchFields = []

    if (poem.title.toLowerCase().includes(qLower)) matchFields.push('title')
    if (poem.author.toLowerCase().includes(qLower)) matchFields.push('author')
    if ((poem.tags || []).some(tag => tag.toLowerCase().includes(qLower))) matchFields.push('tag')

    const matchedLines = (poem.content || [])
      .filter(line => line.toLowerCase().includes(qLower))
      .slice(0, 3)

    if (matchedLines.length > 0) matchFields.push('content')
    if (matchFields.length === 0) return null

    return {
      id: poem.id,
      title: poem.title,
      author: poem.author,
      dynasty: poem.dynasty,
      tags: poem.tags || [],
      preview: buildPreview(poem.content),
      source: poem.source || '',
      shard,
      hasAnnotation: hasAnnotation(poem),
      matchedLines,
      matchFields,
    }
  }

  async function searchPoemsFullText(opts = {}) {
    const sqlite = getSqliteStore()
    if (sqlite && typeof sqlite.searchPoemsFullText === 'function') {
      const fromSqlite = sqlite.searchPoemsFullText(opts || {})
      if (fromSqlite) return fromSqlite
    }

    const q = typeof opts.q === 'string' ? opts.q.trim() : ''
    const offset = Math.max(0, Number.isFinite(opts.offset) ? opts.offset : Number.parseInt(String(opts.offset || 0), 10) || 0)
    const reqLimit = Number.isFinite(opts.limit) ? opts.limit : Number.parseInt(String(opts.limit || DEFAULT_FULLTEXT_LIMIT), 10) || DEFAULT_FULLTEXT_LIMIT
    const limit = Math.max(1, Math.min(reqLimit, 200))
    const notebook = normalizeNotebook(opts.notebook)
    const withTotal = opts.withTotal === true

    if (!q) {
      return { items: [], total: withTotal ? 0 : null, offset, limit, hasMore: false, nextOffset: offset }
    }

    const qLower = q.toLowerCase()
    const manifest = await loadManifest()
    const items = []
    let seenMatches = 0
    let hasMore = false

    if (withTotal) {
      for (const shardMeta of manifest.shards || []) {
        const poems = await loadShard(shardMeta.index, { cache: false })

        for (const poem of poems) {
          if (!inNotebook(poem, notebook)) continue
          const hit = buildSearchHit(poem, shardMeta.index, qLower)
          if (!hit) continue

          if (seenMatches >= offset && items.length < limit) {
            items.push(hit)
          }
          seenMatches++
        }
      }

      return {
        items,
        total: seenMatches,
        offset,
        limit,
        hasMore: offset + items.length < seenMatches,
        nextOffset: offset + items.length,
      }
    }

    outer: for (const shardMeta of manifest.shards || []) {
      const poems = await loadShard(shardMeta.index, { cache: false })

      for (const poem of poems) {
        if (!inNotebook(poem, notebook)) continue
        const hit = buildSearchHit(poem, shardMeta.index, qLower)
        if (!hit) continue

        if (seenMatches < offset) {
          seenMatches++
          continue
        }

        if (items.length < limit) {
          items.push(hit)
          seenMatches++
          continue
        }

        hasMore = true
        break outer
      }
    }

    return {
      items,
      total: null,
      offset,
      limit,
      hasMore,
      nextOffset: offset + items.length,
    }
  }

  async function listPoemNotebooks() {
    const sqlite = getSqliteStore()
    if (sqlite) {
      return sqlite.listPoemNotebooks()
    }

    const all = await loadIndex()
    await ensureNotebookIndexCache()

    return NOTEBOOK_DEFINITIONS.map(notebook => ({
      id: notebook.id,
      name: notebook.name,
      description: notebook.description,
      count: notebook.id === 'all'
        ? all.length
        : (notebookIndexCache && notebookIndexCache.get(notebook.id)
          ? notebookIndexCache.get(notebook.id).length
          : 0),
    }))
  }

  async function getPoemIndexById(id) {
    const sqlite = getSqliteStore()
    if (sqlite) {
      return sqlite.getPoemIndexById(id)
    }

    await loadIndex()
    return idToIndexCache.get(id) || null
  }

  async function getPoemIndexByIds(ids) {
    const sqlite = getSqliteStore()
    if (sqlite) {
      return sqlite.getPoemIndexByIds(ids)
    }

    await loadIndex()
    const out = []
    for (const id of ids || []) {
      const found = idToIndexCache.get(id)
      if (found) out.push(found)
    }
    return out
  }

  async function getPoemById(id, shardHint) {
    const sqlite = getSqliteStore()
    if (sqlite && typeof sqlite.getPoemById === 'function') {
      const row = sqlite.getPoemById(id)
      if (row) return row
    }

    if (Number.isInteger(shardHint) && shardHint >= 0) {
      const poemsByHint = await loadShard(shardHint)
      const foundByHint = poemsByHint.find(poem => poem.id === id)
      if (foundByHint) return foundByHint
    }

    const idx = await getPoemIndexById(id)
    if (!idx) return null
    const poems = await loadShard(idx.shard)
    return poems.find(poem => poem.id === id) || null
  }

  async function getRandomPoemIndex(notebook = 'all') {
    const sqlite = getSqliteStore()
    if (sqlite) {
      const picked = sqlite.getRandomPoemIndex(notebook)
      if (picked) return picked
    }

    if (normalizeNotebook(notebook) === 'all') {
      const manifest = await loadManifest()
      const total = Number.isFinite(manifest.total) ? manifest.total : 0
      if (total > 0) {
        const picked = Math.floor(Math.random() * total)
        const fromShard = await getPoemIndexByGlobalOffset(picked)
        if (fromShard) return fromShard
      }
    }

    const source = await getNotebookIndex(notebook)
    if (source.length === 0) {
      const index = await loadIndex()
      return index[Math.floor(Math.random() * index.length)]
    }
    return source[Math.floor(Math.random() * source.length)]
  }

  async function getDailyPoemIndex(notebook = 'all') {
    const sqlite = getSqliteStore()
    if (sqlite) {
      const picked = sqlite.getDailyPoemIndex(notebook)
      if (picked) return picked
    }

    if (normalizeNotebook(notebook) === 'all') {
      const manifest = await loadManifest()
      const total = Number.isFinite(manifest.total) ? manifest.total : 0
      if (total > 0) {
        const today = new Date()
        const dayOfYear = Math.floor(
          (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000
        )
        const fromShard = await getPoemIndexByGlobalOffset(dayOfYear % total)
        if (fromShard) return fromShard
      }
    }

    const source = await getNotebookIndex(notebook)
    const index = source.length > 0 ? source : await loadIndex()
    const today = new Date()
    const dayOfYear = Math.floor(
      (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000
    )
    return index[dayOfYear % index.length]
  }

  return {
    queryPoemIndex,
    searchPoemsFullText,
    listPoemNotebooks,
    getPoemById,
    getPoemIndexById,
    getPoemIndexByIds,
    getRandomPoemIndex,
    getDailyPoemIndex,
    loadManifest,
  }
}

module.exports = {
  createPoemsService,
}
