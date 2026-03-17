'use client'

import { useState, useEffect, useCallback } from 'react'
import { PoemGroup, ReciteScopeId, StudyRecord } from '@/lib/types'
import * as storage from '@/lib/storage'

export function useTheme() {
  const [theme, setThemeState] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const saved = storage.getTheme()
    setThemeState(saved)
    if (saved === 'dark') {
      document.documentElement.classList.add('dark')
    }
  }, [])

  const toggleTheme = useCallback(() => {
    const next = theme === 'light' ? 'dark' : 'light'
    setThemeState(next)
    storage.setTheme(next)
  }, [theme])

  return { theme, toggleTheme }
}

export function useFontSize() {
  const [fontSize, setFontSizeState] = useState('medium')

  useEffect(() => {
    setFontSizeState(storage.getFontSize())
  }, [])

  const setFontSize = useCallback((size: string) => {
    setFontSizeState(size)
    storage.setFontSize(size)
  }, [])

  const fontClass = fontSize === 'small' ? 'text-base' : fontSize === 'large' ? 'text-2xl' : 'text-xl'

  return { fontSize, setFontSize, fontClass }
}

export function useFavorite(poemId: string) {
  const [isFavorite, setIsFavorite] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const record = await storage.getStudyRecord(poemId)
      if (!cancelled) setIsFavorite(record?.favorite || false)
    }
    void load()
    return () => { cancelled = true }
  }, [poemId])

  const toggle = useCallback(async () => {
    const newVal = await storage.toggleFavorite(poemId)
    setIsFavorite(newVal)
    return newVal
  }, [poemId])

  return { isFavorite, toggle }
}

export function useStudyStats() {
  const [stats, setStats] = useState({ totalViewed: 0, totalFavorites: 0, totalMemorized: 0, totalReviews: 0 })

  const refresh = useCallback(async () => {
    const next = await storage.getStats()
    setStats(next)
    return next
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { stats, refresh }
}

export function useRecentlyViewed() {
  const [records, setRecords] = useState<StudyRecord[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const next = await storage.getRecentlyViewed()
      if (!cancelled) setRecords(next)
    }
    void load()
    return () => { cancelled = true }
  }, [])

  return records
}

export function useReciteNotebook() {
  const [notebook, setNotebookState] = useState<ReciteScopeId>('annotated')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const next = await storage.getReciteNotebook()
      if (!cancelled) setNotebookState(next)
    }
    void load()
    return () => { cancelled = true }
  }, [])

  const setNotebook = useCallback(async (next: ReciteScopeId) => {
    setNotebookState(next)
    await storage.setReciteNotebook(next)
  }, [])

  return { notebook, setNotebook }
}

export function usePoemGroups() {
  const [groups, setGroups] = useState<PoemGroup[]>([])

  const refresh = useCallback(async () => {
    const next = await storage.getPoemGroups()
    setGroups(next)
    return next
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const createGroup = useCallback(async (name: string) => {
    const next = await storage.createPoemGroup(name)
    await refresh()
    return next
  }, [refresh])

  const renameGroup = useCallback(async (groupId: string, name: string) => {
    const ok = await storage.renamePoemGroup(groupId, name)
    if (ok) await refresh()
    return ok
  }, [refresh])

  const deleteGroup = useCallback(async (groupId: string) => {
    await storage.deletePoemGroup(groupId)
    await refresh()
  }, [refresh])

  const togglePoem = useCallback(async (groupId: string, poemId: string) => {
    const inGroup = await storage.togglePoemInGroup(groupId, poemId)
    await refresh()
    return inGroup
  }, [refresh])

  const removePoem = useCallback(async (groupId: string, poemId: string) => {
    const ok = await storage.removePoemFromGroup(groupId, poemId)
    if (ok) await refresh()
    return ok
  }, [refresh])

  return {
    groups,
    refresh,
    createGroup,
    renameGroup,
    deleteGroup,
    togglePoem,
    removePoem,
  }
}
