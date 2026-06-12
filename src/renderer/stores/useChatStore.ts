import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ChatMessage } from '@shared/types'

/**
 * 聊天状态管理
 * 按 Session ID 存储消息列表，支持持久化
 * v6: debounce 从 800ms 缩短到 100ms，减少消息丢失风险
 */

interface ChatState {
  messagesBySession: Record<string, ChatMessage[]>
  isLoading: boolean

  getMessages: (sessionId: string) => ChatMessage[]
  addMessage: (sessionId: string, message: ChatMessage) => void
  appendAssistantContent: (sessionId: string, content: string) => void
  /** v6.1.1: 设置最新 assistant 消息的来源信息 */
  setAssistantSource: (sessionId: string, sourceUrl: string, sourceTitle: string) => void
  clearMessages: (sessionId: string) => void
  setLoading: (loading: boolean) => void
}

/**
 * 创建带防抖的 localStorage storage
 * v6: debounce 缩短到 100ms，在减少写入频率和防止消息丢失之间取得平衡
 * 同时支持 flushStorage 事件立即写入，保证 beforeunload 时数据不丢失
 */
const createDebouncedStorage = (delay = 100) => {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingName: string | null = null
  let pendingValue: unknown = null

  const flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (pendingName !== null) {
      localStorage.setItem(pendingName, JSON.stringify(pendingValue))
      pendingName = null
      pendingValue = null
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('flushStorage', flush)
    window.addEventListener('beforeunload', flush)
  }

  return {
    getItem: (name: string) => {
      const str = localStorage.getItem(name)
      if (!str) return null
      try {
        return JSON.parse(str)
      } catch {
        return null
      }
    },
    setItem: (name: string, value: unknown) => {
      if (timer) clearTimeout(timer)
      pendingName = name
      pendingValue = value
      timer = setTimeout(() => {
        localStorage.setItem(name, JSON.stringify(value))
        pendingName = null
        pendingValue = null
        timer = null
      }, delay)
    },
    removeItem: (name: string) => localStorage.removeItem(name),
  }
}

/** 立即 flush 当前存储（会触发 beforeunload 中的同步写入） */
export const flushChatStorage = (): void => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('flushStorage'))
  }
}

const chatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messagesBySession: {},
      isLoading: false,

      getMessages: (sessionId: string) => {
        return get().messagesBySession[sessionId] || []
      },

      addMessage: (sessionId: string, message: ChatMessage) => {
        set((state) => ({
          messagesBySession: {
            ...state.messagesBySession,
            [sessionId]: [...(state.messagesBySession[sessionId] || []), message],
          },
        }))
      },

      appendAssistantContent: (sessionId: string, content: string) => {
        set((state) => {
          const msgs = state.messagesBySession[sessionId] || []
          const last = msgs[msgs.length - 1]
          if (last && last.role === 'assistant') {
            const updated = [...msgs]
            updated[updated.length - 1] = { ...last, content: last.content + content }
            return {
              messagesBySession: {
                ...state.messagesBySession,
                [sessionId]: updated,
              },
            }
          }
          return {
            messagesBySession: {
              ...state.messagesBySession,
              [sessionId]: [...msgs, { role: 'assistant', content }],
            },
          }
        })
      },

      setAssistantSource: (sessionId: string, sourceUrl: string, sourceTitle: string) => {
        set((state) => {
          const msgs = state.messagesBySession[sessionId] || []
          const last = msgs[msgs.length - 1]
          if (last && last.role === 'assistant') {
            const updated = [...msgs]
            updated[updated.length - 1] = { ...last, sourceUrl, sourceTitle }
            return {
              messagesBySession: {
                ...state.messagesBySession,
                [sessionId]: updated,
              },
            }
          }
          return state
        })
      },

      clearMessages: (sessionId: string) => {
        set((state) => {
          const next = { ...state.messagesBySession }
          delete next[sessionId]
          return { messagesBySession: next }
        })
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading })
      },
    }),
    {
      name: 'ainvest-chat-messages',
      storage: createDebouncedStorage(100) as any,
      partialize: (state) => ({
        messagesBySession: state.messagesBySession,
      }),
    }
  )
)

export const useChatStore = chatStore
