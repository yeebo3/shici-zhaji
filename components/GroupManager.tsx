'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePoemGroups } from '@/hooks/useStudy'
import { getPoemIndexByIds, getPoemNotebooks, queryPoems } from '@/lib/poems'
import { PoemIndex, PoemNotebook } from '@/lib/types'
import { DEFAULT_RECITE_NOTEBOOK_ID } from '@/lib/notebooks'
import PoemCard from '@/components/PoemCard'
import { Pencil, Trash2, Check, Plus, BookMarked } from 'lucide-react'

const NOTEBOOK_SCOPE_PREFIX = 'notebook:'
const GROUP_SCOPE_PREFIX = 'group:'
const PAGE_SIZE = 120

function toNotebookScopeId(notebookId: string): string {
  return `${NOTEBOOK_SCOPE_PREFIX}${notebookId}`
}

function toGroupScopeId(groupId: string): string {
  return `${GROUP_SCOPE_PREFIX}${groupId}`
}

function getNotebookIdFromScope(scopeId: string): string | null {
  if (!scopeId.startsWith(NOTEBOOK_SCOPE_PREFIX)) return null
  const id = scopeId.slice(NOTEBOOK_SCOPE_PREFIX.length).trim()
  return id || null
}

function getGroupIdFromScope(scopeId: string): string | null {
  if (!scopeId.startsWith(GROUP_SCOPE_PREFIX)) return null
  const id = scopeId.slice(GROUP_SCOPE_PREFIX.length).trim()
  return id || null
}

