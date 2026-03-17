'use client'

import { useMemo, useState } from 'react'
import { usePoemGroups } from '@/hooks/useStudy'
import { Check, Plus, X } from 'lucide-react'

export default function GroupPicker({
  poemId,
  open,
  onClose,
}: {
  poemId: string
  open: boolean
  onClose: () => void
}) {
  const { groups, createGroup, togglePoem } = usePoemGroups()
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const selectedIds = useMemo(() => {
    return new Set(groups.filter(g => g.poemIds.includes(poemId)).map(g => g.id))
  }, [groups, poemId])

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    if (groups.some(g => g.name === name)) {
      setError('分组名已存在')
      return
    }
    await createGroup(name)
    setNewName('')
    setError(null)
  }

  if (!open) return null

  return (
    <div className="card p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-ash tracking-widest uppercase">加入分组</p>
        <button onClick={onClose} className="btn-ghost p-1.5" aria-label="关闭分组面板">
          <X size={14} />
        </button>
      </div>

      <div className="flex gap-2 mb-3">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="新建分组名"
          className="flex-1 px-3 py-2 rounded-md bg-cream dark:bg-night-card border border-stone/20 dark:border-stone/10 text-sm"
        />
        <button onClick={() => { void handleCreate() }} className="btn-ghost px-3 inline-flex items-center gap-1">
          <Plus size={13} />
          新建
        </button>
      </div>
      {error && <p className="text-xs text-rose-500 mb-2">{error}</p>}

      {groups.length === 0 ? (
        <p className="text-xs text-ash">还没有分组，先创建一个。</p>
      ) : (
        <div className="space-y-2">
          {groups.map(group => {
            const selected = selectedIds.has(group.id)
            return (
              <button
                key={group.id}
                onClick={() => { void togglePoem(group.id, poemId) }}
                className={`w-full px-3 py-2 rounded-md text-left flex items-center justify-between transition-colors ${
                  selected
                    ? 'bg-ink/10 dark:bg-white/10 text-ink dark:text-night-text'
                    : 'bg-ink/3 dark:bg-white/3 text-ash hover:text-ink dark:hover:text-night-text'
                }`}
              >
                <span className="text-sm">{group.name}</span>
                {selected && <Check size={14} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
