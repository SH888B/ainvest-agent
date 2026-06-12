import React, { useState } from 'react'
import { useThinkingStore, ThinkingStep } from '../../stores/useThinkingStore'
import { ChevronDown, ChevronUp, Check, X, Loader2 } from 'lucide-react'
import { BrowserToolCard, BrowserToolStatus } from './BrowserToolCard'

interface ThinkingBlockProps {
  turnId: string
}

const STEP_LABELS: Record<ThinkingStep['type'], string> = {
  'intent.recognizing': '正在理解您的问题...',
  'intent.resolved': '已识别意图',
  'tool.extracting': '正在提取参数...',
  'tool.calling': '正在调用工具...',
  'tool.result': '已获取工具结果',
  'llm.generating': '正在生成回复...',
  'llm.streaming': '正在输出回复...',
}

const StepIcon: React.FC<{ status: ThinkingStep['status'] }> = ({ status }) => {
  switch (status) {
    case 'running':
      return <Loader2 className="h-3 w-3 animate-spin text-primary" />
    case 'completed':
      return <Check className="h-3 w-3 text-green-500" />
    case 'failed':
      return <X className="h-3 w-3 text-red-500" />
    default:
      return <div className="h-3 w-3 rounded-full border border-text-muted/30" />
  }
}

/**
 * 判断步骤是否为浏览器工具调用，并提取 BrowserToolCard 所需 props
 */
const getBrowserCardProps = (step: ThinkingStep): React.ComponentProps<typeof BrowserToolCard> | null => {
  const meta = step.meta as Record<string, unknown> | undefined
  if (!meta || meta.tool !== 'web.browse') return null

  const url = String(meta.url || '')
  const action = String(meta.action || 'snapshot')
  const resultPreview = meta.resultPreview ? String(meta.resultPreview) : undefined
  const hasError = meta.hasError === true

  let status: BrowserToolStatus = 'loading'
  if (step.type === 'tool.result') {
    status = hasError ? 'error' : 'success'
  } else if (step.type === 'tool.calling') {
    status = step.status === 'failed' ? 'error' : step.status === 'completed' ? 'success' : 'loading'
  }

  return {
    url,
    status,
    textPreview: status === 'success' ? resultPreview : undefined,
    hasScreenshot: status === 'success' && action === 'screenshot',
    error: hasError && step.type === 'tool.result' ? '工具执行失败' : undefined,
  }
}

/**
 * Thinking 块组件
 * 展示 Agent 当前回合的思考步骤
 * 默认折叠，点击可展开
 */
export const ThinkingBlock: React.FC<ThinkingBlockProps> = React.memo(
  ({ turnId }) => {
    const steps = useThinkingStore((state) => state.turns[turnId])
    const [expanded, setExpanded] = useState(false)

    if (!steps || steps.length === 0) return null

    const hasRunning = steps.some((s) => s.status === 'running')
    const allCompleted = steps.every((s) => s.status === 'completed')
    const hasFailed = steps.some((s) => s.status === 'failed')

    const titleText = hasRunning
      ? 'Agent 正在思考...'
      : hasFailed
        ? 'Agent 思考异常'
        : allCompleted
          ? 'Agent 思考完成'
          : 'Agent 思考中...'

    return (
      <div className="mb-1 rounded-lg border border-border/50 bg-background/80 px-3 py-2 text-xs">
        {/* 折叠态头部 */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-2 text-text-muted hover:text-text"
        >
          {hasRunning ? (
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
          ) : hasFailed ? (
            <X className="h-3 w-3 text-red-500" />
          ) : allCompleted ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : (
            <div className="h-3 w-3 rounded-full border border-text-muted/30" />
          )}
          <span>{titleText}</span>
          <span className="ml-auto">
            {expanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </span>
        </button>

        {/* 展开态步骤列表 */}
        {expanded && (
          <div className="mt-2 space-y-1.5 border-t border-border/30 pt-2">
            {steps.map((step, index) => {
              const browserProps = getBrowserCardProps(step)
              return (
                <div key={index} className="flex items-start gap-2">
                  <StepIcon status={step.status} />
                  <div className="flex-1 min-w-0">
                    <div className="text-text-muted">
                      {step.message || STEP_LABELS[step.type]}
                    </div>
                    {step.detail && !browserProps && (
                      <div className="mt-0.5 text-text-muted/60">
                        {step.detail}
                      </div>
                    )}
                    {step.error && (
                      <div className="mt-0.5 text-red-400">{step.error}</div>
                    )}
                    {/* 浏览器工具卡片 */}
                    {browserProps && (
                      <div className="mt-1.5">
                        <BrowserToolCard {...browserProps} />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }
)

ThinkingBlock.displayName = 'ThinkingBlock'
