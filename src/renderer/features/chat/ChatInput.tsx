import React, { useCallback, useRef } from 'react'
import { QuickTools } from './QuickTools'
import { QuickTool } from '@shared/constants/quickTools'
import { Send } from 'lucide-react'

interface ChatInputProps {
  onSend: () => void
  input: string
  setInput: (value: string) => void
  inputRef?: React.RefObject<HTMLTextAreaElement>
}

/**
 * 聊天输入框
 * 仅负责输入收集和触发发送，发送逻辑由父组件管理
 */
export const ChatInput: React.FC<ChatInputProps> = ({ onSend, input, setInput, inputRef: externalRef }) => {
  const internalRef = useRef<HTMLTextAreaElement>(null)
  const textareaRef = externalRef || internalRef

  const handleQuickToolSelect = useCallback((tool: QuickTool) => {
    setInput(tool.template)
    // 定位到第一个占位符
    const firstPlaceholder = tool.template.match(/\[.*?\]/)?.[0]
    if (firstPlaceholder && textareaRef.current) {
      const start = tool.template.indexOf(firstPlaceholder)
      const end = start + firstPlaceholder.length
      requestAnimationFrame(() => {
        textareaRef.current?.focus()
        textareaRef.current?.setSelectionRange(start, end)
      })
    }
  }, [setInput])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  return (
    <div>
      <QuickTools onSelect={handleQuickToolSelect} />
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息，Shift+Enter 换行..."
          rows={2}
          className="flex-1 resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
        />
        <button
          onClick={onSend}
          disabled={!input.trim()}
          className="flex shrink-0 items-center self-end rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-hover disabled:opacity-50 disabled:hover:bg-primary"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
