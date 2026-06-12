import React, { useState, useCallback, useEffect, useRef } from 'react'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { SuggestionCards } from './SuggestionCards'
import { SettingsPage } from '../settings/SettingsPage'
import { usePreferenceStore } from '../../stores/usePreferenceStore'
import { useSessionStore, generateSessionName } from '../../stores/useSessionStore'
import { useChatStore } from '../../stores/useChatStore'
import { useMemoryStore } from '../../stores/useMemoryStore'
import { useThinkingStore } from '../../stores/useThinkingStore'
import { runAgentTurn } from '../../services/agent/agentEngine'
import '../../services/tools'
import { Settings, Wrench, Brain } from 'lucide-react'
import { useDevToolStore } from '../../stores/useDevToolStore'
import { ChatMessage } from '@shared/types'
import { isModelReady, isModelLoading, preloadModel } from '../../services/memory/embeddingService'

/** 缓存空数组，避免 zustand selector 每次返回新引用导致无限 re-render */
const EMPTY_MESSAGES: ChatMessage[] = []

/**
 * 聊天面板主容器
 * 包含消息列表、输入框、API Key 引导横幅和设置入口
 * v3.0.0: 管理发送逻辑，支持快捷工具和推荐问话
 */
export const ChatPanel: React.FC = () => {
  const { isConfigValid, llmConfig } = usePreferenceStore()
  const { currentSessionId, sessions, createSession, autoRenameSession } = useSessionStore()
  const { getMessages, addMessage, appendAssistantContent, setAssistantSource, setLoading } = useChatStore()
  const { memory } = useMemoryStore()
  const { clearTurn } = useThinkingStore()
  const { toggle: toggleDevTool } = useDevToolStore()
  const [input, setInput] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [modelStatus, setModelStatus] = useState<'idle' | 'loading' | 'ready'>('idle')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false)
    // BUG-03 修复：关闭设置页后，延迟一帧将焦点还给输入框
    requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
  }, [])

  // 直接订阅消息列表（修复 v6 之前 useMemo + getMessages 的订阅失效问题）
  // 注意：用 ?? 而非 || ，因为 || 会每次创建新 [] 引用导致无限 re-render
  const messages = useChatStore((state) =>
    currentSessionId ? state.messagesBySession[currentSessionId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES
  )

  // 模型加载状态跟踪 + 后台预加载
  useEffect(() => {
    const check = () => {
      if (isModelReady()) setModelStatus('ready')
      else if (isModelLoading()) setModelStatus('loading')
      else setModelStatus('idle')
    }
    check()

    // 后台预加载模型（如果还没加载）
    if (!isModelReady() && !isModelLoading()) {
      preloadModel().catch(() => {})
    }

    const interval = setInterval(check, 1000)
    return () => clearInterval(interval)
  }, [])

  const handleSend = useCallback(
    async (textOverride?: string) => {
      const text = (textOverride || input).trim()
      if (!text) return

      let sessionId = currentSessionId
      if (!sessionId) {
        sessionId = createSession()
        if (!sessionId) return // v6: 防竞态拦截，不继续发送
      }

      // 添加用户消息
      addMessage(sessionId, { role: 'user', content: text })
      setInput('')
      setLoading(true)

      // 自动命名 Session
      // 注意：createSession() 更新了 store，但闭包中的 sessions 可能是旧值
      // 需要从 store 获取最新 sessions 来确保能找到新创建的 session
      const latestSessions = useSessionStore.getState().sessions
      const session = latestSessions.find((s) => s.id === sessionId)
      if (session && !session.isCustomNamed && session.title === '新对话') {
        const newName = generateSessionName(text)
        autoRenameSession(sessionId, newName)
      }

      const turnId = `turn-${Date.now()}`
      addMessage(sessionId, { role: 'assistant', content: '', turnId })

      if (!isConfigValid) {
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

      const allMessages = getMessages(sessionId)
      const history: ChatMessage[] = allMessages.slice(0, -1)

      await runAgentTurn(text, history, llmConfig, memory, {
        onChunk: (content) => {
          appendAssistantContent(sessionId, content)
        },
        onToolCall: (toolName, args) => {
          console.log(`[Agent] 工具调用: ${toolName}`, args)
        },
        onToolResult: (result) => {
          console.log(`[Agent] 工具结果:`, result)
        },
        onSourceUrl: (url, title) => {
          setAssistantSource(sessionId, url, title)
        },
        onError: (error) => {
          appendAssistantContent(sessionId, `\n\n[错误] ${error}`)
        },
        onDone: () => {
          setLoading(false)
          clearTurn()
        },
      })
    },
    [input, currentSessionId, sessions, createSession, addMessage, setLoading, getMessages, llmConfig, isConfigValid, memory, appendAssistantContent, autoRenameSession, clearTurn]
  )

  return (
    <div className="flex h-full flex-col">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text">智能助手</h2>
        <div className="flex items-center gap-1">
          {import.meta.env.DEV && (
            <button
              onClick={toggleDevTool}
              className="rounded p-1 text-text-muted hover:text-text"
              title="DevTool 看板"
            >
              <Wrench className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded p-1 text-text-muted hover:text-text"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* API Key 未配置提示 */}
      {!isConfigValid && (
        <div className="mx-4 mt-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
          <div className="text-sm text-warning">
            尚未配置大模型 API Key，点击右上角设置图标进行配置
          </div>
        </div>
      )}

      {/* 语义模型加载提示 */}
      {modelStatus === 'loading' && (
        <div className="mx-4 mt-2 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2">
          <Brain className="h-4 w-4 animate-pulse text-primary" />
          <span className="text-xs text-primary">
            正在初始化语义模型（首次加载需要几秒，后台运行不影响使用）...
          </span>
        </div>
      )}

      {/* 消息列表 / 推荐卡片 */}
      <div className="flex-1 overflow-hidden p-4">
        {messages.length === 0 && currentSessionId ? (
          <div className="flex h-full flex-col items-center justify-center">
            <p className="mb-4 text-sm text-text-muted">不知道问什么？试试这些：</p>
            <SuggestionCards onSelect={(text) => handleSend(text)} />
          </div>
        ) : (
          <MessageList />
        )}
      </div>

      {/* 输入框 */}
      <div className="border-t border-border p-4">
        <ChatInput onSend={() => handleSend()} input={input} setInput={setInput} inputRef={inputRef} />
      </div>

      {/* 设置弹窗 */}
      <SettingsPage open={settingsOpen} onClose={handleCloseSettings} />
    </div>
  )
}
