import React, { useEffect } from 'react'
import { useMemoryStore } from '../../stores/useMemoryStore'
import { MarketPanel } from '../market/MarketPanel'
import { ChatPanel } from '../chat/ChatPanel'
import { SessionSidebar } from '../session/SessionSidebar'

/**
 * 三栏布局容器
 * 左 40% 行情看板 | 中 40% 聊天面板 | 右 20% Session 列表
 */
const MainLayout: React.FC = () => {
  const { loadMemory } = useMemoryStore()

  useEffect(() => {
    loadMemory()
  }, [loadMemory])

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
    </div>
  )
}

export default MainLayout
