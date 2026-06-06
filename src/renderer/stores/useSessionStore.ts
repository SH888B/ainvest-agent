import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Session } from '@shared/types'
import { STORAGE_KEYS } from '@shared/constants'

/**
 * Session 状态管理
 * 负责 Session 的增删改查和当前 Session 切换
 */

interface SessionState {
  sessions: Session[]
  currentSessionId: string | null

  createSession: () => string
  switchSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  deleteSession: (id: string) => void
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
  }
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      sessions: [],
      currentSessionId: null,

      createSession: () => {
        const session = createDefaultSession()
        set((state) => ({
          sessions: [session, ...state.sessions],
          currentSessionId: session.id,
        }))
        return session.id
      },

      switchSession: (id: string) => {
        set({ currentSessionId: id })
      },

      renameSession: (id: string, title: string) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, title, updatedAt: new Date().toISOString() } : s
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
    }),
    {
      name: STORAGE_KEYS.SESSIONS,
    }
  )
)
