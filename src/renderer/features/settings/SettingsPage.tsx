import React from 'react'
import { LLMSettings } from './LLMSettings'
import { PreferenceSettings } from './PreferenceSettings'
import { X } from 'lucide-react'

interface SettingsPageProps {
  open: boolean
  onClose: () => void
}

/**
 * 设置页弹窗
 * 包含大模型配置和个人偏好两个区块
 */
export const SettingsPage: React.FC<SettingsPageProps> = ({ open, onClose }) => {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative flex h-[80vh] w-[560px] flex-col rounded-xl border border-border bg-background shadow-2xl">
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

        {/* 内容 */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          <LLMSettings />
          <div className="border-t border-border" />
          <PreferenceSettings />
        </div>
      </div>
    </div>
  )
}
