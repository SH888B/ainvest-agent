/**
 * 共享类型定义
 */

/** LLM 对话消息角色 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

/** 聊天消息 */
export interface ChatMessage {
  role: MessageRole
  content: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
  turnId?: string
  /** v6.1.1: 浏览器来源信息（web.browse 工具结果） */
  sourceUrl?: string
  sourceTitle?: string
}

/** 工具调用 */
export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

/** 工具执行结果 */
export interface ToolResult {
  tool_call_id: string
  role: 'tool'
  content: string
}

/** 大模型配置 */
export interface LLMConfig {
  apiKey: string
  baseUrl: string
  model: string
  temperature: number
  /** Embedding 模型名，默认 embedding-3 */
  embeddingModel?: string
  /** Embedding 向量维度，默认 512 */
  embeddingDimensions?: number
}

/** 用户偏好（长期记忆） */
export interface UserMemory {
  riskPreference?: '保守' | '稳健' | '激进'
  focusSectors?: string[]
  frequentQuestions?: string[]
  summary?: string
  updatedAt?: string
}

/** Session 元数据 */
export interface Session {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  isCustomNamed?: boolean
  archivedMessageCount?: number
}

/** 意图类型（v6.0.1: news.search 已合并到 web.browse） */
export type IntentType =
  | 'market.query'
  | 'strategy.backtest'
  | 'stock.profile'
  | 'general.chat'
  | 'session.manage'
  | 'preference.update'
  | 'shell.execute'
  | 'web.browse'
  | 'unknown'

/** 意图识别结果 */
export interface IntentResult {
  intent: IntentType
  confidence: number
  entities?: Record<string, unknown>
}

/** 工具定义 */
export interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

/** 浏览器操作模式 */
export type BrowserMode = 'extract' | 'agent'

/** AXTree 简化节点 */
export interface AXNode {
  nodeId: string
  role: string
  name: string
  value?: string
}

/** Agent Loop 中的 action 类型 */
export type BrowserAction = 'click' | 'type' | 'scroll' | 'extract' | 'done'

/** LLM 决策结果 */
export interface BrowserActionDecision {
  action: BrowserAction
  nodeId?: string
  text?: string
  direction?: 'up' | 'down'
  reason: string
}

/** Agent Loop 步骤记录 */
export interface BrowserAgentStep {
  step: number
  action: BrowserAction
  target?: string
  result: string
  timestamp: number
}

/** CDP 操作结果 */
export interface CDPOperationResult {
  success: boolean
  error?: string
}

/** 流式响应 chunk */
export interface StreamChunk {
  choices: Array<{
    delta: {
      content?: string
      role?: MessageRole
      tool_calls?: ToolCall[]
    }
    finish_reason: string | null
    index: number
  }>
}
