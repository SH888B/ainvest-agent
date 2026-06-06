import React, { useEffect } from 'react'
import { useMemoryStore } from '../../stores/useMemoryStore'
import { useDevToolStore } from '../../stores/useDevToolStore'
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
  const { isOpen: logPanelOpen, toggle: toggleLogPanel, close: closeLogPanel } = useDevToolStore()

  useEffect(() => {
    loadMemory()
  }, [loadMemory])

  // 注册 DevTool 快捷键（仅开发环境）
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'L') {
        e.preventDefault()
        toggleLogPanel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleLogPanel])

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* 左侧行情看板 */}
      <div className="w-[40%] min-w-[360px] border-r border-border bg-panel-left">
        <MarketPanel />
      </div>

      {/* 中间聊天面板 */}
      <div className="flex w-[40%] min-w-[400px] flex-col border-r border-border bg-panel-center">
        <ChatPanel />
      </div>

      {/* 右侧 Session 列表 */}
      <div className="w-[20%] min-w-[200px] bg-panel-right">
        <SessionSidebar />
      </div>

      {/* DevTool 日志面板（仅开发环境） */}
      {import.meta.env.DEV && logPanelOpen && (
        <AgentLogPanel onClose={closeLogPanel} />
      )}
    </div>
  )
}

export default MainLayout
