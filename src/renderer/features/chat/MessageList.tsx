import React, { useEffect, useRef, useMemo } from 'react'
import { useChatStore } from '../../stores/useChatStore'
import { useSessionStore } from '../../stores/useSessionStore'
import { MessageItem } from './MessageItem'
import { Bot } from 'lucide-react'

/**
 * 消息列表
 * 展示当前 Session 的所有消息
 */
export const MessageList: React.FC = () => {
  const { currentSessionId } = useSessionStore()
  const { getMessages, isLoading } = useChatStore()
  const messages = useMemo(
    () => (currentSessionId ? getMessages(currentSessionId) : []),
    [currentSessionId, getMessages]
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
