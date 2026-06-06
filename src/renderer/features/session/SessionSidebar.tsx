import React, { useState } from 'react'
import { useSessionStore } from '../../stores/useSessionStore'
import { useChatStore } from '../../stores/useChatStore'
import { usePreferenceStore } from '../../stores/usePreferenceStore'
import { useMemoryStore } from '../../stores/useMemoryStore'
import { extractMemoryFromDialogue, mergeMemory } from '../../services/memory/memoryService'
import { SessionItem } from './SessionItem'
import { Plus, Sparkles, Loader2 } from 'lucide-react'

/**
 * Session 侧边栏
 * 展示 Session 列表、新建按钮、总结偏好按钮
 */
export const SessionSidebar: React.FC = () => {
  const { sessions, currentSessionId, createSession, switchSession, renameSession, deleteSession } =
    useSessionStore()
  const { getMessages } = useChatStore()
  const { llmConfig, isConfigValid } = usePreferenceStore()
  const { memory, updateMemory, saveMemory } = useMemoryStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [summarizing, setSummarizing] = useState(false)

  const handleStartRename = (id: string, currentTitle: string) => {
    setEditingId(id)
    setEditTitle(currentTitle)
  }

  const handleConfirmRename = () => {
    if (editingId && editTitle.trim()) {
      renameSession(editingId, editTitle.trim())
    }
    setEditingId(null)
    setEditTitle('')
  }

  const handleSummarizePreference = async () => {
    if (!currentSessionId) {
      alert('请先选择一个对话 Session')
      return
    }

    const messages = getMessages(currentSessionId)
    if (messages.length === 0) {
      alert('当前 Session 没有对话内容，无法提炼偏好')
      return
    }

    if (!isConfigValid) {
      alert('尚未配置大模型，无法提炼偏好')
      return
    }

    setSummarizing(true)
    try {
      const extracted = await extractMemoryFromDialogue(messages, llmConfig)
      const merged = mergeMemory(memory, extracted)
      updateMemory(merged)
      await saveMemory()
      alert(`偏好提炼完成！\n\n风险偏好：${merged.riskPreference || '未识别'}\n关注板块：${(merged.focusSectors || []).join('、') || '无'}\n摘要：${merged.summary || '无'}`)
    } catch (err) {
      alert(`提炼失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSummarizing(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text">对话历史</h2>
        <button
          onClick={createSession}
          className="flex items-center rounded p-1 text-text-muted hover:bg-surface-hover hover:text-text"
          title="新建对话"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Session 列表 */}
      <div className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <div className="p-4 text-center text-xs text-text-muted">暂无对话，点击 + 新建</div>
        ) : (
          <div className="space-y-1">
            {sessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isActive={session.id === currentSessionId}
                isEditing={session.id === editingId}
                editTitle={editTitle}
                onSelect={() => switchSession(session.id)}
                onStartRename={() => handleStartRename(session.id, session.title)}
                onConfirmRename={handleConfirmRename}
                onCancelRename={() => setEditingId(null)}
                onDelete={() => deleteSession(session.id)}
                onEditTitleChange={setEditTitle}
              />
            ))}
          </div>
        )}
      </div>

      {/* 底部：总结今日偏好按钮 */}
      <div className="border-t border-border p-3">
        <button
          onClick={handleSummarizePreference}
          disabled={summarizing}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:opacity-50"
        >
          {summarizing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          {summarizing ? '提炼中...' : '总结今日偏好'}
        </button>
      </div>
    </div>
  )
}
