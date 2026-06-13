import React, { useCallback, useRef } from 'react'
import { QuickTools } from './QuickTools'
import { QuickTool } from '@shared/constants/quickTools'
import { Send } from 'lucide-react'
import { usePreferenceStore } from '../../stores/usePreferenceStore'

interface ChatInputProps {
  onSend: () => void
  input: string
  setInput: (value: string) => void
  inputRef?: React.RefObject<HTMLTextAreaElement>
}

/**
 * 聊天输入框
 * 仅负责输入收集和触发发送，发送逻辑由父组件管理
 * v6.1: 新增浏览器模式切换 Toggle（发送按钮上方）
 */
export const ChatInput: React.FC<ChatInputProps> = ({ onSend, input, setInput, inputRef: externalRef }) => {
  const internalRef = useRef<HTMLTextAreaElement>(null)
  const textareaRef = externalRef || internalRef
  const { browserMode, setBrowserMode } = usePreferenceStore()

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
  }, [setInput, textareaRef])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  const isAgentMode = browserMode === 'agent'

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
        <div className="flex shrink-0 flex-col items-center gap-1 self-end">
          {/* 浏览器模式切换 Toggle */}
          <div className="flex items-center gap-1 text-[10px] text-text-muted">
            <button
              onClick={() => setBrowserMode(isAgentMode ? 'extract' : 'agent')}
              className={`relative h-3.5 w-7 rounded-full transition-colors ${
                isAgentMode ? 'bg-primary' : 'bg-surface-hover'
              }`}
              title={isAgentMode ? '深度模式：Agent 可点击/输入/滚动，深入获取信息' : '文本提取：快速获取页面文本（默认）'}
            >
              <span
                className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white shadow transition-transform ${
                  isAgentMode ? 'left-[14px]' : 'left-0.5'
                }`}
              />
            </button>
            <span className={isAgentMode ? 'text-primary font-medium' : ''}>深度</span>
          </div>
          {/* 发送按钮 */}
          <button
            onClick={onSend}
            disabled={!input.trim()}
            className="flex items-center rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-hover disabled:opacity-50 disabled:hover:bg-primary"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
