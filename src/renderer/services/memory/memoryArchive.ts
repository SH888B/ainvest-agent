import { ChatMessage, LLMConfig, UserMemory } from '@shared/types'
import { MemoryFragment, VectorRecord } from '../../../shared/types/memory'
import { extractMemoryFragments } from '../agent/memoryExtractor'
import { generateEmbedding, generateEmbeddings } from './embeddingService'
import { addVector, queryVectors, removeVector, listAllItems, getVectorItem, upsertVector } from './vectorStore'
import { logInfo, logError, logWarn } from '../logger/logger'

/**
 * 记忆归档服务
 * 负责 Session 结束时的自动归档：
 * - 增量归档：只归档未归档的消息
 * - 双轨提取：显式偏好 → memory.json，向量记忆 → Vectra
 * - 去重逻辑：similarity > 0.95 跳过，0.8-0.95 合并
 */

interface ArchiveOptions {
  sessionId: string
  messages: ChatMessage[]
  archivedMessageCount: number
  llmConfig: LLMConfig
}

interface ArchiveResult {
  newFragments: number
  preferenceUpdates: number
  vectorRecords: number
  skippedDuplicates: number
  mergedSimilar: number
  preferenceUpdate: Partial<UserMemory>
}

/**
 * 归档一个 Session 的对话
 * 只处理 archivedMessageCount 之后的新消息
 */
export const archiveSession = async (
  options: ArchiveOptions
): Promise<ArchiveResult> => {
  const { sessionId, messages, archivedMessageCount, llmConfig } = options

  // 只取未归档的消息
  const newMessages = messages.slice(archivedMessageCount)
  if (newMessages.length === 0) {
    logInfo('memory', 'archive.skip', { sessionId, reason: 'noNewMessages' })
    return { newFragments: 0, preferenceUpdates: 0, vectorRecords: 0, skippedDuplicates: 0, mergedSimilar: 0, preferenceUpdate: {} }
  }

  logInfo('memory', 'archive.start', {
    sessionId,
    totalMessages: messages.length,
    newMessages: newMessages.length,
    archivedBefore: archivedMessageCount,
  })

  // 第一步：LLM 提取记忆片段
  const fragments = await extractMemoryFragments(newMessages, llmConfig)
  if (fragments.length === 0) {
    logInfo('memory', 'archive.noFragments', { sessionId })
    return { newFragments: 0, preferenceUpdates: 0, vectorRecords: 0, skippedDuplicates: 0, mergedSimilar: 0, preferenceUpdate: {} }
  }

  // 填充 sourceSessionId
  fragments.forEach((f) => {
    f.sourceSessionId = sessionId
  })

  // 第二步：双轨处理
  const result: ArchiveResult = {
    newFragments: fragments.length,
    preferenceUpdates: 0,
    vectorRecords: 0,
    skippedDuplicates: 0,
    mergedSimilar: 0,
    preferenceUpdate: {},
  }

  // 2a. 显式偏好提取
  const preferenceFragments = fragments.filter((f) => f.category === 'preference')
  if (preferenceFragments.length > 0) {
    result.preferenceUpdates = preferenceFragments.length
    result.preferenceUpdate = fragmentsToUserMemory(preferenceFragments)
  }

  // 2b. 向量记忆归档（批量生成向量后逐条处理去重）
  try {
    // 批量生成所有片段的向量（1 次或少量 API 调用）
    const contents = fragments.map((f) => f.content)
    const vectors = await generateEmbeddings(contents)

    for (let i = 0; i < fragments.length; i++) {
      const fragment = fragments[i]
      const vector = vectors[i]

      // 去重检查：查询相似内容
      const similar = await queryVectors(vector, { topK: 3, minScore: 0.8 })

      let shouldSkip = false
      let shouldMerge = false
      let mergeTargetId: string | null = null

      for (const sim of similar) {
        if (sim.score >= 0.95) {
          shouldSkip = true
          break
        }
        if (sim.score >= 0.8 && sim.score < 0.95) {
          shouldMerge = true
          mergeTargetId = sim.id
          break
        }
      }

      if (shouldSkip) {
        result.skippedDuplicates++
        logInfo('memory', 'archive.skipDuplicate', { sessionId, content: fragment.content.slice(0, 50) })
        continue
      }

      // 准备新记录
      const newRecord: VectorRecord = {
        id: fragment.id,
        vector,
        metadata: {
          content: fragment.content,
          category: fragment.category,
          importance: fragment.importance,
          sourceSessionId: fragment.sourceSessionId,
          createdAt: fragment.createdAt,
          lastAccessedAt: fragment.lastAccessedAt,
          accessCount: fragment.accessCount,
        },
      }

      if (shouldMerge && mergeTargetId) {
        // 合并：通过 IPC 获取旧记录并 upsert
        try {
          const oldItem = await getVectorItem(mergeTargetId)

          // 合并元数据：保留最早的创建时间，累加访问计数
          const oldMeta = oldItem?.metadata as VectorRecord['metadata'] | undefined
          const mergedMetadata: VectorRecord['metadata'] = {
            ...newRecord.metadata,
            createdAt: oldMeta?.createdAt || newRecord.metadata.createdAt,
            accessCount: (oldMeta?.accessCount || 0) + 1,
            // 取较高的重要性
            importance: Math.max(
              oldMeta?.importance || 1,
              newRecord.metadata.importance
            ) as 1 | 2 | 3 | 4 | 5,
          }

          await upsertVector(mergeTargetId, newRecord.vector, mergedMetadata)

          result.mergedSimilar++
          logInfo('memory', 'archive.merge', {
            sessionId,
            oldId: mergeTargetId,
            preservedCreatedAt: mergedMetadata.createdAt !== newRecord.metadata.createdAt,
          })
          result.vectorRecords++
        } catch (err) {
          logError('memory', 'archive.mergeFailed', { sessionId, oldId: mergeTargetId, error: String(err) })
          // 回退到直接添加新记录
          await addVector(newRecord)
          result.vectorRecords++
        }
      } else {
        // 直接写入新记录
        await addVector(newRecord)
        result.vectorRecords++
      }
    }
  } catch (err) {
    // 向量存储操作失败时跳过向量归档，偏好提取仍可用
    logWarn('memory', 'archive.vectorStoreUnavailable', {
      sessionId,
      error: String(err),
    })
  }

  logInfo('memory', 'archive.complete', {
    sessionId,
    newFragments: result.newFragments,
    preferenceUpdates: result.preferenceUpdates,
    vectorRecords: result.vectorRecords,
    skippedDuplicates: result.skippedDuplicates,
    mergedSimilar: result.mergedSimilar,
  })

  return result
}

