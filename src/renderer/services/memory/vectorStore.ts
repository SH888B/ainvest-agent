import { logInfo, logError } from '../logger/logger'
import type { VectorRecord, VectorQueryResult, VectorQueryOptions } from '../../../shared/types/memory'

/**
 * 向量存储服务（渲染进程 IPC 代理）
 * v5.1.1: Vectra 已迁移到主进程，本文件仅为 IPC 调用封装
 */

/**
 * 添加向量记录
 */
export const addVector = async (record: VectorRecord): Promise<void> => {
  try {
    await window.memoryAPI.insertItem(record)
    logInfo('memory', 'vectorStore.added', {
      id: record.id,
      category: record.metadata.category,
    })
  } catch (err) {
    logError('memory', 'vectorStore.addError', {
      id: record.id,
      error: String(err),
    })
    throw err
  }
}

/**
 * 批量添加向量记录
 */
export const addVectors = async (records: VectorRecord[]): Promise<void> => {
  try {
    await window.memoryAPI.insertItems(records)
    logInfo('memory', 'vectorStore.batchAdded', { count: records.length })
  } catch (err) {
    logError('memory', 'vectorStore.batchAddError', { error: String(err) })
    throw err
  }
}

/**
 * 向量相似度检索
 * @param vector 查询向量
 * @param options 查询选项
 * @returns 相似度降序排列的结果
 */
export const queryVectors = async (
  vector: number[],
  options: VectorQueryOptions = {}
): Promise<VectorQueryResult[]> => {
  const { topK = 5, minScore = 0.7 } = options

  const results = await window.memoryAPI.queryItems(vector, topK)

  const filtered: VectorQueryResult[] = (results as Array<{
    item: { id: string; metadata: Record<string, unknown> }
    score: number
  }>)
    .filter((result) => result.score >= minScore)
    .map((result) => ({
      id: result.item.id,
      score: result.score,
      metadata: result.item.metadata as VectorRecord['metadata'],
    }))

  logInfo('memory', 'vectorStore.queried', {
    topK,
    minScore,
    returned: filtered.length,
  })

  return filtered
}

/**
 * 删除向量记录
 */
export const removeVector = async (id: string): Promise<void> => {
  await window.memoryAPI.deleteItem(id)
  logInfo('memory', 'vectorStore.removed', { id })
}

/**
 * 获取存储统计
 */
export const getStoreStats = async (): Promise<{
  itemCount: number
  path: string
}> => {
  return await window.memoryAPI.getStats()
}

/**
 * 列出所有向量记录
 */
export const listAllItems = async (): Promise<VectorRecord[]> => {
  return await window.memoryAPI.listItems() as VectorRecord[]
}

/**
 * 根据 ID 查询单条记录（供合并逻辑使用）
 */
export const getVectorItem = async (id: string): Promise<{
  id: string
  vector: number[]
  metadata: Record<string, unknown>
} | null> => {
  return await window.memoryAPI.getItem(id) as {
    id: string
    vector: number[]
    metadata: Record<string, unknown>
  } | null
}

/**
 * 更新或插入记录（供合并逻辑使用）
 */
export const upsertVector = async (
  id: string,
  vector: number[],
  metadata: VectorRecord['metadata']
): Promise<void> => {
  await window.memoryAPI.upsertItem(id, vector, metadata)
}
