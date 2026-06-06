import React, { useState } from 'react'
import { useMemoryStore } from '../../stores/useMemoryStore'
import { X, Plus, Save, Trash2 } from 'lucide-react'

/**
 * 个人偏好设置组件
 * 展示和编辑长期记忆（风险偏好、关注板块、常问问题、用户画像）
 */
export const PreferenceSettings: React.FC = () => {
  const {
    memory,
    isLoaded,
    loadMemory,
    saveMemory,
    setRiskPreference,
    addFocusSector,
    removeFocusSector,
    clearMemory,
  } = useMemoryStore()

  const [newSector, setNewSector] = useState('')

  if (!isLoaded) {
    loadMemory()
    return (
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-text">个人偏好</h3>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-sm text-text-muted">正在加载偏好数据...</p>
        </div>
      </div>
    )
  }

  const handleAddSector = () => {
    const sector = newSector.trim()
    if (sector) {
      addFocusSector(sector)
      setNewSector('')
    }
  }

  const handleSave = () => {
    saveMemory()
  }

  const handleClear = () => {
    if (confirm('确定要清空所有个人偏好吗？此操作不可撤销。')) {
      clearMemory()
      saveMemory()
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-text">个人偏好</h3>
        <button
          onClick={handleSave}
          className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary-hover"
        >
          <Save className="h-3 w-3" />
          保存
        </button>
      </div>

      {/* 风险偏好 */}
      <div className="space-y-2">
        <label className="text-xs text-text-muted">风险偏好</label>
        <div className="flex gap-2">
          {(['保守', '稳健', '激进'] as const).map((risk) => (
            <button
              key={risk}
              onClick={() => setRiskPreference(risk)}
              className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                memory.riskPreference === risk
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-surface text-text-muted hover:text-text'
              }`}
            >
              {risk}
            </button>
          ))}
          {memory.riskPreference && (
            <button
              onClick={() => setRiskPreference(undefined)}
              className="rounded-md px-2 text-xs text-text-muted hover:text-danger"
            >
              清除
            </button>
          )}
        </div>
      </div>

      {/* 关注板块 */}
      <div className="space-y-2">
        <label className="text-xs text-text-muted">关注板块</label>
        <div className="flex flex-wrap gap-2">
          {(memory.focusSectors || []).map((sector) => (
            <span
              key={sector}
              className="flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-text"
            >
              {sector}
              <button
                onClick={() => removeFocusSector(sector)}
                className="rounded-full p-0.5 text-text-muted hover:text-danger"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newSector}
            onChange={(e) => setNewSector(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddSector()}
            placeholder="添加板块，如：新能源"
            className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
          />
          <button
            onClick={handleAddSector}
            disabled={!newSector.trim()}
            className="flex items-center rounded-md border border-border bg-surface px-2 text-text-muted hover:text-text disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* 常问问题 */}
      <div className="space-y-2">
        <label className="text-xs text-text-muted">常问问题</label>
        {(memory.frequentQuestions || []).length === 0 ? (
          <p className="text-xs text-text-muted">暂无记录，使用"总结今日偏好"功能可自动提炼</p>
        ) : (
          <ul className="space-y-1">
            {(memory.frequentQuestions || []).map((q, index) => (
              <li key={index} className="text-xs text-text">
                {index + 1}. {q}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 用户画像摘要 */}
      {memory.summary && (
        <div className="space-y-2">
          <label className="text-xs text-text-muted">用户画像</label>
          <div className="rounded-md border border-border bg-surface p-3">
            <p className="text-xs leading-relaxed text-text">{memory.summary}</p>
          </div>
        </div>
      )}

      {/* 更新时间 */}
      {memory.updatedAt && (
        <p className="text-[10px] text-text-muted">
          最后更新：{new Date(memory.updatedAt).toLocaleString()}
        </p>
      )}

      {/* 清空按钮 */}
      <button
        onClick={handleClear}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-danger/30 px-3 py-2 text-xs text-danger hover:bg-danger/10"
      >
        <Trash2 className="h-3 w-3" />
        清空所有偏好
      </button>
    </div>
  )
}