/**
 * 将 preference 类型的记忆片段转换为 UserMemory 更新对象
 * 供 useMemoryStore.updateMemory 使用
 */
export const fragmentsToUserMemory = (fragments: MemoryFragment[]): Partial<UserMemory> => {
  const update: Partial<UserMemory> = {}

  // 收集所有 preference 内容
  const preferenceContents = fragments
    .filter((f) => f.category === 'preference')
    .map((f) => f.content)
    .join('\n')

  // 收集所有片段内容（用于板块等跨类别关键词提取）
  const allContents = fragments
    .map((f) => f.content)
    .join('\n')

  if (preferenceContents.length > 0) {
    // 简单启发式提取风险偏好（仅从 preference 类别提取）
    const riskKeywords: Record<string, UserMemory['riskPreference']> = {
      保守: '保守',
      稳健: '稳健',
      激进: '激进',
    }
    for (const [keyword, risk] of Object.entries(riskKeywords)) {
      if (preferenceContents.includes(keyword)) {
        update.riskPreference = risk
        break
      }
    }

    // 更新摘要（取最重要的一条 preference）
    const topPreference = fragments
      .filter((f) => f.category === 'preference')
      .sort((a, b) => b.importance - a.importance)[0]
    if (topPreference) {
      update.summary = topPreference.content.slice(0, 100)
    }
  }

  // 启发式提取关注板块（从所有片段中提取，因为板块可能出现在 market/stock 类别）
  const sectorKeywords = ['新能源', '白酒', '医药', '半导体', '人工智能', '光伏', '锂电池', '银行', '保险', '券商']
  const foundSectors = sectorKeywords.filter((s) => allContents.includes(s))
  if (foundSectors.length > 0) {
    update.focusSectors = foundSectors
  }

  return update
}

/**
 * 语义检索记忆
 * @param query 查询文本
 * @param options 查询选项
 */
export const searchMemories = async (
  query: string,
  options: { topK?: number; minScore?: number } = {}
): Promise<MemoryFragment[]> => {
  const { topK = 5, minScore = 0.7 } = options

  try {
    const vector = await generateEmbedding(query)
    const results = await queryVectors(vector, { topK, minScore })

    return results.map((r) => ({
      id: r.id,
      content: r.metadata.content,
      category: r.metadata.category,
      importance: r.metadata.importance,
      sourceSessionId: r.metadata.sourceSessionId,
      createdAt: r.metadata.createdAt,
      lastAccessedAt: new Date().toISOString(),
      accessCount: (r.metadata.accessCount || 0) + 1,
    }))
  } catch (err) {
    logWarn('memory', 'search.failed', { error: String(err), query })
    return []
  }
}

/**
 * 删除单条记忆（从 Vectra 中移除）
 * @param id 记忆 ID
 */
export const deleteMemory = async (id: string): Promise<void> => {
  try {
    await removeVector(id)
    logInfo('memory', 'memory.deleted', { id })
  } catch (err) {
    logError('memory', 'memory.deleteError', { id, error: String(err) })
    throw err
  }
}

/**
 * 清理过期记忆
 * 过期策略：
 * - importance <= 2：30 天未访问删除
 * - importance = 3：90 天未访问删除
 * - importance >= 4：永久保留
 * @returns 删除的记忆数量
 */
export const cleanupExpired = async (): Promise<number> => {
  try {
    const items = await listAllItems()
    const now = Date.now()
    const DAY = 24 * 60 * 60 * 1000

    const toDelete: string[] = []

    for (const item of items) {
      const importance = item.metadata.importance
      const lastAccess = new Date(item.metadata.lastAccessedAt).getTime()
      const age = now - lastAccess

      if (importance <= 2 && age > 30 * DAY) {
        toDelete.push(item.id)
      } else if (importance === 3 && age > 90 * DAY) {
        toDelete.push(item.id)
      }
    }

    for (const id of toDelete) {
      try {
        await removeVector(id)
      } catch {
        // 忽略单个删除失败
      }
    }

    logInfo('memory', 'cleanup.complete', { deleted: toDelete.length, total: items.length })
    return toDelete.length
  } catch (err) {
    logError('memory', 'cleanup.error', { error: String(err) })
    return 0
  }
}
