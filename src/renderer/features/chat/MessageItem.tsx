import React from 'react'
import { ChatMessage } from '@shared/types'
import { User, Bot, Wrench, ExternalLink } from 'lucide-react'
import { ThinkingBlock } from './ThinkingBlock'
import { MarkdownRenderer } from './components/MarkdownRenderer'

interface MessageItemProps {
  message: ChatMessage
  isStreaming?: boolean
}

/**
 * 单条消息组件
 * 支持用户消息、Agent 消息（Markdown 渲染 / 流式纯文本）、工具卡片、Thinking 块
 */
export const MessageItem: React.FC<MessageItemProps> = ({ message, isStreaming }) => {
  const isUser = message.role === 'user'
  const isTool = message.role === 'tool'
  const isAssistant = message.role === 'assistant'

  if (isTool) {
    return (
      <div className="flex justify-center">
        <div className="flex max-w-[80%] items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-xs text-text-muted">
          <Wrench className="h-3 w-3" />
          <span>工具结果</span>
          <span className="truncate">{message.content.slice(0, 60)}...</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* 头像 */}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser ? 'bg-primary' : 'border border-border bg-surface'
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4 text-white" />
        ) : (
          <Bot className="h-4 w-4 text-text-muted" />
        )}
      </div>

      {/* 消息区：Thinking 块 + 内容气泡 */}
      <div className="max-w-[80%]">
        {/* Thinking 块（仅 Agent 消息） */}
        {isAssistant && message.turnId && (
          <ThinkingBlock turnId={message.turnId} />
        )}

        {/* 内容气泡 */}
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed select-text ${
            isUser
              ? 'bg-primary text-white'
              : 'bg-surface/80 backdrop-blur-sm border border-border-subtle text-text'
          }`}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap select-text">{message.content}</div>
          ) : isStreaming ? (
            <span className="whitespace-pre-wrap">{message.content}</span>
          ) : (
            <MarkdownRenderer content={message.content} />
          )}

          {/* 工具调用展示 */}
          {isAssistant && message.tool_calls && message.tool_calls.length > 0 && (
            <div className="mt-2 space-y-1">
              {message.tool_calls.map((tc) => (
                <div
                  key={tc.id}
                  className="flex items-center gap-2 rounded border border-border bg-background px-2 py-1 text-xs text-text-muted"
                >
                  <Wrench className="h-3 w-3" />
                  <span className="font-medium">{tc.function.name}</span>
                  <span className="truncate">{tc.function.arguments}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 来源链接（web.browse 工具结果） */}
        {isAssistant && message.sourceUrl && !isStreaming && (
          <button
            onClick={() => window.browser.openExternal(message.sourceUrl!)}
            className="mt-1 flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] text-text-muted hover:text-primary hover:bg-surface/50 transition-colors"
          >
            <ExternalLink className="h-2.5 w-2.5" />
            <span className="truncate max-w-[200px]">{message.sourceTitle || message.sourceUrl}</span>
          </button>
        )}
      </div>
    </div>
  )
}
