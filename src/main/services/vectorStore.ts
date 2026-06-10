import { app } from 'electron'
import path from 'path'
import { LocalIndex } from 'vectra'
import type { VectorRecord } from '../../shared/types/memory'

/**
 * 主进程向量存储服务
 * 直接使用 Node.js fs + Vectra，无渲染进程兼容性问题
 */

const INDEX_PATH = 'vector-memory'
let index: LocalIndex | null = null

/**
 * 互斥锁：防止并发更新导致索引损坏
 */
class Mutex {
  private locked = false
  private queue: Array<() => void> = []

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true
      return
    }
    return new Promise((resolve) => {
      this.queue.push(resolve)
    })
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()
      next?.()
    } else {
      this.locked = false
    }
  }
}

const indexMutex = new Mutex()

const getUserDataPath = (): string => {
  return path.join(app.getPath('userData'), 'ainvest')
}

/**
 * 获取或初始化向量索引
 */
const getIndex = async (): Promise<LocalIndex> => {
  if (index) {
    return index
  }

  const indexPath = path.join(getUserDataPath(), INDEX_PATH)
  index = new LocalIndex(indexPath)

  const exists = await index.isIndexCreated()
  if (!exists) {
    await index.createIndex({ version: 1 })
  }

  return index
}

/**
 * 插入单条向量记录
 */
export const insertItem = async (record: VectorRecord): Promise<void> => {
  await indexMutex.acquire()
  try {
    const idx = await getIndex()
    await idx.beginUpdate()
    await idx.insertItem({
      id: record.id,
      vector: record.vector,
      metadata: record.metadata,
    })
    await idx.endUpdate()
  } finally {
    indexMutex.release()
  }
}

/**
 * 批量插入向量记录
 */
export const insertItems = async (records: VectorRecord[]): Promise<void> => {
  await indexMutex.acquire()
  try {
    const idx = await getIndex()
    await idx.beginUpdate()
    for (const record of records) {
      await idx.insertItem({
        id: record.id,
        vector: record.vector,
        metadata: record.metadata,
      })
    }
    await idx.endUpdate()
  } finally {
    indexMutex.release()
  }
}

/**
 * 向量相似度检索
 * @returns Vectra 原始结果（含 score），由调用方过滤 minScore
 */
export const queryItems = async (
  vector: number[],
  topK: number
): Promise<Array<{ item: { id: string; vector: number[]; metadata: Record<string, unknown> }; score: number }>> => {
  const idx = await getIndex()
  const results = await idx.queryItems(vector, '', topK)
  return results.map((r) => ({
    item: {
      id: r.item.id,
      vector: r.item.vector,
      metadata: r.item.metadata as Record<string, unknown>,
    },
    score: r.score,
  }))
}

/**
 * 删除向量记录
 */
export const deleteItem = async (id: string): Promise<void> => {
  await indexMutex.acquire()
  try {
    const idx = await getIndex()
    await idx.deleteItem(id)
  } finally {
    indexMutex.release()
  }
}

/**
 * 获取索引统计
 */
export const getStats = async (): Promise<{ itemCount: number; path: string }> => {
  const idx = await getIndex()
  const stats = await idx.getIndexStats()
  return {
    itemCount: stats.items,
    path: idx.folderPath,
  }
}

/**
 * 列出所有向量记录
 */
export const listItems = async (): Promise<VectorRecord[]> => {
  const idx = await getIndex()
  const items = await idx.listItems()
  return items.map((item) => ({
    id: item.id,
    vector: item.vector,
    metadata: item.metadata as VectorRecord['metadata'],
  }))
}

/**
 * 根据 ID 查询单条记录
 */
export const getItem = async (id: string): Promise<{ id: string; vector: number[]; metadata: Record<string, unknown> } | null> => {
  const idx = await getIndex()
  try {
    const item = await idx.getItem(id)
    if (!item) return null
    return {
      id: item.id,
      vector: item.vector,
      metadata: item.metadata as Record<string, unknown>,
    }
  } catch {
    return null
  }
}

/**
 * 更新或插入记录（upsert）
 * 内部封装 beginUpdate/endUpdate
 */
export const upsertItem = async (
  id: string,
  vector: number[],
  metadata: Record<string, unknown>
): Promise<void> => {
  await indexMutex.acquire()
  try {
    const idx = await getIndex()
    await idx.beginUpdate()
    await idx.upsertItem({ id, vector, metadata })
    await idx.endUpdate()
  } finally {
    indexMutex.release()
  }
}
