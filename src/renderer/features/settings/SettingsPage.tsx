import React, { useState } from 'react'
import { LLMSettings } from './LLMSettings'
import { PreferenceSettings } from './PreferenceSettings'
import { MemoryManager } from './MemoryManager'
import { BrowserSettings } from './BrowserSettings'
import { X, Cpu, User, Brain, Globe } from 'lucide-react'

interface SettingsPageProps {
  open: boolean
  onClose: () => void
}

type TabKey = 'llm' | 'preference' | 'memory' | 'browser'

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'llm', label: '大模型', icon: <Cpu className="h-4 w-4" /> },
  { key: 'preference', label: '个人偏好', icon: <User className="h-4 w-4" /> },
  { key: 'memory', label: '记忆管理', icon: <Brain className="h-4 w-4" /> },
  { key: 'browser', label: '浏览器', icon: <Globe className="h-4 w-4" /> },
]

/**
 * 设置页弹窗
 * 包含大模型配置、个人偏好、记忆管理三个标签页
 */
export const SettingsPage: React.FC<SettingsPageProps> = ({ open, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('llm')

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative flex h-[80vh] w-[600px] flex-col rounded-xl border border-border bg-background shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-text">设置</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-text-muted hover:bg-surface-hover hover:text-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="flex gap-1 border-b border-border px-6 py-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                activeTab === tab.key
                  ? 'bg-primary text-white'
                  : 'text-text-muted hover:bg-surface hover:text-text'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'llm' && <LLMSettings />}
          {activeTab === 'preference' && <PreferenceSettings />}
          {activeTab === 'memory' && <MemoryManager />}
          {activeTab === 'browser' && <BrowserSettings />}
        </div>
      </div>
    </div>
  )
}
