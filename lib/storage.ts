import { PoemGroup, ReciteScopeId, StudyRecord } from './types'

const STUDY_KEY = 'shici-study-records'
const THEME_KEY = 'shici-theme'
const FONT_KEY = 'shici-font-size'
const GROUPS_KEY = 'shici-poem-groups'
const RECITE_NOTEBOOK_KEY = 'shici-recite-notebook'
const DESKTOP_MIGRATION_FLAG_KEY = 'shici-desktop-study-migrated-v1'

const DEFAULT_RECITE_SCOPE: ReciteScopeId = 'annotated'
const GROUP_SCOPE_PREFIX = 'group:'

type StudyStats = {
  totalViewed: number
  totalFavorites: number
  totalMemorized: number
  totalReviews: number
}

type DesktopStudyBridge = {
  bootstrap: (payload: {
    studyRecords: Record<string, StudyRecord>
    groups: PoemGroup[]
    reciteNotebook: ReciteScopeId
  }) => Promise<unknown>
  getStudyRecords: () => Promise<Record<string, StudyRecord>>
  getStudyRecord: (poemId: string) => Promise<StudyRecord | null>
  saveStudyRecord: (record: StudyRecord) => Promise<unknown>
  markViewed: (poemId: string, shard?: number) => Promise<unknown>
  toggleFavorite: (poemId: string) => Promise<boolean>
  markMemorized: (poemId: string, memorized: boolean) => Promise<unknown>
  getFavorites: () => Promise<string[]>
  getMemorized: () => Promise<string[]>
  getRecentlyViewed: (limit?: number) => Promise<StudyRecord[]>
  getStats: () => Promise<StudyStats>
  getReciteNotebook: () => Promise<ReciteScopeId | string>
  setReciteNotebook: (notebook: ReciteScopeId) => Promise<ReciteScopeId | string>
  getPoemGroups: () => Promise<PoemGroup[]>
  createPoemGroup: (name: string) => Promise<PoemGroup>
  renamePoemGroup: (groupId: string, name: string) => Promise<boolean>
  deletePoemGroup: (groupId: string) => Promise<unknown>
  addPoemToGroup: (groupId: string, poemId: string) => Promise<boolean>
  removePoemFromGroup: (groupId: string, poemId: string) => Promise<boolean>
  togglePoemInGroup: (groupId: string, poemId: string) => Promise<boolean>
  getPoemGroupById: (groupId: string) => Promise<PoemGroup | null>
  getGroupsForPoem: (poemId: string) => Promise<PoemGroup[]>
}

function safeReadJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  const raw = localStorage.getItem(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function safeWriteJSON(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(value))
}

function normalizeReciteScope(input: unknown): ReciteScopeId {
  if (typeof input !== 'string') return DEFAULT_RECITE_SCOPE
  const value = input.trim()
  if (!value) return DEFAULT_RECITE_SCOPE
  if (value.startsWith(GROUP_SCOPE_PREFIX)) {
    const groupId = value.slice(GROUP_SCOPE_PREFIX.length).trim()
    if (!groupId) return DEFAULT_RECITE_SCOPE
    return `${GROUP_SCOPE_PREFIX}${groupId}`
  }
  return value as ReciteScopeId
}

function normalizeStudyRecord(input: unknown): StudyRecord | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Partial<StudyRecord>
  if (typeof raw.poemId !== 'string' || !raw.poemId.trim()) return null
  const reviewCount = Number.isInteger(raw.reviewCount) && (raw.reviewCount || 0) >= 0
    ? Number(raw.reviewCount)
    : 0
  const shard = Number.isInteger(raw.shard) && (raw.shard || 0) >= 0
    ? Number(raw.shard)
    : undefined
  const viewedAt = typeof raw.viewedAt === 'string' && raw.viewedAt
    ? raw.viewedAt
    : new Date().toISOString()
  return {
    poemId: raw.poemId.trim(),
    shard,
    viewedAt,
    memorized: Boolean(raw.memorized),
    reviewCount,
    favorite: Boolean(raw.favorite),
  }
}

