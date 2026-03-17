const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_RECITE_SCOPE = 'annotated'
const GROUP_SCOPE_PREFIX = 'group:'

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

function normalizeReciteScope(input) {
  if (typeof input !== 'string') return DEFAULT_RECITE_SCOPE
  const value = input.trim()
  if (value === 'annotated') return 'annotated'
  if (value === 'all' || value === 'plain') return 'annotated'
  if (!value.startsWith(GROUP_SCOPE_PREFIX)) return DEFAULT_RECITE_SCOPE
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
  return {
    poemId,
    shard: normalizeShard(input.shard),
    viewedAt: normalizeViewedAt(input.viewedAt),
    memorized: toBoolean(input.memorized),
    reviewCount: normalizeReviewCount(input.reviewCount),
    favorite: toBoolean(input.favorite),
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
      poemId: key,
      shard: normalizeShard(shard) ?? existing?.shard,
      viewedAt: nowIso(),
      memorized: existing?.memorized || false,
      reviewCount: (existing?.reviewCount || 0) + 1,
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
    const key = normalizePoemId(poemId)
    if (!key) return
    const existing = state.studyRecords[key]
    state.studyRecords[key] = {
      poemId: key,
      shard: existing?.shard,
      viewedAt: existing?.viewedAt || nowIso(),
      memorized: Boolean(memorized),
      reviewCount: existing?.reviewCount || 0,
      favorite: existing?.favorite || false,
    }
    persist()
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

  const upsertStudyStmt = db.prepare(`
    INSERT INTO study_records (poem_id, shard, viewed_at, memorized, review_count, favorite, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(poem_id) DO UPDATE SET
      shard = excluded.shard,
      viewed_at = excluded.viewed_at,
      memorized = excluded.memorized,
      review_count = excluded.review_count,
      favorite = excluded.favorite,
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
        favorite
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
        favorite
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
      now
    )
  }

  function markViewed(poemId, shard) {
    const key = normalizePoemId(poemId)
    if (!key) return
    const existing = getStudyRecord(key)
    const next = {
      poemId: key,
      shard: normalizeShard(shard) ?? existing?.shard,
      viewedAt: nowIso(),
      memorized: existing?.memorized || false,
      reviewCount: (existing?.reviewCount || 0) + 1,
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
    const key = normalizePoemId(poemId)
    if (!key) return
    const existing = getStudyRecord(key)
    saveStudyRecord({
      poemId: key,
      shard: existing?.shard,
      viewedAt: existing?.viewedAt || nowIso(),
      memorized: Boolean(memorized),
      reviewCount: existing?.reviewCount || 0,
      favorite: existing?.favorite || false,
    })
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
        favorite
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
        (poem_id, shard, viewed_at, memorized, review_count, favorite, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      for (const record of Object.values(records)) {
        insertRecord.run(
          record.poemId,
          record.shard ?? null,
          record.viewedAt,
          record.memorized ? 1 : 0,
          record.reviewCount,
          record.favorite ? 1 : 0,
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
