import React from 'react'
import { Session } from '@shared/types'
import { MessageSquare, Pencil, Trash2, Check, X } from 'lucide-react'

interface SessionItemProps {
  session: Session
  isActive: boolean
  isEditing: boolean
  editTitle: string
  onSelect: () => void
  onStartRename: () => void
  onConfirmRename: () => void
  onCancelRename: () => void
  onDelete: () => void
  onEditTitleChange: (title: string) => void
}

/**
 * Session 列表项
 */
export const SessionItem: React.FC<SessionItemProps> = ({
  session,
  isActive,
  isEditing,
  editTitle,
  onSelect,
  onStartRename,
  onConfirmRename,
  onCancelRename,
  onDelete,
  onEditTitleChange,
}) => {
  if (isEditing) {
    return (
      <div className="flex items-center gap-1 rounded-lg bg-surface px-2 py-2">
        <input
          value={editTitle}
          onChange={(e) => onEditTitleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onConfirmRename()
            if (e.key === 'Escape') onCancelRename()
          }}
          autoFocus
          className="flex-1 rounded border border-primary bg-background px-2 py-1 text-xs text-text focus:outline-none"
        />
        <button onClick={onConfirmRename} className="rounded p-1 text-success hover:bg-surface-hover">
          <Check className="h-3 w-3" />
        </button>
        <button onClick={onCancelRename} className="rounded p-1 text-danger hover:bg-surface-hover">
          <X className="h-3 w-3" />
        </button>
      </div>
    )
  }

  return (
    <div
      onClick={onSelect}
      className={`group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 transition-colors ${
        isActive ? 'bg-primary/10' : 'hover:bg-surface-hover'
      }`}
    >
      <MessageSquare className="h-3 w-3 shrink-0 text-text-muted" />
      <span className={`flex-1 truncate text-xs ${isActive ? 'text-primary' : 'text-text'}`}>
        {session.title}
      </span>

      {/* 操作按钮（悬停显示） */}
      <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onStartRename()
          }}
          className="rounded p-1 text-text-muted hover:text-text"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="rounded p-1 text-text-muted hover:text-danger"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
