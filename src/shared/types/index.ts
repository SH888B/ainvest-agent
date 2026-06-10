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

/** 意图类型 */
export type IntentType =
  | 'market.query'
  | 'news.search'
  | 'strategy.backtest'
  | 'stock.profile'
  | 'general.chat'
  | 'session.manage'
  | 'preference.update'
  | 'shell.execute'
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
