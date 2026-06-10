/**
 * 语义记忆系统类型定义
 */

/** 记忆片段分类 */
export type MemoryCategory = 'stock' | 'market' | 'strategy' | 'preference' | 'general'

/** 记忆片段 */
export interface MemoryFragment {
  id: string
  content: string
  category: MemoryCategory
  importance: 1 | 2 | 3 | 4 | 5
  sourceSessionId: string
  createdAt: string
  lastAccessedAt: string
  accessCount: number
}

/** 向量存储条目 */
export interface VectorRecord {
  id: string
  vector: number[]
  metadata: Omit<MemoryFragment, 'id'>
}

/** 向量查询结果 */
export interface VectorQueryResult {
  id: string
  score: number
  metadata: Omit<MemoryFragment, 'id'>
}

/** 向量查询选项 */
export interface VectorQueryOptions {
  topK?: number
  minScore?: number
}

/** Session 归档状态 */
export interface SessionArchiveState {
  sessionId: string
  archivedMessageCount: number
  lastArchivedAt: string
}
