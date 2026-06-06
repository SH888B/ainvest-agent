import React, { useState } from 'react'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { SettingsPage } from '../settings/SettingsPage'
import { usePreferenceStore } from '../../stores/usePreferenceStore'
import { Settings } from 'lucide-react'

/**
 * 聊天面板主容器
 * 包含消息列表、输入框、API Key 引导横幅和设置入口
 */
export const ChatPanel: React.FC = () => {
  const { isConfigValid } = usePreferenceStore()
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="flex h-full flex-col">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text">智能助手</h2>
        <button
          onClick={() => setSettingsOpen(true)}
          className="rounded p-1 text-text-muted hover:text-text"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      {/* API Key 未配置提示 */}
      {!isConfigValid && (
        <div className="mx-4 mt-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
          <div className="text-sm text-warning">
            尚未配置大模型 API Key，点击右上角设置图标进行配置
          </div>
        </div>
      )}

      {/* 消息列表 */}
      <div className="flex-1 overflow-hidden">
        <MessageList />
      </div>

      {/* 输入框 */}
      <div className="border-t border-border p-4">
        <ChatInput />
      </div>

      {/* 设置弹窗 */}
      <SettingsPage open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
