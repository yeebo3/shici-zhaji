const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_RECITE_SCOPE = 'annotated'
const GROUP_SCOPE_PREFIX = 'group:'
const REVIEW_GRADES = new Set(['again', 'hard', 'good', 'easy'])
const REVIEW_INTERVAL_DAYS = {
  hard: [1, 1, 2, 3, 5, 7],
  good: [1, 1, 3, 7, 14, 30],
  easy: [3, 3, 7, 14, 30, 60],
}

function nowIso() {
  return new Date().toISOString()
}

function normalizePoemId(input) {
  if (typeof input !== 'string') return ''
  return input.trim()
}

function normalizeGroupId(input) {
  if (typeof input !== 'string') return ''
  return input.trim()
}

function normalizeGroupName(input) {
  if (typeof input !== 'string') return '未命名分组'
  const trimmed = input.trim()
  return trimmed || '未命名分组'
}

function normalizeShard(input) {
  if (input === null || input === undefined) return undefined
  const num = Number.parseInt(String(input), 10)
  if (!Number.isInteger(num) || num < 0) return undefined
  return num
}

function normalizeViewedAt(input) {
  if (typeof input !== 'string') return nowIso()
  const parsed = new Date(input)
  if (Number.isNaN(parsed.getTime())) return nowIso()
  return parsed.toISOString()
}

function normalizeReviewCount(input) {
  const num = Number.parseInt(String(input), 10)
  if (!Number.isInteger(num) || num < 0) return 0
  return num
}

function normalizeMasteryLevel(input, memorized = false) {
  const num = Number.parseInt(String(input), 10)
  if (!Number.isInteger(num)) return memorized ? 4 : 0
  return Math.max(0, Math.min(5, num))
}

