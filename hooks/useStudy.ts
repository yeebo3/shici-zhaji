'use client'

import { useState, useEffect, useCallback } from 'react'
import { PoemGroup, PoemNotebookId, StudyRecord } from '@/lib/types'
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
    const record = storage.getStudyRecord(poemId)
    setIsFavorite(record?.favorite || false)
  }, [poemId])

  const toggle = useCallback(() => {
    const newVal = storage.toggleFavorite(poemId)
    setIsFavorite(newVal)
  }, [poemId])

  return { isFavorite, toggle }
}

export function useStudyStats() {
  const [stats, setStats] = useState({ totalViewed: 0, totalFavorites: 0, totalMemorized: 0, totalReviews: 0 })

  useEffect(() => {
    setStats(storage.getStats())
  }, [])

  const refresh = useCallback(() => {
    setStats(storage.getStats())
  }, [])

  return { stats, refresh }
}

export function useRecentlyViewed() {
  const [records, setRecords] = useState<StudyRecord[]>([])

  useEffect(() => {
    setRecords(storage.getRecentlyViewed())
  }, [])

  return records
}

export function useReciteNotebook() {
  const [notebook, setNotebookState] = useState<PoemNotebookId>('all')

  useEffect(() => {
    setNotebookState(storage.getReciteNotebook())
  }, [])

  const setNotebook = useCallback((next: PoemNotebookId) => {
    setNotebookState(next)
    storage.setReciteNotebook(next)
  }, [])

  return { notebook, setNotebook }
}

export function usePoemGroups() {
  const [groups, setGroups] = useState<PoemGroup[]>([])

  const refresh = useCallback(() => {
    setGroups(storage.getPoemGroups())
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const createGroup = useCallback((name: string) => {
    const next = storage.createPoemGroup(name)
    refresh()
    return next
  }, [refresh])

  const renameGroup = useCallback((groupId: string, name: string) => {
    const ok = storage.renamePoemGroup(groupId, name)
    if (ok) refresh()
    return ok
  }, [refresh])

  const deleteGroup = useCallback((groupId: string) => {
    storage.deletePoemGroup(groupId)
    refresh()
  }, [refresh])

  const togglePoem = useCallback((groupId: string, poemId: string) => {
    const inGroup = storage.togglePoemInGroup(groupId, poemId)
    refresh()
    return inGroup
  }, [refresh])

  const removePoem = useCallback((groupId: string, poemId: string) => {
    const ok = storage.removePoemFromGroup(groupId, poemId)
    if (ok) refresh()
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