function getStudyRecordsLocal(): Record<string, StudyRecord> {
  const raw = safeReadJSON<Record<string, unknown>>(STUDY_KEY, {})
  const out: Record<string, StudyRecord> = {}
  for (const [key, value] of Object.entries(raw)) {
    const normalized = normalizeStudyRecord(value)
    if (!normalized) continue
    const poemId = normalized.poemId || String(key || '').trim()
    if (!poemId) continue
    out[poemId] = { ...normalized, poemId }
  }
  return out
}

function saveStudyRecordsLocal(records: Record<string, StudyRecord>): void {
  safeWriteJSON(STUDY_KEY, records)
}

function getStudyRecordLocal(poemId: string): StudyRecord | null {
  const normalizedId = poemId.trim()
  if (!normalizedId) return null
  const records = getStudyRecordsLocal()
  return records[normalizedId] || null
}

function saveStudyRecordLocal(record: StudyRecord): void {
  const normalized = normalizeStudyRecord(record)
  if (!normalized) return
  const records = getStudyRecordsLocal()
  records[normalized.poemId] = normalized
  saveStudyRecordsLocal(records)
}

function markViewedLocal(poemId: string, shard?: number): void {
  const normalizedId = poemId.trim()
  if (!normalizedId) return
  const existing = getStudyRecordLocal(normalizedId)
  saveStudyRecordLocal({
    poemId: normalizedId,
    shard: typeof shard === 'number' && Number.isInteger(shard) && shard >= 0 ? shard : existing?.shard,
    viewedAt: new Date().toISOString(),
    memorized: existing?.memorized || false,
    reviewCount: (existing?.reviewCount || 0) + 1,
    favorite: existing?.favorite || false,
  })
}

function toggleFavoriteLocal(poemId: string): boolean {
  const normalizedId = poemId.trim()
  if (!normalizedId) return false
  const existing = getStudyRecordLocal(normalizedId)
  const newFav = !(existing?.favorite || false)
  saveStudyRecordLocal({
    poemId: normalizedId,
    shard: existing?.shard,
    viewedAt: existing?.viewedAt || new Date().toISOString(),
    memorized: existing?.memorized || false,
    reviewCount: existing?.reviewCount || 0,
    favorite: newFav,
  })
  return newFav
}

function markMemorizedLocal(poemId: string, memorized: boolean): void {
  const normalizedId = poemId.trim()
  if (!normalizedId) return
  const existing = getStudyRecordLocal(normalizedId)
  saveStudyRecordLocal({
    poemId: normalizedId,
    shard: existing?.shard,
    viewedAt: existing?.viewedAt || new Date().toISOString(),
    memorized,
    reviewCount: existing?.reviewCount || 0,
    favorite: existing?.favorite || false,
  })
}

function getFavoritesLocal(): string[] {
  const records = getStudyRecordsLocal()
  return Object.values(records)
    .filter(r => r.favorite)
    .map(r => r.poemId)
}

function getMemorizedLocal(): string[] {
  const records = getStudyRecordsLocal()
  return Object.values(records)
    .filter(r => r.memorized)
    .map(r => r.poemId)
}

function getRecentlyViewedLocal(limit = 20): StudyRecord[] {
  const records = getStudyRecordsLocal()
  const capped = Math.max(1, Number.parseInt(String(limit), 10) || 20)
  return Object.values(records)
    .sort((a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime())
    .slice(0, capped)
}

function getStatsLocal(): StudyStats {
  const records = getStudyRecordsLocal()
  const all = Object.values(records)
  return {
    totalViewed: all.length,
    totalFavorites: all.filter(r => r.favorite).length,
    totalMemorized: all.filter(r => r.memorized).length,
    totalReviews: all.reduce((sum, r) => sum + r.reviewCount, 0),
  }
}

function getReciteNotebookLocal(): ReciteScopeId {
  const raw = safeReadJSON<ReciteScopeId | string>(RECITE_NOTEBOOK_KEY, DEFAULT_RECITE_SCOPE)
  return normalizeReciteScope(raw)
}

function setReciteNotebookLocal(notebook: ReciteScopeId): void {
  safeWriteJSON(RECITE_NOTEBOOK_KEY, normalizeReciteScope(notebook))
}

function normalizeGroupLocal(group: unknown): PoemGroup | null {
  if (!group || typeof group !== 'object') return null
  const raw = group as Partial<PoemGroup>
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!id || !name) return null
  const createdAt = raw.createdAt || new Date().toISOString()
  const updatedAt = raw.updatedAt || raw.createdAt || new Date().toISOString()
  const poemIds = Array.isArray(raw.poemIds)
    ? [...new Set(raw.poemIds.map(String).map(s => s.trim()).filter(Boolean))]
    : []
  return {
    id,
    name,
    poemIds,
    createdAt,
    updatedAt,
  }
}

