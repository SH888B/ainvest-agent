import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Session } from '@shared/types'
import { STORAGE_KEYS } from '@shared/constants'
import { logInfo, logError } from '../services/logger/logger'

/**
 * Session 状态管理
 * 负责 Session 的增删改查和当前 Session 切换
 * v5: 增加归档状态 tracking
 */

/**
 * 根据第一条消息生成 Session 名称
 * 按字符（Unicode code point）截取前 10 个字符
 */
export const generateSessionName = (firstMessage: string): string => {
  const trimmed = firstMessage.trim().replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, '')
  if (!trimmed) return '新对话'
  const chars = Array.from(trimmed)
  const maxLen = 10
  if (chars.length <= maxLen) return trimmed
  return chars.slice(0, maxLen).join('') + '...'
}

interface SessionState {
  sessions: Session[]
  currentSessionId: string | null
  /** v6: 创建中的防竞态标记（由 createSession 内部管理） */
  isCreating: boolean

  createSession: () => string | null
  switchSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  autoRenameSession: (id: string, title: string) => void
  deleteSession: (id: string) => void
  updateArchivedCount: (id: string, count: number) => void
}

const generateId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

const createDefaultSession = (): Session => {
  const now = new Date().toISOString()
  return {
    id: generateId(),
    title: '新对话',
    createdAt: now,
    updatedAt: now,
    archivedMessageCount: 0,
  }
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, _get) => ({
      sessions: [],
      currentSessionId: null,
      isCreating: false,

      createSession: () => {
        const { isCreating } = _get()
        if (isCreating) return null // v6: 防止重复创建
        set({ isCreating: true })
        const session = createDefaultSession()
        set((state) => ({
          sessions: [session, ...state.sessions],
          currentSessionId: session.id,
          isCreating: false,
        }))
        return session.id
      },

      switchSession: (id: string) => {
        set({ currentSessionId: id })
      },

      renameSession: (id: string, title: string) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id
              ? { ...s, title, updatedAt: new Date().toISOString(), isCustomNamed: true }
              : s
          ),
        }))
      },

      autoRenameSession: (id: string, title: string) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id && !s.isCustomNamed && s.title === '新对话'
              ? { ...s, title, updatedAt: new Date().toISOString() }
              : s
          ),
        }))
      },

      deleteSession: (id: string) => {
        set((state) => {
          const filtered = state.sessions.filter((s) => s.id !== id)
          const nextId =
            state.currentSessionId === id
              ? filtered.length > 0
                ? filtered[0].id
                : null
              : state.currentSessionId
          return { sessions: filtered, currentSessionId: nextId }
        })
      },

      updateArchivedCount: (id: string, count: number) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, archivedMessageCount: count } : s
          ),
        }))
        logInfo('memory', 'archive.countUpdated', { sessionId: id, archivedCount: count })
      },
    }),
    {
      name: STORAGE_KEYS.SESSIONS,
      // v6: 启动时重置 currentSessionId，不自动恢复到上次的 Session
      // 用户看到空白引导页，需手动选择或新建 Session
      onRehydrateStorage: () => {
        return (state) => {
          if (state) {
            state.currentSessionId = null
          }
        }
      },
    }
  )
)

/**
 * 自动归档上一个 Session（在创建新 Session 前调用）
 * 这是一个独立工具函数，不在 store 内部（避免 circular dependency）
 */
export const autoArchivePreviousSession = async (
  previousSessionId: string | null,
  getMessages: (sessionId: string) => { role: 'system' | 'user' | 'assistant' | 'tool'; content: string }[],
  getArchivedCount: (sessionId: string) => number | undefined,
  llmConfig: { apiKey: string; baseUrl: string; model: string; temperature: number } | null,
  updateArchivedCount: (id: string, count: number) => void
): Promise<void> => {
  if (!previousSessionId || !llmConfig) return

  const messages = getMessages(previousSessionId)
  const archivedCount = getArchivedCount(previousSessionId) || 0

  if (messages.length <= archivedCount) return

  try {
    // 动态导入以避免初始化时加载 heavy modules
    const { archiveSession } = await import('./../services/memory/memoryArchive')
    const result = await archiveSession({
      sessionId: previousSessionId,
      messages,
      archivedMessageCount: archivedCount,
      llmConfig,
    })

    updateArchivedCount(previousSessionId, messages.length)

    logInfo('memory', 'autoArchive.done', {
      sessionId: previousSessionId,
      newFragments: result.newFragments,
      vectorRecords: result.vectorRecords,
    })
  } catch (err) {
    logError('memory', 'autoArchive.error', {
      sessionId: previousSessionId,
      error: String(err),
    })
  }
}