function normalizeOptionalIso(input) {
  if (typeof input !== 'string' || !input.trim()) return undefined
  const parsed = new Date(input)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

function normalizeReviewGrade(input) {
  return REVIEW_GRADES.has(input) ? input : 'good'
}

function buildReviewRecord(existing, gradeInput) {
  const grade = normalizeReviewGrade(gradeInput)
  const now = new Date()
  const currentLevel = normalizeMasteryLevel(existing.masteryLevel, existing.memorized)
  let masteryLevel = currentLevel
  let delayMs = 10 * 60 * 1000

  if (grade === 'again') {
    masteryLevel = Math.max(0, currentLevel - 1)
  } else {
    const gain = grade === 'easy' ? 2 : grade === 'good' ? 1 : 0
    masteryLevel = Math.max(1, Math.min(5, currentLevel + gain))
    const days = REVIEW_INTERVAL_DAYS[grade][masteryLevel] || 1
    delayMs = days * 24 * 60 * 60 * 1000
  }

  return {
    ...existing,
    memorized: masteryLevel >= 4,
    reviewCount: normalizeReviewCount(existing.reviewCount) + 1,
    masteryLevel,
    nextReviewAt: new Date(now.getTime() + delayMs).toISOString(),
    lastReviewedAt: now.toISOString(),
    lapseCount: normalizeReviewCount(existing.lapseCount) + (grade === 'again' ? 1 : 0),
  }
}

function normalizeReciteScope(input) {
  if (typeof input !== 'string') return DEFAULT_RECITE_SCOPE
  const value = input.trim()
  if (!value) return DEFAULT_RECITE_SCOPE
  if (!value.startsWith(GROUP_SCOPE_PREFIX)) return value
  const groupId = normalizeGroupId(value.slice(GROUP_SCOPE_PREFIX.length))
  if (!groupId) return DEFAULT_RECITE_SCOPE
  return `${GROUP_SCOPE_PREFIX}${groupId}`
}

function toBoolean(input) {
  return input === true || input === 1 || input === '1'
}

function makeGroupId() {
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeStudyRecord(input) {
  if (!input || typeof input !== 'object') return null
  const poemId = normalizePoemId(input.poemId)
  if (!poemId) return null
  const memorized = toBoolean(input.memorized)
  return {
    poemId,
    shard: normalizeShard(input.shard),
    viewedAt: normalizeViewedAt(input.viewedAt),
    memorized,
    reviewCount: normalizeReviewCount(input.reviewCount),
    favorite: toBoolean(input.favorite),
    masteryLevel: normalizeMasteryLevel(input.masteryLevel, memorized),
    nextReviewAt: normalizeOptionalIso(input.nextReviewAt),
    lastReviewedAt: normalizeOptionalIso(input.lastReviewedAt),
    lapseCount: normalizeReviewCount(input.lapseCount),
  }
}

function normalizeStudyRecordMap(input) {
  if (!input || typeof input !== 'object') return {}
  const next = {}
  for (const [k, v] of Object.entries(input)) {
    const record = normalizeStudyRecord(v)
    if (record) {
      next[record.poemId || k] = {
        ...record,
        poemId: record.poemId || normalizePoemId(k),
      }
    }
  }
  return next
}

function normalizeGroup(input) {
  if (!input || typeof input !== 'object') return null
  const id = normalizeGroupId(input.id)
  if (!id) return null
  const name = normalizeGroupName(input.name)
  const createdAt = normalizeViewedAt(input.createdAt)
  const updatedAt = normalizeViewedAt(input.updatedAt || createdAt)
  const poemIds = Array.isArray(input.poemIds)
    ? [...new Set(input.poemIds.map(normalizePoemId).filter(Boolean))]
    : []

  return {
    id,
    name,
    poemIds,
    createdAt,
    updatedAt,
  }
}

function normalizeGroups(input) {
  if (!Array.isArray(input)) return []
  const next = []
  for (const item of input) {
    const group = normalizeGroup(item)
    if (group) next.push(group)
  }
  return next
}

function toStats(records) {
  const all = Object.values(records)
  return {
    totalViewed: all.length,
    totalFavorites: all.filter(r => r.favorite).length,
    totalMemorized: all.filter(r => r.memorized).length,
    totalReviews: all.reduce((sum, r) => sum + r.reviewCount, 0),
  }
}

function createJsonStore(jsonPath) {
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true })

  const state = {
    studyRecords: {},
    groups: [],
    reciteNotebook: DEFAULT_RECITE_SCOPE,
  }

  if (fs.existsSync(jsonPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
      state.studyRecords = normalizeStudyRecordMap(raw.studyRecords)
      state.groups = normalizeGroups(raw.groups)
      state.reciteNotebook = normalizeReciteScope(raw.reciteNotebook)
    } catch {
      // ignore broken fallback file
    }
  }

  function persist() {
    fs.writeFileSync(jsonPath, JSON.stringify(state), 'utf8')
  }

  function getStudyRecords() {
    return { ...state.studyRecords }
  }

  function getStudyRecord(poemId) {
    const key = normalizePoemId(poemId)
    if (!key) return null
    return state.studyRecords[key] || null
  }

  function saveStudyRecord(record) {
    const normalized = normalizeStudyRecord(record)
    if (!normalized) return
    state.studyRecords[normalized.poemId] = normalized
    persist()
  }

  function markViewed(poemId, shard) {
    const key = normalizePoemId(poemId)
    if (!key) return
    const existing = state.studyRecords[key]
    const next = {
      ...existing,
      poemId: key,
      shard: normalizeShard(shard) ?? existing?.shard,
      viewedAt: nowIso(),
      memorized: existing?.memorized || false,
      reviewCount: existing?.reviewCount || 0,
      favorite: existing?.favorite || false,
    }
    state.studyRecords[key] = next
    persist()
  }

  function toggleFavorite(poemId) {
    const key = normalizePoemId(poemId)
    if (!key) return false
    const existing = state.studyRecords[key]
    const newFav = !(existing?.favorite || false)
    state.studyRecords[key] = {
      ...existing,
      poemId: key,
      shard: existing?.shard,
      viewedAt: existing?.viewedAt || nowIso(),
      memorized: existing?.memorized || false,
      reviewCount: existing?.reviewCount || 0,
      favorite: newFav,
    }
    persist()
    return newFav
  }

  function markMemorized(poemId, memorized) {
    return recordReview(poemId, memorized ? 'good' : 'again')
  }

  function recordReview(poemId, grade) {
    const key = normalizePoemId(poemId)
    if (!key) return null
    const existing = state.studyRecords[key] || {
      poemId: key,
      viewedAt: nowIso(),
      memorized: false,
      reviewCount: 0,
      favorite: false,
      masteryLevel: 0,
      lapseCount: 0,
    }
    state.studyRecords[key] = buildReviewRecord(existing, grade)
    persist()
    return state.studyRecords[key]
  }

  function getFavorites() {
    return Object.values(state.studyRecords)
      .filter(r => r.favorite)
      .map(r => r.poemId)
  }

  function getMemorized() {
    return Object.values(state.studyRecords)
      .filter(r => r.memorized)
      .map(r => r.poemId)
  }

  function getRecentlyViewed(limit = 20) {
    const cap = Math.max(1, Number.parseInt(String(limit), 10) || 20)
    return Object.values(state.studyRecords)
      .sort((a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime())
      .slice(0, cap)
  }

  function getStats() {
    return toStats(state.studyRecords)
  }

  function getReciteNotebook() {
    return normalizeReciteScope(state.reciteNotebook)
  }

  function setReciteNotebook(notebook) {
    state.reciteNotebook = normalizeReciteScope(notebook)
    persist()
    return state.reciteNotebook
  }

  function getPoemGroups() {
    return normalizeGroups(state.groups)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }

  function saveGroups(groups) {
    state.groups = normalizeGroups(groups)
    persist()
  }

  function createPoemGroup(name) {
    const now = nowIso()
    const next = {
      id: makeGroupId(),
      name: normalizeGroupName(name),
      poemIds: [],
      createdAt: now,
      updatedAt: now,
    }
    state.groups = [next, ...getPoemGroups()]
    persist()
    return next
  }

  function renamePoemGroup(groupId, name) {
    const gid = normalizeGroupId(groupId)
    const nextName = normalizeGroupName(name)
    const found = state.groups.find(g => g.id === gid)
    if (!found || !nextName.trim()) return false
    found.name = nextName
    found.updatedAt = nowIso()
    persist()
    return true
  }

  function deletePoemGroup(groupId) {
    const gid = normalizeGroupId(groupId)
    state.groups = state.groups.filter(g => g.id !== gid)
    persist()
  }

  function addPoemToGroup(groupId, poemId) {
    const gid = normalizeGroupId(groupId)
    const pid = normalizePoemId(poemId)
    if (!gid || !pid) return false
    const found = state.groups.find(g => g.id === gid)
    if (!found) return false
    if (!found.poemIds.includes(pid)) {
      found.poemIds.push(pid)
      found.updatedAt = nowIso()
      persist()
    }
    return true
  }

  function removePoemFromGroup(groupId, poemId) {
    const gid = normalizeGroupId(groupId)
    const pid = normalizePoemId(poemId)
    if (!gid || !pid) return false
    const found = state.groups.find(g => g.id === gid)
    if (!found) return false
    const before = found.poemIds.length
    found.poemIds = found.poemIds.filter(id => id !== pid)
    if (found.poemIds.length !== before) {
      found.updatedAt = nowIso()
      persist()
      return true
    }
    return false
  }

  function togglePoemInGroup(groupId, poemId) {
    const gid = normalizeGroupId(groupId)
    const pid = normalizePoemId(poemId)
    if (!gid || !pid) return false
    const found = state.groups.find(g => g.id === gid)
    if (!found) return false
    const exists = found.poemIds.includes(pid)
    found.poemIds = exists ? found.poemIds.filter(id => id !== pid) : [...found.poemIds, pid]
    found.updatedAt = nowIso()
    persist()
    return !exists
  }

  function getPoemGroupById(groupId) {
    const gid = normalizeGroupId(groupId)
    if (!gid) return null
    const found = state.groups.find(g => g.id === gid)
    return found ? normalizeGroup(found) : null
  }

  function getGroupsForPoem(poemId) {
    const pid = normalizePoemId(poemId)
    if (!pid) return []
    return getPoemGroups().filter(g => g.poemIds.includes(pid))
  }

  function bootstrap(payload) {
    const records = normalizeStudyRecordMap(payload && payload.studyRecords)
    const groups = normalizeGroups(payload && payload.groups)
    const reciteNotebook = normalizeReciteScope(payload && payload.reciteNotebook)

    if (
      Object.keys(state.studyRecords).length > 0
      || state.groups.length > 0
      || normalizeReciteScope(state.reciteNotebook) !== DEFAULT_RECITE_SCOPE
    ) {
      return { migrated: false, reason: 'existing-data' }
    }

    state.studyRecords = records
    state.groups = groups
    state.reciteNotebook = reciteNotebook
    persist()
    return {
      migrated: true,
      recordCount: Object.keys(records).length,
      groupCount: groups.length,
    }
  }

  return {
    getStudyRecords,
    getStudyRecord,
    saveStudyRecord,
    markViewed,
    toggleFavorite,
    recordReview,
    markMemorized,
    getFavorites,
    getMemorized,
    getRecentlyViewed,
    getStats,
    getReciteNotebook,
    setReciteNotebook,
    getPoemGroups,
    createPoemGroup,
    renamePoemGroup,
    deletePoemGroup,
    addPoemToGroup,
    removePoemFromGroup,
    togglePoemInGroup,
    getPoemGroupById,
    getGroupsForPoem,
    bootstrap,
    driver: 'json',
  }
}

function createSqliteStore(dbPath) {
  let DatabaseSync
  try {
    ;({ DatabaseSync } = require('node:sqlite'))
  } catch {
    process.stderr.write('[study] node:sqlite unavailable, fallback to JSON store.\n')
    return null
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  let db
  try {
    db = new DatabaseSync(dbPath)
  } catch (error) {
    process.stderr.write(`[study] open sqlite failed, fallback to JSON store: ${error instanceof Error ? error.message : String(error)}\n`)
    return null
  }

  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS study_records (
      poem_id TEXT PRIMARY KEY,
      shard INTEGER,
      viewed_at TEXT NOT NULL,
      memorized INTEGER NOT NULL DEFAULT 0,
      review_count INTEGER NOT NULL DEFAULT 0,
      favorite INTEGER NOT NULL DEFAULT 0,
      mastery_level INTEGER NOT NULL DEFAULT 0,
      next_review_at TEXT,
      last_reviewed_at TEXT,
      lapse_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS group_poems (
      group_id TEXT NOT NULL,
      poem_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (group_id, poem_id),
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_study_records_viewed_at ON study_records(viewed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_study_records_favorite ON study_records(favorite);
    CREATE INDEX IF NOT EXISTS idx_study_records_memorized ON study_records(memorized);
    CREATE INDEX IF NOT EXISTS idx_group_poems_poem_id ON group_poems(poem_id);
  `)

  const studyColumns = new Set(
    db.prepare('PRAGMA table_info(study_records)').all().map(column => column.name)
  )
  if (!studyColumns.has('mastery_level')) db.exec('ALTER TABLE study_records ADD COLUMN mastery_level INTEGER NOT NULL DEFAULT 0')
  if (!studyColumns.has('next_review_at')) db.exec('ALTER TABLE study_records ADD COLUMN next_review_at TEXT')
  if (!studyColumns.has('last_reviewed_at')) db.exec('ALTER TABLE study_records ADD COLUMN last_reviewed_at TEXT')
  if (!studyColumns.has('lapse_count')) db.exec('ALTER TABLE study_records ADD COLUMN lapse_count INTEGER NOT NULL DEFAULT 0')
  db.exec(`
    UPDATE study_records
    SET mastery_level = 4
    WHERE memorized = 1 AND mastery_level = 0 AND last_reviewed_at IS NULL
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_study_records_next_review_at ON study_records(next_review_at)')

  const upsertStudyStmt = db.prepare(`
    INSERT INTO study_records (
      poem_id, shard, viewed_at, memorized, review_count, favorite,
      mastery_level, next_review_at, last_reviewed_at, lapse_count, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(poem_id) DO UPDATE SET
      shard = excluded.shard,
      viewed_at = excluded.viewed_at,
      memorized = excluded.memorized,
      review_count = excluded.review_count,
      favorite = excluded.favorite,
      mastery_level = excluded.mastery_level,
      next_review_at = excluded.next_review_at,
      last_reviewed_at = excluded.last_reviewed_at,
      lapse_count = excluded.lapse_count,
      updated_at = excluded.updated_at
  `)

  function toStudyRecord(row) {
    return {
      poemId: row.poemId,
      shard: Number.isInteger(row.shard) ? row.shard : undefined,
      viewedAt: row.viewedAt,
      memorized: Number(row.memorized) === 1,
      reviewCount: Number(row.reviewCount || 0),
      favorite: Number(row.favorite) === 1,
      masteryLevel: normalizeMasteryLevel(row.masteryLevel, Number(row.memorized) === 1),
      nextReviewAt: row.nextReviewAt || undefined,
      lastReviewedAt: row.lastReviewedAt || undefined,
      lapseCount: Number(row.lapseCount || 0),
    }
  }

  function getStudyRecords() {
    const rows = db.prepare(`
      SELECT
        poem_id AS poemId,
        shard,
        viewed_at AS viewedAt,
        memorized,
        review_count AS reviewCount,
        favorite,
        mastery_level AS masteryLevel,
        next_review_at AS nextReviewAt,
        last_reviewed_at AS lastReviewedAt,
        lapse_count AS lapseCount
      FROM study_records
    `).all()
    const out = {}
    for (const row of rows) {
      const record = toStudyRecord(row)
      out[record.poemId] = record
    }
    return out
  }

  function getStudyRecord(poemId) {
    const key = normalizePoemId(poemId)
    if (!key) return null
    const row = db.prepare(`
      SELECT
        poem_id AS poemId,
        shard,
        viewed_at AS viewedAt,
        memorized,
        review_count AS reviewCount,
        favorite,
        mastery_level AS masteryLevel,
        next_review_at AS nextReviewAt,
        last_reviewed_at AS lastReviewedAt,
        lapse_count AS lapseCount
      FROM study_records
      WHERE poem_id = ?
    `).get(key)
    return row ? toStudyRecord(row) : null
  }

  function saveStudyRecord(record) {
    const normalized = normalizeStudyRecord(record)
    if (!normalized) return
    const now = nowIso()
    upsertStudyStmt.run(
      normalized.poemId,
      normalized.shard ?? null,
      normalized.viewedAt,
      normalized.memorized ? 1 : 0,
      normalized.reviewCount,
      normalized.favorite ? 1 : 0,
      normalized.masteryLevel || 0,
      normalized.nextReviewAt || null,
      normalized.lastReviewedAt || null,
      normalized.lapseCount || 0,
      now
    )
  }

  function markViewed(poemId, shard) {
    const key = normalizePoemId(poemId)
    if (!key) return
    const existing = getStudyRecord(key)
    const next = {
      ...existing,
      poemId: key,
      shard: normalizeShard(shard) ?? existing?.shard,
      viewedAt: nowIso(),
      memorized: existing?.memorized || false,
      reviewCount: existing?.reviewCount || 0,
      favorite: existing?.favorite || false,
    }
    saveStudyRecord(next)
  }

  function toggleFavorite(poemId) {
    const key = normalizePoemId(poemId)
    if (!key) return false
    const existing = getStudyRecord(key)
    const newFav = !(existing?.favorite || false)
    saveStudyRecord({
      ...existing,
      poemId: key,
      shard: existing?.shard,
      viewedAt: existing?.viewedAt || nowIso(),
      memorized: existing?.memorized || false,
      reviewCount: existing?.reviewCount || 0,
      favorite: newFav,
    })
    return newFav
  }

  function markMemorized(poemId, memorized) {
    return recordReview(poemId, memorized ? 'good' : 'again')
  }

  function recordReview(poemId, grade) {
    const key = normalizePoemId(poemId)
    if (!key) return null
    const existing = getStudyRecord(key) || {
      poemId: key,
      viewedAt: nowIso(),
      memorized: false,
      reviewCount: 0,
      favorite: false,
      masteryLevel: 0,
      lapseCount: 0,
    }
    const next = buildReviewRecord(existing, grade)
    saveStudyRecord(next)
    return next
  }

  function getFavorites() {
    const rows = db.prepare(`
      SELECT poem_id AS poemId
      FROM study_records
      WHERE favorite = 1
      ORDER BY viewed_at DESC
    `).all()
    return rows.map(r => r.poemId)
  }

  function getMemorized() {
    const rows = db.prepare(`
      SELECT poem_id AS poemId
      FROM study_records
      WHERE memorized = 1
      ORDER BY viewed_at DESC
    `).all()
    return rows.map(r => r.poemId)
  }

  function getRecentlyViewed(limit = 20) {
    const cap = Math.max(1, Number.parseInt(String(limit), 10) || 20)
    const rows = db.prepare(`
      SELECT
        poem_id AS poemId,
        shard,
        viewed_at AS viewedAt,
        memorized,
        review_count AS reviewCount,
        favorite,
        mastery_level AS masteryLevel,
        next_review_at AS nextReviewAt,
        last_reviewed_at AS lastReviewedAt,
        lapse_count AS lapseCount
      FROM study_records
      ORDER BY viewed_at DESC
      LIMIT ?
    `).all(cap)
    return rows.map(toStudyRecord)
  }

  function getStats() {
    const row = db.prepare(`
      SELECT
        COUNT(*) AS totalViewed,
        SUM(CASE WHEN favorite = 1 THEN 1 ELSE 0 END) AS totalFavorites,
        SUM(CASE WHEN memorized = 1 THEN 1 ELSE 0 END) AS totalMemorized,
        SUM(review_count) AS totalReviews
      FROM study_records
    `).get()
    return {
      totalViewed: Number(row?.totalViewed || 0),
      totalFavorites: Number(row?.totalFavorites || 0),
      totalMemorized: Number(row?.totalMemorized || 0),
      totalReviews: Number(row?.totalReviews || 0),
    }
  }

  function getReciteNotebook() {
    const row = db.prepare(`SELECT value FROM kv WHERE key = 'recite_notebook'`).get()
    return normalizeReciteScope(row && row.value)
  }

  function setReciteNotebook(notebook) {
    const normalized = normalizeReciteScope(notebook)
    db.prepare(`
      INSERT INTO kv (key, value)
      VALUES ('recite_notebook', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(normalized)
    return normalized
  }

  function buildGroupsFromRows(rows) {
    const byId = new Map()
    for (const row of rows) {
      let current = byId.get(row.id)
      if (!current) {
        current = {
          id: row.id,
          name: row.name,
          poemIds: [],
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }
        byId.set(row.id, current)
      }
      if (typeof row.poemId === 'string' && row.poemId) {
        current.poemIds.push(row.poemId)
      }
    }
    return Array.from(byId.values())
  }

  function getPoemGroups() {
    const rows = db.prepare(`
      SELECT
        g.id,
        g.name,
        g.created_at AS createdAt,
        g.updated_at AS updatedAt,
        gp.poem_id AS poemId
      FROM groups g
      LEFT JOIN group_poems gp ON gp.group_id = g.id
      ORDER BY g.updated_at DESC, g.created_at DESC, gp.created_at ASC
    `).all()
    return buildGroupsFromRows(rows)
  }

  function createPoemGroup(name) {
    const now = nowIso()
    const group = {
      id: makeGroupId(),
      name: normalizeGroupName(name),
      poemIds: [],
      createdAt: now,
      updatedAt: now,
    }
    db.prepare(`
      INSERT INTO groups (id, name, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(group.id, group.name, group.createdAt, group.updatedAt)
    return group
  }

  function renamePoemGroup(groupId, name) {
    const gid = normalizeGroupId(groupId)
    const nextName = typeof name === 'string' ? name.trim() : ''
    if (!gid || !nextName) return false
    const result = db.prepare(`
      UPDATE groups
      SET name = ?, updated_at = ?
      WHERE id = ?
    `).run(nextName, nowIso(), gid)
    return Number(result?.changes || 0) > 0
  }

  function deletePoemGroup(groupId) {
    const gid = normalizeGroupId(groupId)
    if (!gid) return
    db.prepare(`DELETE FROM groups WHERE id = ?`).run(gid)
  }

  function touchGroup(groupId) {
    const gid = normalizeGroupId(groupId)
    if (!gid) return
    db.prepare(`UPDATE groups SET updated_at = ? WHERE id = ?`).run(nowIso(), gid)
  }

  function addPoemToGroup(groupId, poemId) {
    const gid = normalizeGroupId(groupId)
    const pid = normalizePoemId(poemId)
    if (!gid || !pid) return false
    const existsGroup = db.prepare(`SELECT 1 FROM groups WHERE id = ?`).get(gid)
    if (!existsGroup) return false
    db.prepare(`
      INSERT OR IGNORE INTO group_poems (group_id, poem_id, created_at)
      VALUES (?, ?, ?)
    `).run(gid, pid, nowIso())
    touchGroup(gid)
    return true
  }

  function removePoemFromGroup(groupId, poemId) {
    const gid = normalizeGroupId(groupId)
    const pid = normalizePoemId(poemId)
    if (!gid || !pid) return false
    const result = db.prepare(`
      DELETE FROM group_poems
      WHERE group_id = ? AND poem_id = ?
    `).run(gid, pid)
    const changed = Number(result?.changes || 0) > 0
    if (changed) touchGroup(gid)
    return changed
  }

  function togglePoemInGroup(groupId, poemId) {
    const gid = normalizeGroupId(groupId)
    const pid = normalizePoemId(poemId)
    if (!gid || !pid) return false
    const existsGroup = db.prepare(`SELECT 1 FROM groups WHERE id = ?`).get(gid)
    if (!existsGroup) return false
    const exists = db.prepare(`
      SELECT 1
      FROM group_poems
      WHERE group_id = ? AND poem_id = ?
    `).get(gid, pid)
    if (exists) {
      db.prepare(`DELETE FROM group_poems WHERE group_id = ? AND poem_id = ?`).run(gid, pid)
      touchGroup(gid)
      return false
    }
    db.prepare(`
      INSERT INTO group_poems (group_id, poem_id, created_at)
      VALUES (?, ?, ?)
    `).run(gid, pid, nowIso())
    touchGroup(gid)
    return true
  }

  function getPoemGroupById(groupId) {
    const gid = normalizeGroupId(groupId)
    if (!gid) return null
    const rows = db.prepare(`
      SELECT
        g.id,
        g.name,
        g.created_at AS createdAt,
        g.updated_at AS updatedAt,
        gp.poem_id AS poemId
      FROM groups g
      LEFT JOIN group_poems gp ON gp.group_id = g.id
      WHERE g.id = ?
      ORDER BY gp.created_at ASC
    `).all(gid)
    if (rows.length === 0) return null
    return buildGroupsFromRows(rows)[0] || null
  }

  function getGroupsForPoem(poemId) {
    const pid = normalizePoemId(poemId)
    if (!pid) return []
    const rows = db.prepare(`
      SELECT
        g.id,
        g.name,
        g.created_at AS createdAt,
        g.updated_at AS updatedAt,
        gp.poem_id AS poemId
      FROM groups g
      INNER JOIN group_poems gp ON gp.group_id = g.id
      WHERE g.id IN (
        SELECT group_id
        FROM group_poems
        WHERE poem_id = ?
      )
      ORDER BY g.updated_at DESC, g.created_at DESC, gp.created_at ASC
    `).all(pid)
    return buildGroupsFromRows(rows)
  }

  function bootstrap(payload) {
    const records = normalizeStudyRecordMap(payload && payload.studyRecords)
    const groups = normalizeGroups(payload && payload.groups)
    const reciteNotebook = normalizeReciteScope(payload && payload.reciteNotebook)
    const existingRecords = Number(db.prepare(`SELECT COUNT(*) AS total FROM study_records`).get().total || 0)
    const existingGroups = Number(db.prepare(`SELECT COUNT(*) AS total FROM groups`).get().total || 0)
    const existingNotebook = db.prepare(`SELECT value FROM kv WHERE key = 'recite_notebook'`).get()

    if (existingRecords > 0 || existingGroups > 0 || existingNotebook) {
      return { migrated: false, reason: 'existing-data' }
    }

    try {
      db.exec('BEGIN')
      const insertRecord = db.prepare(`
        INSERT OR REPLACE INTO study_records
        (
          poem_id, shard, viewed_at, memorized, review_count, favorite,
          mastery_level, next_review_at, last_reviewed_at, lapse_count, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      for (const record of Object.values(records)) {
        insertRecord.run(
          record.poemId,
          record.shard ?? null,
          record.viewedAt,
          record.memorized ? 1 : 0,
          record.reviewCount,
          record.favorite ? 1 : 0,
          record.masteryLevel || 0,
          record.nextReviewAt || null,
          record.lastReviewedAt || null,
          record.lapseCount || 0,
          nowIso()
        )
      }

      const insertGroup = db.prepare(`
        INSERT OR IGNORE INTO groups (id, name, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `)
      const insertGroupPoem = db.prepare(`
        INSERT OR IGNORE INTO group_poems (group_id, poem_id, created_at)
        VALUES (?, ?, ?)
      `)

      for (const group of groups) {
        insertGroup.run(group.id, group.name, group.createdAt, group.updatedAt)
        for (const poemId of group.poemIds) {
          insertGroupPoem.run(group.id, poemId, group.updatedAt || group.createdAt || nowIso())
        }
      }

      db.prepare(`
        INSERT INTO kv (key, value)
        VALUES ('recite_notebook', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(reciteNotebook)

      db.exec('COMMIT')
    } catch (error) {
      try {
        db.exec('ROLLBACK')
      } catch {
        // ignore rollback error
      }
      process.stderr.write(`[study] bootstrap migration failed: ${error instanceof Error ? error.message : String(error)}\n`)
      return { migrated: false, reason: 'bootstrap-failed' }
    }

    return {
      migrated: true,
      recordCount: Object.keys(records).length,
      groupCount: groups.length,
    }
  }

  return {
    getStudyRecords,
    getStudyRecord,
    saveStudyRecord,
    markViewed,
    toggleFavorite,
    recordReview,
    markMemorized,
    getFavorites,
    getMemorized,
    getRecentlyViewed,
    getStats,
    getReciteNotebook,
    setReciteNotebook,
    getPoemGroups,
    createPoemGroup,
    renamePoemGroup,
    deletePoemGroup,
    addPoemToGroup,
    removePoemFromGroup,
    togglePoemInGroup,
    getPoemGroupById,
    getGroupsForPoem,
    bootstrap,
    driver: 'sqlite',
  }
}

function createStudyService({ userDataDir }) {
  const rootDir = typeof userDataDir === 'string' && userDataDir.trim()
    ? userDataDir
    : process.cwd()
  const sqlitePath = path.join(rootDir, 'study.db')
  const jsonPath = path.join(rootDir, 'study-fallback.json')

  const sqliteStore = createSqliteStore(sqlitePath)
  const store = sqliteStore || createJsonStore(jsonPath)
  process.stdout.write(`[study] storage driver: ${store.driver}\n`)
  return store
}

module.exports = {
  createStudyService,
}