function getPoemGroupsLocal(): PoemGroup[] {
  const groups = safeReadJSON<unknown[]>(GROUPS_KEY, [])
  if (!Array.isArray(groups)) return []
  const out: PoemGroup[] = []
  for (const group of groups) {
    const normalized = normalizeGroupLocal(group)
    if (normalized) out.push(normalized)
  }
  return out
}

function savePoemGroupsLocal(groups: PoemGroup[]): void {
  safeWriteJSON(GROUPS_KEY, groups)
}

function makeGroupId(): string {
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createPoemGroupLocal(name: string): PoemGroup {
  const normalizedName = name.trim() || '未命名分组'
  const now = new Date().toISOString()
  const next: PoemGroup = {
    id: makeGroupId(),
    name: normalizedName,
    poemIds: [],
    createdAt: now,
    updatedAt: now,
  }
  const groups = getPoemGroupsLocal()
  groups.unshift(next)
  savePoemGroupsLocal(groups)
  return next
}

function renamePoemGroupLocal(groupId: string, name: string): boolean {
  const nextName = name.trim()
  if (!nextName) return false
  const groups = getPoemGroupsLocal()
  const found = groups.find(g => g.id === groupId)
  if (!found) return false
  found.name = nextName
  found.updatedAt = new Date().toISOString()
  savePoemGroupsLocal(groups)
  return true
}

function deletePoemGroupLocal(groupId: string): void {
  const groups = getPoemGroupsLocal().filter(g => g.id !== groupId)
  savePoemGroupsLocal(groups)
}

function addPoemToGroupLocal(groupId: string, poemId: string): boolean {
  const groups = getPoemGroupsLocal()
  const found = groups.find(g => g.id === groupId)
  if (!found) return false
  if (!found.poemIds.includes(poemId)) {
    found.poemIds.push(poemId)
    found.updatedAt = new Date().toISOString()
    savePoemGroupsLocal(groups)
  }
  return true
}

function removePoemFromGroupLocal(groupId: string, poemId: string): boolean {
  const groups = getPoemGroupsLocal()
  const found = groups.find(g => g.id === groupId)
  if (!found) return false
  const before = found.poemIds.length
  found.poemIds = found.poemIds.filter(id => id !== poemId)
  if (found.poemIds.length !== before) {
    found.updatedAt = new Date().toISOString()
    savePoemGroupsLocal(groups)
    return true
  }
  return false
}

function togglePoemInGroupLocal(groupId: string, poemId: string): boolean {
  const groups = getPoemGroupsLocal()
  const found = groups.find(g => g.id === groupId)
  if (!found) return false
  const exists = found.poemIds.includes(poemId)
  found.poemIds = exists
    ? found.poemIds.filter(id => id !== poemId)
    : [...found.poemIds, poemId]
  found.updatedAt = new Date().toISOString()
  savePoemGroupsLocal(groups)
  return !exists
}

function getPoemGroupByIdLocal(groupId: string): PoemGroup | null {
  const groups = getPoemGroupsLocal()
  return groups.find(g => g.id === groupId) || null
}

function getGroupsForPoemLocal(poemId: string): PoemGroup[] {
  return getPoemGroupsLocal().filter(g => g.poemIds.includes(poemId))
}

function getDesktopStudyBridge(): DesktopStudyBridge | null {
  if (typeof window === 'undefined') return null
  const withBridge = window as Window & {
    desktopMeta?: { runtime?: string }
    desktopStudy?: DesktopStudyBridge
  }
  if (withBridge.desktopMeta?.runtime !== 'static') return null
  return withBridge.desktopStudy || null
}

let desktopBootstrapPromise: Promise<void> | null = null

async function ensureDesktopBootstrap(bridge: DesktopStudyBridge): Promise<void> {
  if (typeof window === 'undefined') return
  if (desktopBootstrapPromise) return desktopBootstrapPromise

  desktopBootstrapPromise = (async () => {
    const alreadyDone = localStorage.getItem(DESKTOP_MIGRATION_FLAG_KEY) === '1'
    if (alreadyDone) return

    const payload = {
      studyRecords: getStudyRecordsLocal(),
      groups: getPoemGroupsLocal(),
      reciteNotebook: getReciteNotebookLocal(),
    }

    try {
      await bridge.bootstrap(payload)
    } catch {
      return
    }

    localStorage.setItem(DESKTOP_MIGRATION_FLAG_KEY, '1')
  })()

  return desktopBootstrapPromise
}

async function withDesktopBridge<T>(
  action: (bridge: DesktopStudyBridge) => Promise<T>,
  fallback: () => T
): Promise<T> {
  const bridge = getDesktopStudyBridge()
  if (!bridge) return fallback()

  await ensureDesktopBootstrap(bridge)

  try {
    return await action(bridge)
  } catch {
    return fallback()
  }
}

export async function getStudyRecords(): Promise<Record<string, StudyRecord>> {
  return withDesktopBridge(
    bridge => bridge.getStudyRecords(),
    () => getStudyRecordsLocal()
  )
}

export async function getStudyRecord(poemId: string): Promise<StudyRecord | null> {
  const normalizedId = poemId.trim()
  if (!normalizedId) return null
  return withDesktopBridge(
    bridge => bridge.getStudyRecord(normalizedId),
    () => getStudyRecordLocal(normalizedId)
  )
}

export async function saveStudyRecord(record: StudyRecord): Promise<void> {
  await withDesktopBridge(
    bridge => bridge.saveStudyRecord(record).then(() => undefined),
    () => {
      saveStudyRecordLocal(record)
      return undefined
    }
  )
}

export async function markViewed(poemId: string, shard?: number): Promise<void> {
  const normalizedId = poemId.trim()
  if (!normalizedId) return
  await withDesktopBridge(
    bridge => bridge.markViewed(normalizedId, shard).then(() => undefined),
    () => {
      markViewedLocal(normalizedId, shard)
      return undefined
    }
  )
}

export async function toggleFavorite(poemId: string): Promise<boolean> {
  const normalizedId = poemId.trim()
  if (!normalizedId) return false
  return withDesktopBridge(
    bridge => bridge.toggleFavorite(normalizedId),
    () => toggleFavoriteLocal(normalizedId)
  )
}

export async function markMemorized(poemId: string, memorized: boolean): Promise<void> {
  const normalizedId = poemId.trim()
  if (!normalizedId) return
  await withDesktopBridge(
    bridge => bridge.markMemorized(normalizedId, memorized).then(() => undefined),
    () => {
      markMemorizedLocal(normalizedId, memorized)
      return undefined
    }
  )
}

export async function getFavorites(): Promise<string[]> {
  return withDesktopBridge(
    bridge => bridge.getFavorites(),
    () => getFavoritesLocal()
  )
}

export async function getMemorized(): Promise<string[]> {
  return withDesktopBridge(
    bridge => bridge.getMemorized(),
    () => getMemorizedLocal()
  )
}

export async function getRecentlyViewed(limit = 20): Promise<StudyRecord[]> {
  return withDesktopBridge(
    bridge => bridge.getRecentlyViewed(limit),
    () => getRecentlyViewedLocal(limit)
  )
}

export async function getStats(): Promise<StudyStats> {
  return withDesktopBridge(
    bridge => bridge.getStats(),
    () => getStatsLocal()
  )
}

export function getTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return (localStorage.getItem(THEME_KEY) as 'light' | 'dark') || 'light'
}

