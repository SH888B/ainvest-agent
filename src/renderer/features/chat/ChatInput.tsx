import React, { useState, useCallback } from 'react'
import { useChatStore } from '../../stores/useChatStore'
import { useSessionStore } from '../../stores/useSessionStore'
import { usePreferenceStore } from '../../stores/usePreferenceStore'
import { useMemoryStore } from '../../stores/useMemoryStore'
import { runAgentTurn } from '../../services/agent/agentEngine'
import '../../services/tools' // 导入工具注册
import { Send } from 'lucide-react'
import { ChatMessage } from '@shared/types'

/**
 * 聊天输入框
 * Phase 4：接入 Agent 引擎（含长期记忆注入）
 */
export const ChatInput: React.FC = () => {
  const [input, setInput] = useState('')
  const { currentSessionId, createSession } = useSessionStore()
  const { getMessages, addMessage, appendAssistantContent, setLoading } = useChatStore()
  const { llmConfig, isConfigValid } = usePreferenceStore()
  const { memory } = useMemoryStore()

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text) return

    // 如果没有当前 Session，先创建一个
    let sessionId = currentSessionId
    if (!sessionId) {
      sessionId = createSession()
    }

    // 添加用户消息
    addMessage(sessionId, { role: 'user', content: text })
    setInput('')
    setLoading(true)

    // 添加空的 assistant 消息占位，用于流式填充
    addMessage(sessionId, { role: 'assistant', content: '' })

    if (!isConfigValid) {
      // 未配置 LLM，使用 Mock 回复
      const mockReply = `收到你的问题："${text}"\n\n（尚未配置大模型）请在设置中配置 API Key 以启用智能对话。`
      let index = 0
      const interval = setInterval(() => {
        index++
        appendAssistantContent(sessionId, mockReply[index - 1])
        if (index >= mockReply.length) {
          clearInterval(interval)
          setLoading(false)
        }
      }, 15)
      return
    }

    // 获取历史消息（不含刚添加的占位 assistant 消息）
    const allMessages = getMessages(sessionId)
    const history: ChatMessage[] = allMessages.slice(0, -1) // 去掉最后的空 assistant

    // 调用 Agent 引擎（传入长期记忆）
    await runAgentTurn(text, history, llmConfig, memory, {
      onChunk: (content) => {
        appendAssistantContent(sessionId, content)
      },
      onToolCall: (toolName, args) => {
        // eslint-disable-next-line no-console
        console.log(`[Agent] 工具调用: ${toolName}`, args)
      },
      onToolResult: (result) => {
        // eslint-disable-next-line no-console
        console.log(`[Agent] 工具结果:`, result)
      },
      onError: (error) => {
        appendAssistantContent(sessionId, `\n\n[错误] ${error}`)
      },
      onDone: () => {
        setLoading(false)
      },
    })
  }, [input, currentSessionId, createSession, addMessage, setLoading, getMessages, llmConfig, isConfigValid, memory, appendAssistantContent])

  return (
    <div className="flex gap-2">
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
          }
        }}
        placeholder="输入消息，Shift+Enter 换行..."
        rows={2}
        className="flex-1 resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
      />
      <button
        onClick={handleSend}
        disabled={!input.trim()}
        className="flex shrink-0 items-center self-end rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-hover disabled:opacity-50 disabled:hover:bg-primary"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  )
}
