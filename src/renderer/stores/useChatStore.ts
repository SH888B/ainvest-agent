import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ChatMessage } from '@shared/types'

/**
 * 聊天状态管理
 * 按 Session ID 存储消息列表，支持持久化
 * v5.1: 使用 debounced storage 避免流式输出时高频写入 localStorage 导致卡顿
 */

interface ChatState {
  messagesBySession: Record<string, ChatMessage[]>
  isLoading: boolean

  getMessages: (sessionId: string) => ChatMessage[]
  addMessage: (sessionId: string, message: ChatMessage) => void
  appendAssistantContent: (sessionId: string, content: string) => void
  clearMessages: (sessionId: string) => void
  setLoading: (loading: boolean) => void
}

/**
 * 创建带防抖的 localStorage storage
 * 避免流式输出时每秒几十次 setState 触发同步 localStorage 写入阻塞主线程
 */
const createDebouncedStorage = (delay = 800) => {
  let timer: ReturnType<typeof setTimeout> | null = null
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
      timer = setTimeout(() => {
        localStorage.setItem(name, JSON.stringify(value))
      }, delay)
    },
    removeItem: (name: string) => localStorage.removeItem(name),
  }
}

export const useChatStore = create<ChatState>()(
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
      storage: createDebouncedStorage(800) as any,
      partialize: (state) => ({
        messagesBySession: state.messagesBySession,
      }),
    }
  )
)
