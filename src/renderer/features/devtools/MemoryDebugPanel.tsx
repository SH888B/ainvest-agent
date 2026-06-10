import React, { useState, useCallback } from 'react'
import {
  generateEmbedding,
  generateEmbeddings,
  getVectorDimension,
} from '../../services/memory/embeddingService'
import {
  addVector,
  queryVectors,
  removeVector,
  getStoreStats,
} from '../../services/memory/vectorStore'
import type { MemoryCategory } from '../../../shared/types/memory'
import { Brain, Search, Plus, Trash2, Database, AlertCircle } from 'lucide-react'

/**
 * 向量记忆调试面板
 * Iteration 3 临时调试页面，用于验证 embedding + Vectra 完整链路
 */
export const MemoryDebugPanel: React.FC = () => {
  // Embedding 调试
  const [embedText, setEmbedText] = useState('宁德时代 Q2 财报超预期')
  const [embedResult, setEmbedResult] = useState<{
    dimension: number
    preview: number[]
    time: number
  } | null>(null)
  const [embedError, setEmbedError] = useState('')

  // 添加记忆
  const [memoryContent, setMemoryContent] = useState('')
  const [memoryCategory, setMemoryCategory] = useState<MemoryCategory>('stock')
  const [memoryImportance, setMemoryImportance] = useState<1 | 2 | 3 | 4 | 5>(3)
  const [addResult, setAddResult] = useState('')

  // 查询记忆
  const [queryText, setQueryText] = useState('那家电池公司')
  const [queryResults, setQueryResults] = useState<
    { id: string; score: number; content: string; category: string }[]
  >([])
  const [queryTime, setQueryTime] = useState(0)

  // 索引统计
  const [stats, setStats] = useState<{ itemCount: number; path: string } | null>(null)

  const handleEmbed = useCallback(async () => {
    setEmbedError('')
    setEmbedResult(null)
    try {
      const start = performance.now()
      const vector = await generateEmbedding(embedText)
      const time = performance.now() - start
      setEmbedResult({
        dimension: vector.length,
        preview: vector.slice(0, 5),
        time,
      })
    } catch (err) {
      setEmbedError(String(err))
    }
  }, [embedText])

  const handleAddMemory = useCallback(async () => {
    if (!memoryContent.trim()) return
    setAddResult('')
    try {
      const vector = await generateEmbedding(memoryContent)
      const id = `debug-${Date.now()}`
      await addVector({
        id,
        vector,
        metadata: {
          content: memoryContent,
          category: memoryCategory,
          importance: memoryImportance,
          sourceSessionId: 'debug-session',
          createdAt: new Date().toISOString(),
          lastAccessedAt: new Date().toISOString(),
          accessCount: 0,
        },
      })
      setAddResult(`已添加: ${id}`)
      setMemoryContent('')
      // 刷新统计
      const s = await getStoreStats()
      setStats(s)
    } catch (err) {
      setAddResult(`错误: ${String(err)}`)
    }
  }, [memoryContent, memoryCategory, memoryImportance])

  const handleQuery = useCallback(async () => {
    setQueryResults([])
    try {
      const start = performance.now()
      const vector = await generateEmbedding(queryText)
      const results = await queryVectors(vector, { topK: 5, minScore: 0.5 })
      const time = performance.now() - start
      setQueryTime(time)
      setQueryResults(
        results.map((r) => ({
          id: r.id,
          score: r.score,
          content: r.metadata.content,
          category: r.metadata.category,
        }))
      )
    } catch (err) {
      console.error('[MemoryDebug] 查询失败:', err)
    }
  }, [queryText])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await removeVector(id)
      setQueryResults((prev) => prev.filter((r) => r.id !== id))
      const s = await getStoreStats()
      setStats(s)
    } catch (err) {
      console.error('[MemoryDebug] 删除失败:', err)
    }
  }, [])

  const handleLoadStats = useCallback(async () => {
    const s = await getStoreStats()
    setStats(s)
  }, [])

  const handleBatchSeed = useCallback(async () => {
    const seeds = [
      { content: '宁德时代 Q2 财报超预期，净利润增长 35%', category: 'stock' as MemoryCategory, importance: 4 as const },
      { content: '我比较激进，偏好高风险高回报的投资策略', category: 'preference' as MemoryCategory, importance: 5 as const },
      { content: '关注新能源板块，特别是锂电池和光伏', category: 'market' as MemoryCategory, importance: 3 as const },
      { content: '茅台股价突破 1800 元，创历史新高', category: 'stock' as MemoryCategory, importance: 4 as const },
      { content: '想学习量化交易策略，特别是均线突破策略', category: 'strategy' as MemoryCategory, importance: 2 as const },
    ]

    try {
      const vectors = await generateEmbeddings(seeds.map((s) => s.content))
      for (let i = 0; i < seeds.length; i++) {
        await addVector({
          id: `seed-${i}-${Date.now()}`,
          vector: vectors[i],
          metadata: {
            content: seeds[i].content,
            category: seeds[i].category,
            importance: seeds[i].importance,
            sourceSessionId: 'debug-session',
            createdAt: new Date().toISOString(),
            lastAccessedAt: new Date().toISOString(),
            accessCount: 0,
          },
        })
      }
      setAddResult(`已批量添加 ${seeds.length} 条记忆`)
      const s = await getStoreStats()
      setStats(s)
    } catch (err) {
      setAddResult(`批量添加错误: ${String(err)}`)
    }
  }, [])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 模型信息栏 */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Brain className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium text-text">Embedding 模型</span>
        <span className="rounded bg-green-500/20 px-2 py-0.5 text-xs text-green-400">云端 API</span>
        <span className="text-xs text-text-muted">维度: {getVectorDimension()}</span>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {/* Embedding 测试 */}
          <div className="rounded-lg border border-border bg-surface p-3">
            <h4 className="mb-2 text-xs font-semibold text-text">1. Embedding 生成测试</h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={embedText}
                onChange={(e) => setEmbedText(e.target.value)}
                className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs text-text focus:border-primary focus:outline-none"
              />
              <button
                onClick={handleEmbed}
                className="rounded bg-primary px-3 py-1 text-xs text-white hover:bg-primary-hover"
              >
                生成向量
              </button>
            </div>
            {embedResult && (
              <div className="mt-2 text-xs text-green-400">
                维度: {embedResult.dimension}, 耗时: {embedResult.time.toFixed(1)}ms,
                前5值: [{embedResult.preview.map((v) => v.toFixed(4)).join(', ')}, ...]
              </div>
            )}
            {embedError && (
              <div className="mt-2 flex items-center gap-1 text-xs text-red-400">
                <AlertCircle className="h-3 w-3" />
                {embedError}
              </div>
            )}
          </div>

          {/* 添加记忆 */}
          <div className="rounded-lg border border-border bg-surface p-3">
            <h4 className="mb-2 text-xs font-semibold text-text">2. 添加记忆到 Vectra</h4>
            <div className="space-y-2">
              <input
                type="text"
                value={memoryContent}
                onChange={(e) => setMemoryContent(e.target.value)}
                placeholder="记忆内容..."
                className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
              />
              <div className="flex gap-2">
                <select
                  value={memoryCategory}
                  onChange={(e) => setMemoryCategory(e.target.value as MemoryCategory)}
                  className="rounded border border-border bg-background px-2 py-1 text-xs text-text"
                >
                  <option value="stock">股票</option>
                  <option value="market">市场</option>
                  <option value="strategy">策略</option>
                  <option value="preference">偏好</option>
                  <option value="general">通用</option>
                </select>
                <select
                  value={memoryImportance}
                  onChange={(e) => setMemoryImportance(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
                  className="rounded border border-border bg-background px-2 py-1 text-xs text-text"
                >
                  <option value={1}>重要性 1</option>
                  <option value={2}>重要性 2</option>
                  <option value={3}>重要性 3</option>
                  <option value={4}>重要性 4</option>
                  <option value={5}>重要性 5</option>
                </select>
                <button
                  onClick={handleAddMemory}
                  className="flex items-center gap-1 rounded bg-primary px-3 py-1 text-xs text-white hover:bg-primary-hover"
                >
                  <Plus className="h-3 w-3" />
                  添加
                </button>
                <button
                  onClick={handleBatchSeed}
                  className="rounded border border-border px-3 py-1 text-xs text-text hover:bg-surface"
                >
                  批量种子
                </button>
              </div>
              {addResult && <div className="text-xs text-text-muted">{addResult}</div>}
            </div>
          </div>

          {/* 查询记忆 */}
          <div className="rounded-lg border border-border bg-surface p-3">
            <h4 className="mb-2 text-xs font-semibold text-text">3. 语义检索测试</h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs text-text focus:border-primary focus:outline-none"
              />
              <button
                onClick={handleQuery}
                className="flex items-center gap-1 rounded bg-primary px-3 py-1 text-xs text-white hover:bg-primary-hover"
              >
                <Search className="h-3 w-3" />
                检索
              </button>
            </div>
            {queryResults.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="text-xs text-text-muted">
                  找到 {queryResults.length} 条结果，耗时 {queryTime.toFixed(1)}ms
                </div>
                {queryResults.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded bg-background px-2 py-1.5 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-green-400">{(r.score * 100).toFixed(1)}%</span>
                      <span className="mx-1 text-text-muted">|</span>
                      <span className="text-text">{r.content}</span>
                      <span className="mx-1 text-text-muted">|</span>
                      <span className="text-text-muted">{r.category}</span>
                    </div>
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="ml-2 shrink-0 rounded p-1 text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {queryResults.length === 0 && queryTime > 0 && (
              <div className="mt-2 text-xs text-text-muted">未找到相似记忆</div>
            )}
          </div>

          {/* 索引统计 */}
          <div className="rounded-lg border border-border bg-surface p-3">
            <h4 className="mb-2 text-xs font-semibold text-text">4. 索引统计</h4>
            <div className="flex items-center gap-2">
              <button
                onClick={handleLoadStats}
                className="flex items-center gap-1 rounded border border-border px-3 py-1 text-xs text-text hover:bg-surface"
              >
                <Database className="h-3 w-3" />
                刷新
              </button>
              {stats && (
                <span className="text-xs text-text-muted">
                  条目数: {stats.itemCount} | 路径: {stats.path}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
