/**
 * 主进程日志服务
 * 轻量级实现：输出到 console，不依赖 localStorage（主进程不可用）
 * API 与渲染进程 logger 保持一致
 */

import { LogCategory, LogLevel } from '@shared/types/log'

const LEVEL_PREFIX: Record<LogLevel, string> = {
  debug: 'DBG',
  info: 'INF',
  warn: 'WRN',
  error: 'ERR',
}

const LEVEL_METHOD: Record<LogLevel, typeof console.log> = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
}

const log = (level: LogLevel, category: LogCategory, event: string, data: Record<string, unknown>): void => {
  const prefix = `[${LEVEL_PREFIX[level]}][${category}:${event}]`
  LEVEL_METHOD[level](prefix, data)
}

export const logDebug = (category: LogCategory, event: string, data: Record<string, unknown>): void =>
  log('debug', category, event, data)

export const logInfo = (category: LogCategory, event: string, data: Record<string, unknown>): void =>
  log('info', category, event, data)

export const logWarn = (category: LogCategory, event: string, data: Record<string, unknown>): void =>
  log('warn', category, event, data)

export const logError = (category: LogCategory, event: string, data: Record<string, unknown>): void =>
  log('error', category, event, data)
