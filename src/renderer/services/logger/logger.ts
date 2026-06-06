import { LogEvent, LogFilter, LogLevel, AgentTurnLog } from '@shared/types/log'

/**
 * 日志服务
 * 提供事件记录、查询、导出功能
 * 存储：localStorage 环形缓冲区（保留最近 500 条）
 */

const STORAGE_KEY = 'ainvest:agent:logs'
const MAX_LOGS = 500

/** 敏感字段列表（命中时替换为 [REDACTED]） */
const SENSITIVE_KEYS = ['apiKey', 'authorization', 'token', 'password', 'secret']

/** 生成唯一 ID */
const generateId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`

/** 过滤敏感字段 */
const filterSensitiveData = (data: Record<string, unknown>): Record<string, unknown> => {
  const filtered: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.some((sk) => key.toLowerCase().includes(sk))) {
      filtered[key] = '[REDACTED]'
    } else {
      filtered[key] = value
    }
  }
  return filtered
}

type LogCallback = (event: LogEvent) => void
const subscribers: LogCallback[] = []

/** 订阅日志事件，返回取消订阅函数 */
export const subscribeLogs = (callback: LogCallback): (() => void) => {
  subscribers.push(callback)
  return () => {
    const index = subscribers.indexOf(callback)
    if (index > -1) {
      subscribers.splice(index, 1)
    }
  }
}

/**
 * 从 localStorage 读取日志
 */
const loadLogs = (): LogEvent[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as LogEvent[]) : []
  } catch {
    return []
  }
}

/**
 * 保存日志到 localStorage
 */
const saveLogs = (logs: LogEvent[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs))
  } catch {
    // localStorage 满时静默失败
  }
}

/**
 * 记录事件
 */
export const logEvent = (event: Omit<LogEvent, 'id' | 'timestamp'>): void => {
  const fullEvent: LogEvent = {
    ...event,
    data: filterSensitiveData(event.data),
    id: generateId(),
    timestamp: new Date().toISOString(),
  }

  const logs = loadLogs()
  logs.push(fullEvent)

  // 环形缓冲区：超过上限时移除最旧的
  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS)
  }

  saveLogs(logs)

  // 广播给订阅者（复制数组防止遍历期间被修改）
  const currentSubscribers = [...subscribers]
  for (const cb of currentSubscribers) {
    cb(fullEvent)
  }

  // 开发环境同时输出到 console
  if (import.meta.env.DEV) {
    const colorMap: Record<LogLevel, string> = {
      debug: '#6b7280',
      info: '#3b82f6',
      warn: '#f59e0b',
      error: '#ef4444',
    }
    console.log(
      `%c[${fullEvent.category}:${fullEvent.event}]`,
      `color: ${colorMap[fullEvent.level]}; font-weight: bold`,
      fullEvent.data
    )
  }
}

/**
 * 快捷方法
 */
export const logDebug = (category: LogEvent['category'], event: string, data: Record<string, unknown>, sessionId?: string): void =>
  logEvent({ level: 'debug', category, event, data, sessionId })

export const logInfo = (category: LogEvent['category'], event: string, data: Record<string, unknown>, sessionId?: string): void =>
  logEvent({ level: 'info', category, event, data, sessionId })

export const logWarn = (category: LogEvent['category'], event: string, data: Record<string, unknown>, sessionId?: string): void =>
  logEvent({ level: 'warn', category, event, data, sessionId })

export const logError = (category: LogEvent['category'], event: string, data: Record<string, unknown>, sessionId?: string): void =>
  logEvent({ level: 'error', category, event, data, sessionId })

/**
 * 获取日志
 */
export const getLogs = (filter?: LogFilter): LogEvent[] => {
  let logs = loadLogs()

  if (!filter) return logs

  if (filter.level) {
    logs = logs.filter((l) => l.level === filter.level)
  }
  if (filter.category) {
    logs = logs.filter((l) => l.category === filter.category)
  }
  if (filter.event) {
    logs = logs.filter((l) => l.event === filter.event)
  }
  if (filter.sessionId) {
    logs = logs.filter((l) => l.sessionId === filter.sessionId)
  }
  if (filter.startTime) {
    logs = logs.filter((l) => l.timestamp >= filter.startTime!)
  }
  if (filter.endTime) {
    logs = logs.filter((l) => l.timestamp <= filter.endTime!)
  }

  return logs
}

/**
 * 导出日志为 JSON（再次经过敏感字段过滤）
 */
export const exportLogs = (): string => {
  const logs = loadLogs()
  const filteredLogs = logs.map((log) => ({
    ...log,
    data: filterSensitiveData(log.data),
  }))
  return JSON.stringify(filteredLogs, null, 2)
}

/**
 * 清空日志
 */
export const clearLogs = (): void => {
  localStorage.removeItem(STORAGE_KEY)
}

/**
 * 获取某个 Session 的完整 Agent Turn 日志
 */
export const getAgentTurnLogs = (sessionId: string): AgentTurnLog[] => {
  const logs = getLogs({ sessionId })
  const turns: AgentTurnLog[] = []

  // 按 turn.start 和 turn.end 分组
  let currentTurn: AgentTurnLog | null = null

  for (const log of logs) {
    if (log.event === 'agent.turn.start') {
      currentTurn = {
        turnId: log.data.turnId as string,
        sessionId,
        userInput: (log.data.userInput as string) || '',
        events: [log],
        latencyMs: 0,
      }
    } else if (currentTurn) {
      currentTurn.events.push(log)

      if (log.event === 'agent.turn.end') {
        currentTurn.finalIntent = (log.data.intent as string) || undefined
        currentTurn.finalResponse = (log.data.response as string) || undefined
        currentTurn.error = (log.data.error as string) || undefined
        currentTurn.latencyMs = (log.data.latencyMs as number) || 0
        turns.push(currentTurn)
        currentTurn = null
      }
    }
  }

  return turns
}
