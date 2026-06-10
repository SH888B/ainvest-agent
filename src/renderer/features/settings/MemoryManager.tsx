import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { listAllItems } from '../../services/memory/vectorStore'
import { deleteMemory, cleanupExpired } from '../../services/memory/memoryArchive'
import type { MemoryCategory } from '../../../shared/types/memory'
import { Search, Trash2, AlertTriangle, Database, RefreshCw, Filter } from 'lucide-react'

interface MemoryItem {
  id: string
  content: string
  category: MemoryCategory
  importance: number
  sourceSessionId: string
  createdAt: string
  lastAccessedAt: string
}

type FilterCategory = MemoryCategory | 'all'
type SortKey = 'createdAt' | 'importance' | 'lastAccessedAt'

/**
 * 记忆管理页面
 * 展示、筛选、删除、批量清理记忆
 */
export const MemoryManager: React.FC = () => {
  const [items, setItems] = useState<MemoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<FilterCategory>('all')
  const [importanceFilter, setImportanceFilter] = useState<number | 'all'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('createdAt')
  const [sortDesc, setSortDesc] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [cleaning, setCleaning] = useState(false)
  const [cleanResult, setCleanResult] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const records = await listAllItems()
      const mapped: MemoryItem[] = records.map((r) => ({
        id: r.id,
        content: r.metadata.content,
        category: r.metadata.category,
        importance: r.metadata.importance,
        sourceSessionId: r.metadata.sourceSessionId,
        createdAt: r.metadata.createdAt,
        lastAccessedAt: r.metadata.lastAccessedAt,
      }))
      setItems(mapped)
    } catch (err) {
      console.error('[MemoryManager] 加载失败:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  const filtered = useMemo(() => {
    let result = items

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((i) => i.content.toLowerCase().includes(q))
    }

    if (categoryFilter !== 'all') {
      result = result.filter((i) => i.category === categoryFilter)
    }

    if (importanceFilter !== 'all') {
      result = result.filter((i) => i.importance === importanceFilter)
    }

    result = [...result].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'importance') {
        cmp = a.importance - b.importance
      } else {
        cmp = new Date(a[sortKey]).getTime() - new Date(b[sortKey]).getTime()
      }
      return sortDesc ? -cmp : cmp
    })

    return result
  }, [items, searchQuery, categoryFilter, importanceFilter, sortKey, sortDesc])

  const handleDeleteRequest = (id: string) => {
    setDeleteConfirmId(id)
  }

  const handleConfirmDelete = async (id: string) => {
    setDeleteConfirmId(null)
    setDeletingId(id)
    try {
      await deleteMemory(id)
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch (err) {
      console.error('[MemoryManager] 删除失败:', err)
    } finally {
      setDeletingId(null)
    }
  }

  const handleCancelDelete = () => {
    setDeleteConfirmId(null)
  }

  const handleCleanup = async () => {
    setCleaning(true)
    setCleanResult(null)
    try {
      const deleted = await cleanupExpired()
      setCleanResult(`已清理 ${deleted} 条过期记忆`)
      await loadItems()
    } catch (err) {
      setCleanResult(`清理失败: ${String(err)}`)
    } finally {
      setCleaning(false)
    }
  }

  const categoryColors: Record<MemoryCategory, string> = {
    stock: 'bg-blue-500/20 text-blue-400',
    market: 'bg-purple-500/20 text-purple-400',
    strategy: 'bg-orange-500/20 text-orange-400',
    preference: 'bg-green-500/20 text-green-400',
    general: 'bg-gray-500/20 text-gray-400',
  }

  const categoryLabels: Record<MemoryCategory, string> = {
    stock: '股票',
    market: '市场',
    strategy: '策略',
    preference: '偏好',
    general: '通用',
  }

  return (
    <div className="space-y-4">
      {/* 统计栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span className="flex items-center gap-1">
            <Database className="h-3.5 w-3.5" />
            共 {items.length} 条记忆
          </span>
          <span>|</span>
          <span>显示 {filtered.length} 条</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCleanup}
            disabled={cleaning}
            className="flex items-center gap-1 rounded border border-warning/30 bg-warning/10 px-2 py-1 text-xs text-warning hover:bg-warning/20 disabled:opacity-50"
          >
            <AlertTriangle className="h-3 w-3" />
            {cleaning ? '清理中...' : '清理过期'}
          </button>
          <button
            onClick={loadItems}
            disabled={loading}
            className="flex items-center gap-1 rounded border border-border bg-surface px-2 py-1 text-xs text-text hover:bg-surface-hover disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {cleanResult && (
        <div className="rounded border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs text-primary">
          {cleanResult}
        </div>
      )}

      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索记忆内容..."
            className="w-full rounded border border-border bg-background py-1.5 pl-7 pr-2 text-xs text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1">
          <Filter className="h-3 w-3 text-text-muted" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as FilterCategory)}
            className="rounded border border-border bg-background px-2 py-1.5 text-xs text-text"
          >
            <option value="all">全部分类</option>
            <option value="stock">股票</option>
            <option value="market">市场</option>
            <option value="strategy">策略</option>
            <option value="preference">偏好</option>
            <option value="general">通用</option>
          </select>
        </div>

        <select
          value={importanceFilter}
          onChange={(e) => setImportanceFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="rounded border border-border bg-background px-2 py-1.5 text-xs text-text"
        >
          <option value="all">全部重要性</option>
          <option value={5}>重要性 5</option>
          <option value={4}>重要性 4</option>
          <option value={3}>重要性 3</option>
          <option value={2}>重要性 2</option>
          <option value={1}>重要性 1</option>
        </select>

        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded border border-border bg-background px-2 py-1.5 text-xs text-text"
        >
          <option value="createdAt">按创建时间</option>
          <option value="importance">按重要性</option>
          <option value="lastAccessedAt">按最后访问</option>
        </select>

        <button
          onClick={() => setSortDesc((d) => !d)}
          className="rounded border border-border px-2 py-1.5 text-xs text-text hover:bg-surface"
        >
          {sortDesc ? '降序' : '升序'}
        </button>
      </div>

      {/* 记忆列表 */}
      <div className="max-h-[400px] overflow-y-auto space-y-1.5">
        {loading && (
          <div className="py-8 flex flex-col items-center gap-2 text-text-muted">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span className="text-xs">加载记忆...</span>
          </div>
        )}
        
        {!loading && filtered.length === 0 && (
          <div className="py-8 text-center text-xs text-text-muted">
            {items.length === 0 ? '暂无记忆记录' : '没有匹配的记忆'}
          </div>
        )}
        
        {!loading && filtered.map((item) => (
          <div
            key={item.id}
            className="flex items-start justify-between gap-2 rounded-lg border border-border bg-surface p-2.5"
          >
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${categoryColors[item.category]}`}>
                  {categoryLabels[item.category]}
                </span>
                <span className="text-[10px] text-text-muted">
                  重要性: {item.importance}
                </span>
                <span className="text-[10px] text-text-muted">
                  {new Date(item.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="text-xs text-text">{item.content}</p>
              <p className="mt-0.5 text-[10px] text-text-muted truncate">
                ID: {item.id} | 来源: {item.sourceSessionId.slice(0, 12)}...
              </p>
            </div>
            
            {/* 删除确认状态 */}
            {deleteConfirmId === item.id ? (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleConfirmDelete(item.id)}
                  disabled={deletingId === item.id}
                  className="rounded px-2 py-1 text-[10px] bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                >
                  确认
                </button>
                <button
                  onClick={handleCancelDelete}
                  disabled={deletingId === item.id}
                  className="rounded px-2 py-1 text-[10px] border border-border hover:bg-surface disabled:opacity-50"
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleDeleteRequest(item.id)}
                disabled={deletingId === item.id}
                className="shrink-0 rounded p-1 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