export function setTheme(theme: 'light' | 'dark'): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(THEME_KEY, theme)
  if (theme === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

export function getFontSize(): string {
  if (typeof window === 'undefined') return 'medium'
  return localStorage.getItem(FONT_KEY) || 'medium'
}

export function setFontSize(size: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(FONT_KEY, size)
}

export async function getReciteNotebook(): Promise<ReciteScopeId> {
  const value = await withDesktopBridge(
    bridge => bridge.getReciteNotebook(),
    () => getReciteNotebookLocal()
  )
  return normalizeReciteScope(value)
}

export async function setReciteNotebook(notebook: ReciteScopeId): Promise<void> {
  const next = normalizeReciteScope(notebook)
  await withDesktopBridge(
    bridge => bridge.setReciteNotebook(next).then(() => undefined),
    () => {
      setReciteNotebookLocal(next)
      return undefined
    }
  )
}

export async function getPoemGroups(): Promise<PoemGroup[]> {
  return withDesktopBridge(
    bridge => bridge.getPoemGroups(),
    () => getPoemGroupsLocal()
  )
}

export async function savePoemGroups(groups: PoemGroup[]): Promise<void> {
  if (!Array.isArray(groups)) return
  const normalized = groups
    .map(normalizeGroupLocal)
    .filter((g): g is PoemGroup => g !== null)
  await withDesktopBridge(
    async bridge => {
      const existing = await bridge.getPoemGroups()
      for (const group of existing) {
        await bridge.deletePoemGroup(group.id)
      }
      for (const group of normalized) {
        const created = await bridge.createPoemGroup(group.name)
        for (const poemId of group.poemIds) {
          await bridge.addPoemToGroup(created.id, poemId)
        }
      }
      return undefined
    },
    () => {
      savePoemGroupsLocal(normalized)
      return undefined
    }
  )
}

export async function createPoemGroup(name: string): Promise<PoemGroup> {
  return withDesktopBridge(
    bridge => bridge.createPoemGroup(name),
    () => createPoemGroupLocal(name)
  )
}

export async function renamePoemGroup(groupId: string, name: string): Promise<boolean> {
  return withDesktopBridge(
    bridge => bridge.renamePoemGroup(groupId, name),
    () => renamePoemGroupLocal(groupId, name)
  )
}

export async function deletePoemGroup(groupId: string): Promise<void> {
  await withDesktopBridge(
    bridge => bridge.deletePoemGroup(groupId).then(() => undefined),
    () => {
      deletePoemGroupLocal(groupId)
      return undefined
    }
  )
}

export async function addPoemToGroup(groupId: string, poemId: string): Promise<boolean> {
  return withDesktopBridge(
    bridge => bridge.addPoemToGroup(groupId, poemId),
    () => addPoemToGroupLocal(groupId, poemId)
  )
}

export async function removePoemFromGroup(groupId: string, poemId: string): Promise<boolean> {
  return withDesktopBridge(
    bridge => bridge.removePoemFromGroup(groupId, poemId),
    () => removePoemFromGroupLocal(groupId, poemId)
  )
}

export async function togglePoemInGroup(groupId: string, poemId: string): Promise<boolean> {
  return withDesktopBridge(
    bridge => bridge.togglePoemInGroup(groupId, poemId),
    () => togglePoemInGroupLocal(groupId, poemId)
  )
}

export async function getPoemGroupById(groupId: string): Promise<PoemGroup | null> {
  return withDesktopBridge(
    bridge => bridge.getPoemGroupById(groupId),
    () => getPoemGroupByIdLocal(groupId)
  )
}

export async function getGroupsForPoem(poemId: string): Promise<PoemGroup[]> {
  return withDesktopBridge(
    bridge => bridge.getGroupsForPoem(poemId),
    () => getGroupsForPoemLocal(poemId)
  )
}
