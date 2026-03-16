import { PoemGroup, PoemNotebookId, StudyRecord } from './types'

const STUDY_KEY = 'shici-study-records'
const THEME_KEY = 'shici-theme'
const FONT_KEY = 'shici-font-size'
const GROUPS_KEY = 'shici-poem-groups'
const RECITE_NOTEBOOK_KEY = 'shici-recite-notebook'

const NOTEBOOK_IDS: PoemNotebookId[] = ['all', 'annotated', 'plain']

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

export function getStudyRecords(): Record<string, StudyRecord> {
  return safeReadJSON<Record<string, StudyRecord>>(STUDY_KEY, {})
}

export function getStudyRecord(poemId: string): StudyRecord | null {
  const records = getStudyRecords()
  return records[poemId] || null
}

export function saveStudyRecord(record: StudyRecord): void {
  const records = getStudyRecords()
  records[record.poemId] = record
  safeWriteJSON(STUDY_KEY, records)
}

export function markViewed(poemId: string): void {
  const existing = getStudyRecord(poemId)
  saveStudyRecord({
    poemId,
    viewedAt: new Date().toISOString(),
    memorized: existing?.memorized || false,
    reviewCount: (existing?.reviewCount || 0) + 1,
    favorite: existing?.favorite || false,
  })
}

export function toggleFavorite(poemId: string): boolean {
  const existing = getStudyRecord(poemId)
  const newFav = !(existing?.favorite || false)
  saveStudyRecord({
    poemId,
    viewedAt: existing?.viewedAt || new Date().toISOString(),
    memorized: existing?.memorized || false,
    reviewCount: existing?.reviewCount || 0,
    favorite: newFav,
  })
  return newFav
}

export function markMemorized(poemId: string, memorized: boolean): void {
  const existing = getStudyRecord(poemId)
  saveStudyRecord({
    poemId,
    viewedAt: existing?.viewedAt || new Date().toISOString(),
    memorized,
    reviewCount: existing?.reviewCount || 0,
    favorite: existing?.favorite || false,
  })
}

export function getFavorites(): string[] {
  const records = getStudyRecords()
  return Object.values(records)
    .filter(r => r.favorite)
    .map(r => r.poemId)
}

export function getMemorized(): string[] {
  const records = getStudyRecords()
  return Object.values(records)
    .filter(r => r.memorized)
    .map(r => r.poemId)
}

export function getRecentlyViewed(): StudyRecord[] {
  const records = getStudyRecords()
  return Object.values(records)
    .sort((a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime())
    .slice(0, 20)
}

export function getStats() {
  const records = getStudyRecords()
  const all = Object.values(records)
  return {
    totalViewed: all.length,
    totalFavorites: all.filter(r => r.favorite).length,
    totalMemorized: all.filter(r => r.memorized).length,
    totalReviews: all.reduce((sum, r) => sum + r.reviewCount, 0),
  }
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

export function getReciteNotebook(): PoemNotebookId {
  const raw = safeReadJSON<PoemNotebookId | string>(RECITE_NOTEBOOK_KEY, 'all')
  if (typeof raw !== 'string') return 'all'
  return NOTEBOOK_IDS.includes(raw as PoemNotebookId) ? (raw as PoemNotebookId) : 'all'
}

export function setReciteNotebook(notebook: PoemNotebookId): void {
  safeWriteJSON(RECITE_NOTEBOOK_KEY, notebook)
}

export function getPoemGroups(): PoemGroup[] {
  const groups = safeReadJSON<PoemGroup[]>(GROUPS_KEY, [])
  if (!Array.isArray(groups)) return []
  return groups
    .filter(g => g && typeof g.id === 'string' && typeof g.name === 'string' && Array.isArray(g.poemIds))
    .map(g => ({
      id: g.id,
      name: g.name.trim() || '未命名分组',
      poemIds: [...new Set(g.poemIds.map(String))],
      createdAt: g.createdAt || new Date().toISOString(),
      updatedAt: g.updatedAt || g.createdAt || new Date().toISOString(),
    }))
}

export function savePoemGroups(groups: PoemGroup[]): void {
  safeWriteJSON(GROUPS_KEY, groups)
}

function makeGroupId(): string {
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function createPoemGroup(name: string): PoemGroup {
  const normalizedName = name.trim() || '未命名分组'
  const now = new Date().toISOString()
  const next: PoemGroup = {
    id: makeGroupId(),
    name: normalizedName,
    poemIds: [],
    createdAt: now,
    updatedAt: now,
  }
  const groups = getPoemGroups()
  groups.unshift(next)
  savePoemGroups(groups)
  return next
}

export function renamePoemGroup(groupId: string, name: string): boolean {
  const nextName = name.trim()
  if (!nextName) return false
  const groups = getPoemGroups()
  const found = groups.find(g => g.id === groupId)
  if (!found) return false
  found.name = nextName
  found.updatedAt = new Date().toISOString()
  savePoemGroups(groups)
  return true
}

export function deletePoemGroup(groupId: string): void {
  const groups = getPoemGroups().filter(g => g.id !== groupId)
  savePoemGroups(groups)
}

export function addPoemToGroup(groupId: string, poemId: string): boolean {
  const groups = getPoemGroups()
  const found = groups.find(g => g.id === groupId)
  if (!found) return false
  if (!found.poemIds.includes(poemId)) {
    found.poemIds.push(poemId)
    found.updatedAt = new Date().toISOString()
    savePoemGroups(groups)
  }
  return true
}

export function removePoemFromGroup(groupId: string, poemId: string): boolean {
  const groups = getPoemGroups()
  const found = groups.find(g => g.id === groupId)
  if (!found) return false
  const before = found.poemIds.length
  found.poemIds = found.poemIds.filter(id => id !== poemId)
  if (found.poemIds.length !== before) {
    found.updatedAt = new Date().toISOString()
    savePoemGroups(groups)
  }
  return true
}

export function togglePoemInGroup(groupId: string, poemId: string): boolean {
  const groups = getPoemGroups()
  const found = groups.find(g => g.id === groupId)
  if (!found) return false
  const exists = found.poemIds.includes(poemId)
  found.poemIds = exists
    ? found.poemIds.filter(id => id !== poemId)
    : [...found.poemIds, poemId]
  found.updatedAt = new Date().toISOString()
  savePoemGroups(groups)
  return !exists
}

export function getPoemGroupById(groupId: string): PoemGroup | null {
  const groups = getPoemGroups()
  return groups.find(g => g.id === groupId) || null
}

export function getGroupsForPoem(poemId: string): PoemGroup[] {
  return getPoemGroups().filter(g => g.poemIds.includes(poemId))
}
