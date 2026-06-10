import React, { useState, useCallback } from 'react'
import { useSessionStore } from '../../stores/useSessionStore'
import { useChatStore } from '../../stores/useChatStore'
import { usePreferenceStore } from '../../stores/usePreferenceStore'
import { useMemoryStore } from '../../stores/useMemoryStore'
import { archiveSession } from '../../services/memory/memoryArchive'
import { mergeMemory } from '../../services/memory/memoryService'
import { SessionItem } from './SessionItem'
import { Plus, Archive, Loader2, CheckCircle } from 'lucide-react'

/**
 * Session 侧边栏
 * 展示 Session 列表、新建按钮、归档按钮
 * v5: 新增自动归档 + 手动归档功能
 */
interface Notification {
  type: 'success' | 'error' | 'info'
  message: string
}

export const SessionSidebar: React.FC = () => {
  const {
    sessions,
    currentSessionId,
    createSession,
    switchSession,
    renameSession,
    deleteSession,
    updateArchivedCount,
  } = useSessionStore()
  const { getMessages, clearMessages } = useChatStore()
  const { llmConfig, isConfigValid } = usePreferenceStore()
  const { memory, updateMemory, saveMemory } = useMemoryStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [archiving, setArchiving] = useState(false)
  const [notification, setNotification] = useState<Notification | null>(null)

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

  const showNotification = (type: Notification['type'], message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 3000)
  }

  /** 获取当前 Session 未归档消息数 */
  const getUnarchivedCount = useCallback(
    (sessionId: string): number => {
      const messages = getMessages(sessionId)
      const session = sessions.find((s) => s.id === sessionId)
      const archived = session?.archivedMessageCount || 0
      return Math.max(0, messages.length - archived)
    },
    [getMessages, sessions]
  )

  /** 归档当前 Session */
  const handleArchiveCurrent = async () => {
    if (!currentSessionId) {
      showNotification('error', '请先选择一个对话 Session')
      return
    }

    const messages = getMessages(currentSessionId)
    if (messages.length === 0) {
      showNotification('info', '当前 Session 没有对话内容')
      return
    }

    const session = sessions.find((s) => s.id === currentSessionId)
    const archivedCount = session?.archivedMessageCount || 0

    if (messages.length <= archivedCount) {
      showNotification('info', '当前 Session 已完全归档')
      return
    }

    if (!isConfigValid) {
      showNotification('error', '尚未配置大模型，无法归档')
      return
    }

    setArchiving(true)
    try {
      const result = await archiveSession({
        sessionId: currentSessionId,
        messages,
        archivedMessageCount: archivedCount,
        llmConfig,
      })

      // 更新归档计数
      updateArchivedCount(currentSessionId, messages.length)

      // 显式偏好双轨更新
      if (Object.keys(result.preferenceUpdate).length > 0) {
        const merged = mergeMemory(memory, result.preferenceUpdate as typeof memory)
        updateMemory(merged)
        await saveMemory()
      }

      showNotification(
        'success',
        `归档完成：提取 ${result.newFragments} 条记忆，写入 ${result.vectorRecords} 条向量${result.skippedDuplicates > 0 ? `，跳过 ${result.skippedDuplicates} 条重复` : ''}`
      )
    } catch (err) {
      showNotification('error', `归档失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setArchiving(false)
    }
  }

  /** 新建 Session（自动归档上一个） */
  const handleCreateSession = async () => {
    // 如果有当前 Session，先自动归档
    if (currentSessionId && isConfigValid) {
      const messages = getMessages(currentSessionId)
      const session = sessions.find((s) => s.id === currentSessionId)
      const archivedCount = session?.archivedMessageCount || 0

      if (messages.length > archivedCount) {
        try {
          await archiveSession({
            sessionId: currentSessionId,
            messages,
            archivedMessageCount: archivedCount,
            llmConfig,
          })
          updateArchivedCount(currentSessionId, messages.length)
        } catch (err) {
          console.error('[SessionSidebar] 自动归档失败:', err)
        }
      }
    }

    createSession()
  }

  const currentUnarchived = currentSessionId ? getUnarchivedCount(currentSessionId) : 0
  const isCurrentFullyArchived = currentUnarchived === 0

  return (
    <div className="flex h-full flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text">对话历史</h2>
        <button
          onClick={handleCreateSession}
          className="flex items-center rounded p-1 text-text-secondary hover:bg-surface-hover hover:text-text transition-colors duration-150"
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
                onDelete={() => {
                  clearMessages(session.id)
                  deleteSession(session.id)
                }}
                onEditTitleChange={setEditTitle}
              />
            ))}
          </div>
        )}
      </div>

      {/* 底部：归档按钮 + 通知 */}
      <div className="border-t border-border p-3 space-y-2">
        {notification && (
          <div
            className={`rounded-lg px-3 py-2 text-xs ${
              notification.type === 'success'
                ? 'border border-green-500/30 bg-green-500/10 text-green-400'
                : notification.type === 'error'
                  ? 'border border-red-500/30 bg-red-500/10 text-red-400'
                  : 'border border-blue-500/30 bg-blue-500/10 text-blue-400'
            }`}
          >
            {notification.message}
          </div>
        )}

        {/* 未归档消息数提示 */}
        {currentSessionId && currentUnarchived > 0 && (
          <div className="text-center text-xs text-text-muted">
            未归档消息: {currentUnarchived} 条
          </div>
        )}

        <button
          onClick={handleArchiveCurrent}
          disabled={archiving || !currentSessionId || isCurrentFullyArchived}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-surface/80 backdrop-blur-sm border border-border-subtle px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover hover:border-border hover:text-text transition-all duration-150 disabled:opacity-50"
        >
          {archiving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : isCurrentFullyArchived ? (
            <CheckCircle className="h-3 w-3 text-green-400" />
          ) : (
            <Archive className="h-3 w-3" />
          )}
          {archiving
            ? '归档中...'
            : isCurrentFullyArchived
              ? '已归档'
              : '归档当前会话'}
        </button>
      </div>
    </div>
  )
}
