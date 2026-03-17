'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePoemGroups } from '@/hooks/useStudy'
import { getPoemIndexByIds, getPoemNotebooks, queryPoems } from '@/lib/poems'
import { PoemIndex } from '@/lib/types'
import PoemCard from '@/components/PoemCard'
import { Pencil, Trash2, Check, Plus, BookMarked } from 'lucide-react'

const BUILTIN_ANNOTATED_ID = '__builtin_annotated__'
const PAGE_SIZE = 120

export default function GroupManager() {
  const { groups, createGroup, renameGroup, deleteGroup, removePoem } = usePoemGroups()
  const [activeGroupId, setActiveGroupId] = useState<string>(BUILTIN_ANNOTATED_ID)
  const [poems, setPoems] = useState<PoemIndex[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [editingName, setEditingName] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [annotatedCount, setAnnotatedCount] = useState(0)
  const [annotatedHasMore, setAnnotatedHasMore] = useState(false)

  const activeCustomGroup = useMemo(
    () => groups.find(g => g.id === activeGroupId) || null,
    [groups, activeGroupId]
  )
  const isBuiltinAnnotated = activeGroupId === BUILTIN_ANNOTATED_ID

  useEffect(() => {
    let cancelled = false
    async function loadNotebookMeta() {
      try {
        const list = await getPoemNotebooks()
        const annotated = list.find(item => item.id === 'annotated')
        if (!cancelled && annotated) setAnnotatedCount(annotated.count)
      } catch {
        // ignore
      }
    }
    loadNotebookMeta()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (isBuiltinAnnotated) return
    if (!activeCustomGroup) {
      setActiveGroupId(BUILTIN_ANNOTATED_ID)
      setIsEditing(false)
    }
  }, [activeCustomGroup, isBuiltinAnnotated])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        if (isBuiltinAnnotated) {
          const res = await queryPoems({
            notebook: 'annotated',
            offset: 0,
            limit: PAGE_SIZE,
          })
          if (cancelled) return
          setPoems(res.items)
          setAnnotatedHasMore(res.hasMore)
          setAnnotatedCount(res.total)
          return
        }

        if (!activeCustomGroup) {
          if (!cancelled) setPoems([])
          return
        }

        const items = await getPoemIndexByIds(activeCustomGroup.poemIds)
        if (!cancelled) setPoems(items)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [isBuiltinAnnotated, activeCustomGroup])

  const handleLoadMoreAnnotated = async () => {
    if (loadingMore || !annotatedHasMore) return
    setLoadingMore(true)
    try {
      const res = await queryPoems({
        notebook: 'annotated',
        offset: poems.length,
        limit: PAGE_SIZE,
      })
      setPoems(prev => [...prev, ...res.items])
      setAnnotatedHasMore(res.hasMore)
      setAnnotatedCount(res.total)
    } finally {
      setLoadingMore(false)
    }
  }

  const handleCreate = async () => {
    const name = newGroupName.trim()
    if (!name) return
    const created = await createGroup(name)
    setNewGroupName('')
    setActiveGroupId(created.id)
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
    setActiveGroupId(BUILTIN_ANNOTATED_ID)
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
        <button
          onClick={() => {
            setActiveGroupId(BUILTIN_ANNOTATED_ID)
            setIsEditing(false)
          }}
          className={`card p-3 text-left transition-colors ${
            isBuiltinAnnotated
              ? 'border-stone/40 dark:border-stone/25'
              : 'hover:border-stone/30 dark:hover:border-stone/20'
          }`}
        >
          <div className="flex items-center gap-2">
            <BookMarked size={15} className="text-ash" />
            <p className="text-sm font-medium">常用诗词本</p>
          </div>
          <p className="text-xs text-ash mt-1">{annotatedCount} 首（按 annotation 自动分组）</p>
        </button>

        {groups.map(group => (
          <button
            key={group.id}
            onClick={() => {
              setActiveGroupId(group.id)
              setIsEditing(false)
            }}
            className={`card p-3 text-left transition-colors ${
              activeGroupId === group.id
                ? 'border-stone/40 dark:border-stone/25'
                : 'hover:border-stone/30 dark:hover:border-stone/20'
            }`}
          >
            <p className="text-sm font-medium">{group.name}</p>
            <p className="text-xs text-ash mt-1">{group.poemIds.length} 首</p>
          </button>
        ))}
      </div>

      {isBuiltinAnnotated ? (
        <div className="card p-4">
          <p className="text-xs text-ash tracking-widest uppercase mb-2">分组说明</p>
          <p className="text-sm text-ink/70 dark:text-night-text/70 leading-relaxed">
            「常用诗词本」为系统内置分组，自动收录有注释（annotation 非空）的诗词，支持直接浏览与背诵，不可手动重命名或删除。
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
            {isBuiltinAnnotated ? '常用诗词本暂时没有可显示内容' : '该分组还没有诗词'}
          </div>
        )}
        {poems.map(poem => (
          <div key={poem.id} className="relative">
            <PoemCard poem={poem} />
            {!isBuiltinAnnotated && activeCustomGroup && (
              <button
                onClick={() => { void removePoem(activeCustomGroup.id, poem.id) }}
                className="absolute top-3 right-3 btn-ghost text-xs px-2 py-1 text-rose-500"
              >
                移出分组
              </button>
            )}
          </div>
        ))}
      </div>

      {isBuiltinAnnotated && annotatedHasMore && (
        <div className="text-center">
          <button className="btn-ghost" disabled={loadingMore} onClick={handleLoadMoreAnnotated}>
            {loadingMore ? '加载中...' : `加载更多 (${poems.length}/${annotatedCount})`}
          </button>
        </div>
      )}
    </div>
  )
}
