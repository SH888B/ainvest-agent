/**
 * 日志事件类型定义
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogCategory = 'agent' | 'intent' | 'tool' | 'llm' | 'ui' | 'memory' | 'browser'

export interface LogEvent {
  /** 唯一事件 ID */
  id: string
  /** 时间戳 ISO 8601 */
  timestamp: string
  /** 日志级别 */
  level: LogLevel
  /** 事件分类 */
  category: LogCategory
  /** 事件类型标识 */
  event: string
  /** 事件数据 */
  data: Record<string, unknown>
  /** 关联的 Session ID */
  sessionId?: string
  /** 关联的消息索引 */
  messageIndex?: number
}

export interface LogFilter {
  level?: LogLevel
  category?: LogCategory
  event?: string
  sessionId?: string
  startTime?: string
  endTime?: string
}

export interface AgentTurnLog {
  turnId: string
  sessionId: string
  userInput: string
  events: LogEvent[]
  finalIntent?: string
  finalResponse?: string
  error?: string
  latencyMs: number
}
