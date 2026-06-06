import React, { useState } from 'react'
import { usePreferenceStore } from '../../stores/usePreferenceStore'
import { validateConfig } from '../../services/llm/llmService'
import { AVAILABLE_MODELS, DEFAULT_TEMPERATURE } from '@shared/constants'
import { Check, AlertCircle, Eye, EyeOff } from 'lucide-react'

/**
 * 大模型配置组件
 * API Key / Base URL / 模型 / Temperature
 */
export const LLMSettings: React.FC = () => {
  const { llmConfig, setLLMConfig, isConfigValid, validateConfig: storeValidate } = usePreferenceStore()
  const [showKey, setShowKey] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<{
    type: 'success' | 'error' | null
    message: string
  }>({ type: null, message: '' })

  const handleValidate = async () => {
    setValidating(true)
    setValidationResult({ type: null, message: '' })

    const result = await validateConfig(llmConfig)

    if (result.valid) {
      storeValidate()
      setValidationResult({ type: 'success', message: '验证通过，配置已保存' })
    } else {
      setValidationResult({ type: 'error', message: result.error || '验证失败' })
    }

    setValidating(false)
  }

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-text">大模型配置</h3>

      {/* API Key */}
      <div className="space-y-1">
        <label className="text-xs text-text-muted">API Key</label>
        <div className="flex gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            value={llmConfig.apiKey}
            onChange={(e) => setLLMConfig({ apiKey: e.target.value })}
            placeholder="sk-..."
            className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
          />
          <button
            onClick={() => setShowKey(!showKey)}
            className="rounded-md border border-border bg-surface px-3 text-text-muted hover:text-text"
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Base URL */}
      <div className="space-y-1">
        <label className="text-xs text-text-muted">Base URL</label>
        <input
          type="text"
          value={llmConfig.baseUrl}
          onChange={(e) => setLLMConfig({ baseUrl: e.target.value })}
          placeholder="https://api.moonshot.cn/v1"
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
        />
      </div>

      {/* 模型选择 */}
      <div className="space-y-1">
        <label className="text-xs text-text-muted">模型</label>
        <select
          value={llmConfig.model}
          onChange={(e) => setLLMConfig({ model: e.target.value })}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
        >
          {AVAILABLE_MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {/* Temperature */}
      <div className="space-y-1">
        <div className="flex justify-between">
          <label className="text-xs text-text-muted">Temperature</label>
          <span className="text-xs text-text">{llmConfig.temperature.toFixed(1)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={2}
          step={0.1}
          value={llmConfig.temperature}
          onChange={(e) => setLLMConfig({ temperature: parseFloat(e.target.value) })}
          className="w-full accent-primary"
        />
        <div className="flex justify-between text-[10px] text-text-muted">
          <span>精确</span>
          <span>平衡</span>
          <span>创意</span>
        </div>
      </div>

      {/* 验证按钮 */}
      <button
        onClick={handleValidate}
        disabled={validating || !llmConfig.apiKey}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-white hover:bg-primary-hover disabled:opacity-50"
      >
        {validating ? '验证中...' : '验证并保存'}
      </button>

      {/* 验证结果 */}
      {validationResult.type && (
        <div
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs ${
            validationResult.type === 'success'
              ? 'border border-success/30 bg-success/10 text-success'
              : 'border border-danger/30 bg-danger/10 text-danger'
          }`}
        >
          {validationResult.type === 'success' ? (
            <Check className="h-3 w-3" />
          ) : (
            <AlertCircle className="h-3 w-3" />
          )}
          {validationResult.message}
        </div>
      )}

      {/* 当前状态 */}
      <div className="flex items-center gap-2 text-xs">
        <div
          className={`h-2 w-2 rounded-full ${isConfigValid ? 'bg-success' : 'bg-warning'}`}
        />
        <span className="text-text-muted">
          {isConfigValid ? '配置有效' : '未配置或配置无效'}
        </span>
      </div>
    </div>
  )
}
