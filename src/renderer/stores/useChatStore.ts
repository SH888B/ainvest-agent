import { create } from 'zustand'
import { ChatMessage } from '@shared/types'

/**
 * 聊天状态管理
 * 按 Session ID 存储消息列表
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

export const useChatStore = create<ChatState>((set, get) => ({
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
}))
