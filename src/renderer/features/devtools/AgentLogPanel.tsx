import React, { useEffect, useRef, useState, useCallback } from 'react'
import { LogEvent, LogCategory } from '@shared/types/log'
import { subscribeLogs, getLogs, exportLogs } from '../../services/logger/logger'
import { X, Download, Bug, Activity, Wrench, Brain, Monitor } from 'lucide-react'

interface AgentLogPanelProps {
  onClose: () => void
}

const CATEGORY_FILTERS: { key: LogCategory | 'all'; label: string; icon: React.ReactNode }[] = [
  { key: 'all', label: '全部', icon: <Activity className="h-3 w-3" /> },
  { key: 'agent', label: 'Agent', icon: <Bug className="h-3 w-3" /> },
  { key: 'intent', label: '意图', icon: <Brain className="h-3 w-3" /> },
  { key: 'tool', label: '工具', icon: <Wrench className="h-3 w-3" /> },
  { key: 'llm', label: 'LLM', icon: <Brain className="h-3 w-3" /> },
  { key: 'ui', label: 'UI', icon: <Monitor className="h-3 w-3" /> },
]

const LEVEL_COLORS: Record<string, string> = {
  debug: 'text-gray-400',
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
}

/**
 * Agent 日志面板
 * 右侧滑出，展示日志事件时间线
 * 仅开发环境可用
 */
export const AgentLogPanel: React.FC<AgentLogPanelProps> = ({ onClose }) => {
  const [logs, setLogs] = useState<LogEvent[]>([])
  const [filter, setFilter] = useState<LogCategory | 'all'>('all')
  const scrollRef = useRef<HTMLDivElement>(null)

  // 初始加载日志
  useEffect(() => {
    setLogs(getLogs())
  }, [])

  // 订阅新日志
  useEffect(() => {
    const unsubscribe = subscribeLogs((event) => {
      setLogs((prev) => [...prev, event])
    })
    return unsubscribe
  }, [])

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  const filteredLogs =
    filter === 'all' ? logs : logs.filter((l) => l.category === filter)

  // 按 turn 分组展示
  const grouped = useCallback(() => {
    const groups: { turnId: string | null; logs: LogEvent[] }[] = []
    let currentGroup: LogEvent[] = []
    let currentTurnId: string | null = null

    for (const log of filteredLogs) {
      const turnId = (log.data.turnId as string) || null
      if (turnId && turnId !== currentTurnId) {
        if (currentGroup.length > 0) {
          groups.push({ turnId: currentTurnId, logs: currentGroup })
        }
        currentGroup = [log]
        currentTurnId = turnId
      } else {
        currentGroup.push(log)
      }
    }
    if (currentGroup.length > 0) {
      groups.push({ turnId: currentTurnId, logs: currentGroup })
    }
    return groups
  }, [filteredLogs])

  const handleExport = () => {
    const blob = new Blob([exportLogs()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ainvest-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const groups = grouped()

  return (
    <div className="fixed right-0 top-0 z-50 flex h-screen w-[480px] flex-col border-l border-border bg-background/95 backdrop-blur-sm shadow-2xl">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-text">Agent 日志</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="rounded p-1 text-text-muted hover:text-text"
            title="导出 JSON"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            className="rounded p-1 text-text-muted hover:text-text"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 过滤标签 */}
      <div className="flex gap-1 border-b border-border px-4 py-2">
        {CATEGORY_FILTERS.map((cf) => (
          <button
            key={cf.key}
            onClick={() => setFilter(cf.key)}
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
              filter === cf.key
                ? 'bg-primary text-white'
                : 'text-text-muted hover:bg-surface'
            }`}
          >
            {cf.icon}
            {cf.label}
          </button>
        ))}
      </div>

      {/* 日志列表 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 text-xs">
        {groups.length === 0 && (
          <div className="text-center text-text-muted">暂无日志</div>
        )}
        {groups.map((group, gi) => (
          <div key={gi} className="mb-3">
            {group.turnId && (
              <div className="mb-1 rounded bg-surface px-2 py-1 text-text-muted">
                Turn: {group.turnId}
              </div>
            )}
            <div className="space-y-1">
              {group.logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-2 rounded px-2 py-1 hover:bg-surface/50"
                >
                  <span className="shrink-0 text-text-muted">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`shrink-0 ${LEVEL_COLORS[log.level] || 'text-text'}`}>
                    {log.level}
                  </span>
                  <span className="shrink-0 text-text-muted">{log.category}</span>
                  <span className="shrink-0 font-medium text-text">{log.event}</span>
                  <span className="truncate text-text-muted">
                    {JSON.stringify(log.data).slice(0, 120)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 底部统计 */}
      <div className="border-t border-border px-4 py-2 text-xs text-text-muted">
        共 {filteredLogs.length} 条日志
      </div>
    </div>
  )
}