export default function GroupManager() {
  const { groups, createGroup, renameGroup, deleteGroup, removePoem } = usePoemGroups()
  const [notebooks, setNotebooks] = useState<PoemNotebook[]>([])
  const [activeScopeId, setActiveScopeId] = useState(() => toNotebookScopeId(DEFAULT_RECITE_NOTEBOOK_ID))
  const [poems, setPoems] = useState<PoemIndex[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [editingName, setEditingName] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [notebookHasMore, setNotebookHasMore] = useState(false)
  const [notebookTotal, setNotebookTotal] = useState(0)

  const visibleNotebooks = notebooks
  const fallbackNotebookId = useMemo(
    () => visibleNotebooks.find(item => item.id === DEFAULT_RECITE_NOTEBOOK_ID)?.id
      || visibleNotebooks[0]?.id
      || DEFAULT_RECITE_NOTEBOOK_ID,
    [visibleNotebooks]
  )
  const activeNotebookId = useMemo(() => getNotebookIdFromScope(activeScopeId), [activeScopeId])
  const activeGroupId = useMemo(() => getGroupIdFromScope(activeScopeId), [activeScopeId])
  const activeNotebook = useMemo(
    () => visibleNotebooks.find(item => item.id === activeNotebookId) || null,
    [visibleNotebooks, activeNotebookId]
  )
  const activeCustomGroup = useMemo(
    () => groups.find(g => g.id === activeGroupId) || null,
    [groups, activeGroupId]
  )
  const isNotebookScope = activeNotebookId !== null

  useEffect(() => {
    let cancelled = false

    async function loadNotebooks() {
      try {
        const list = await getPoemNotebooks()
        if (!cancelled) setNotebooks(list)
      } catch {
        if (!cancelled) setNotebooks([])
      }
    }

    void loadNotebooks()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!activeNotebookId) return
    if (visibleNotebooks.some(item => item.id === activeNotebookId)) return
    setActiveScopeId(toNotebookScopeId(fallbackNotebookId))
    setIsEditing(false)
  }, [activeNotebookId, visibleNotebooks, fallbackNotebookId])

  useEffect(() => {
    if (!activeGroupId) return
    if (activeCustomGroup) return
    setActiveScopeId(toNotebookScopeId(fallbackNotebookId))
    setIsEditing(false)
  }, [activeGroupId, activeCustomGroup, fallbackNotebookId])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        if (isNotebookScope && activeNotebookId) {
          const res = await queryPoems({
            notebook: activeNotebookId,
            offset: 0,
            limit: PAGE_SIZE,
          })
          if (cancelled) return
          setPoems(res.items)
          setNotebookHasMore(res.hasMore)
          setNotebookTotal(res.total)
          return
        }

        if (!activeCustomGroup) {
          if (!cancelled) {
            setPoems([])
            setNotebookHasMore(false)
            setNotebookTotal(0)
          }
          return
        }

        const items = await getPoemIndexByIds(activeCustomGroup.poemIds)
        if (!cancelled) {
          setPoems(items)
          setNotebookHasMore(false)
          setNotebookTotal(items.length)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [isNotebookScope, activeNotebookId, activeCustomGroup])

  const handleLoadMoreNotebook = async () => {
    if (!isNotebookScope || !activeNotebookId || loadingMore || !notebookHasMore) return
    setLoadingMore(true)
    try {
      const res = await queryPoems({
        notebook: activeNotebookId,
        offset: poems.length,
        limit: PAGE_SIZE,
      })
      setPoems(prev => [...prev, ...res.items])
      setNotebookHasMore(res.hasMore)
      setNotebookTotal(res.total)
    } finally {
      setLoadingMore(false)
    }
  }

  const handleCreate = async () => {
    const name = newGroupName.trim()
    if (!name) return
    const created = await createGroup(name)
    setNewGroupName('')
    setActiveScopeId(toGroupScopeId(created.id))
    setIsEditing(false)
  }

  const handleRename = async () => {
    if (!activeCustomGroup) return
    const name = editingName.trim()
    if (!name) return
    const ok = await renameGroup(activeCustomGroup.id, name)
    if (ok) setIsEditing(false)
  }

  const handleDelete = async () => {
    if (!activeCustomGroup) return
    if (!window.confirm(`确定删除分组「${activeCustomGroup.name}」吗？`)) return
    await deleteGroup(activeCustomGroup.id)
    setActiveScopeId(toNotebookScopeId(fallbackNotebookId))
    setIsEditing(false)
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <p className="text-xs text-ash tracking-widest uppercase mb-3">新建分组</p>
        <div className="flex gap-2">
          <input
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            placeholder="例如：期中背诵、送别诗"
            className="flex-1 px-3 py-2 rounded-md bg-cream dark:bg-night-card border border-stone/20 dark:border-stone/10 text-sm"
          />
          <button onClick={() => { void handleCreate() }} className="btn-ghost px-3 inline-flex items-center gap-1">
            <Plus size={13} />
            新建
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {visibleNotebooks.map(notebook => (
          <button
            key={notebook.id}
            onClick={() => {
              setActiveScopeId(toNotebookScopeId(notebook.id))
              setIsEditing(false)
            }}
            className={`card p-3 text-left transition-colors ${
              activeScopeId === toNotebookScopeId(notebook.id)
                ? 'border-stone/40 dark:border-stone/25'
                : 'hover:border-stone/30 dark:hover:border-stone/20'
            }`}
          >
            <div className="flex items-center gap-2">
              <BookMarked size={15} className="text-ash" />
              <p className="text-sm font-medium">{notebook.name}</p>
            </div>
            <p className="text-xs text-ash mt-1">{notebook.count} 首</p>
          </button>
        ))}

        {groups.map(group => (
          <button
            key={group.id}
            onClick={() => {
              setActiveScopeId(toGroupScopeId(group.id))
              setIsEditing(false)
            }}
            className={`card p-3 text-left transition-colors ${
              activeScopeId === toGroupScopeId(group.id)
                ? 'border-stone/40 dark:border-stone/25'
                : 'hover:border-stone/30 dark:hover:border-stone/20'
            }`}
          >
            <p className="text-sm font-medium">{group.name}</p>
            <p className="text-xs text-ash mt-1">{group.poemIds.length} 首</p>
          </button>
        ))}
      </div>

      {isNotebookScope && activeNotebook ? (
        <div className="card p-4">
          <p className="text-xs text-ash tracking-widest uppercase mb-2">诗词本说明</p>
          <p className="text-sm text-ink/70 dark:text-night-text/70 leading-relaxed">
            {activeNotebook.description}
          </p>
        </div>
      ) : activeCustomGroup ? (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-ash tracking-widest uppercase">分组管理</p>
            <div className="flex items-center gap-1">
              <button
                className="btn-ghost p-2"
                onClick={() => {
                  setEditingName(activeCustomGroup.name)
                  setIsEditing(true)
                }}
                aria-label="重命名分组"
              >
                <Pencil size={14} />
              </button>
              <button className="btn-ghost p-2 text-rose-500" onClick={() => { void handleDelete() }} aria-label="删除分组">
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {isEditing && (
            <div className="flex gap-2 mb-2">
              <input
                value={editingName}
                onChange={e => setEditingName(e.target.value)}
                className="flex-1 px-3 py-2 rounded-md bg-cream dark:bg-night-card border border-stone/20 dark:border-stone/10 text-sm"
              />
              <button className="btn-ghost px-3 inline-flex items-center gap-1" onClick={() => { void handleRename() }}>
                <Check size={13} />
                保存
              </button>
            </div>
          )}
        </div>
      ) : null}

      <div className="space-y-3">
        {loading && <p className="text-xs text-ash text-center py-2">加载分组诗词中...</p>}
        {!loading && poems.length === 0 && (
          <div className="text-center py-12 text-ash text-sm">
            {isNotebookScope
              ? `${activeNotebook?.name || '当前诗词本'} 暂时没有可显示内容`
              : '该分组还没有诗词'}
          </div>
        )}
        {poems.map(poem => (
          <div key={poem.id} className="relative">
            <PoemCard poem={poem} />
            {!isNotebookScope && activeCustomGroup && (
              <button
                onClick={() => { void removePoem(activeCustomGroup.id, poem.id) }}
                className="absolute bottom-3 right-3 btn-ghost text-xs px-2 py-1 text-rose-500"
              >
                移出分组
              </button>
            )}
          </div>
        ))}
      </div>

      {isNotebookScope && notebookHasMore && (
        <div className="text-center">
          <button className="btn-ghost" disabled={loadingMore} onClick={handleLoadMoreNotebook}>
            {loadingMore ? '加载中...' : `加载更多 (${poems.length}/${notebookTotal})`}
          </button>
        </div>
      )}
    </div>
  )
}
