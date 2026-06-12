import React, { useEffect, useRef } from 'react'
import { useChatStore } from '../../stores/useChatStore'
import { useSessionStore } from '../../stores/useSessionStore'
import { MessageItem } from './MessageItem'
import { ChatMessage } from '@shared/types'
import { Bot } from 'lucide-react'

/** 缓存空数组，避免 zustand selector 每次返回新引用导致无限 re-render */
const EMPTY_MESSAGES: ChatMessage[] = []

/**
 * 消息列表
 * 展示当前 Session 的所有消息
 * v6: 修复 useMemo + getMessages 导致的订阅失效问题，改为 zustand 直接选择器
 */
export const MessageList: React.FC = () => {
  const { currentSessionId } = useSessionStore()
  const { isLoading } = useChatStore()
  // 直接订阅 messagesBySession，确保消息变化时组件 re-render
  // 注意：用 ?? 而非 || ，因为 || 会每次创建新 [] 引用导致无限 re-render
  const messages = useChatStore((state) =>
    currentSessionId ? state.messagesBySession[currentSessionId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES
  )
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  if (!currentSessionId) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted">
        <div className="text-center">
          <Bot className="mx-auto mb-3 h-12 w-12 opacity-30" />
          <p>请选择一个 Session 或新建对话</p>
        </div>
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted">
        <div className="text-center">
          <Bot className="mx-auto mb-3 h-12 w-12 opacity-30" />
          <p>开始你的第一条消息</p>
          <p className="mt-1 text-xs">试试问：茅台今天多少钱？</p>
        </div>
      </div>
    )
  }

  const lastIndex = messages.length - 1

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto p-4">
      <div className="space-y-4">
        {messages.map((msg, index) => (
          <MessageItem
            key={index}
            message={msg}
            isStreaming={
              isLoading && index === lastIndex && msg.role === 'assistant'
            }
          />
        ))}
      </div>
    </div>
  )
}
