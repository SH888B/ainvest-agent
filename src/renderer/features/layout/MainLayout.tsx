import React, { useEffect, useState, useCallback } from 'react'
import { useMemoryStore } from '../../stores/useMemoryStore'
import { MarketPanel } from '../market/MarketPanel'
import { ChatPanel } from '../chat/ChatPanel'
import { SessionSidebar } from '../session/SessionSidebar'
import { AgentLogPanel } from '../devtools/AgentLogPanel'

/**
 * 三栏布局容器
 * 左 40% 行情看板 | 中 40% 聊天面板 | 右 20% Session 列表
 */
const MainLayout: React.FC = () => {
  const { loadMemory } = useMemoryStore()
  const [logPanelOpen, setLogPanelOpen] = useState(false)

  useEffect(() => {
    loadMemory()
  }, [loadMemory])

  // 注册 DevTool 快捷键（仅开发环境）
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'L') {
        e.preventDefault()
        setLogPanelOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* 左侧行情看板 */}
      <div className="w-[40%] min-w-[360px] border-r border-border">
        <MarketPanel />
      </div>

      {/* 中间聊天面板 */}
      <div className="flex w-[40%] min-w-[400px] flex-col border-r border-border">
        <ChatPanel />
      </div>

      {/* 右侧 Session 列表 */}
      <div className="w-[20%] min-w-[200px]">
        <SessionSidebar />
      </div>

      {/* DevTool 日志面板（仅开发环境） */}
      {import.meta.env.DEV && logPanelOpen && (
        <AgentLogPanel onClose={() => setLogPanelOpen(false)} />
      )}
    </div>
  )
}

export default MainLayout
