import React from 'react'
import { Globe, Loader2, CheckCircle, XCircle, Image as ImageIcon } from 'lucide-react'

export type BrowserToolStatus = 'loading' | 'success' | 'error'

export interface BrowserToolCardProps {
  url: string
  title?: string
  status: BrowserToolStatus
  textPreview?: string
  hasScreenshot?: boolean
  error?: string
}

/**
 * 浏览器工具卡片
 * 在 Thinking 块或消息列表中展示 Agent 正在访问网页的状态与结果
 */
export const BrowserToolCard: React.FC<BrowserToolCardProps> = ({
  url,
  title,
  status,
  textPreview,
  hasScreenshot,
  error,
}) => {
  const hostname = React.useMemo(() => {
    try {
      return new URL(url).hostname
    } catch {
      return url
    }
  }, [url])

  const previewText = React.useMemo(() => {
    if (!textPreview) return ''
    // 移除结果前缀，保留核心文本
    return textPreview
      .replace(/^已访问\s+[^\n]+\n+网页内容摘要：\n*/, '')
      .replace(/^已访问\s+[^\n]+\s*\([^)]+\)\n*\n*提取内容：\n*/, '')
      .replace(/\n*\[截图已生成\]\s*$/, '')
      .slice(0, 220)
  }, [textPreview])

  return (
    <div className="mt-2 rounded-lg border border-border bg-surface/60 p-3 text-xs">
      {/* 头部：状态 + 网站信息 */}
      <div className="flex items-center gap-2">
        {status === 'loading' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : status === 'error' ? (
          <XCircle className="h-3.5 w-3.5 text-red-500" />
        ) : (
          <CheckCircle className="h-3.5 w-3.5 text-green-500" />
        )}
        <span className="font-medium text-text">
          {status === 'loading'
            ? `正在访问 ${hostname}`
            : status === 'error'
              ? `访问 ${hostname} 失败`
              : `已访问 ${title || hostname}`}
        </span>
      </div>

      {/* URL */}
      <div className="mt-1.5 flex items-center gap-1.5 text-text-muted">
        <Globe className="h-3 w-3 shrink-0" />
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="truncate hover:text-primary hover:underline"
          title={url}
        >
          {url}
        </a>
      </div>

      {/* 错误信息 */}
      {status === 'error' && error && (
        <div className="mt-2 rounded border border-red-500/20 bg-red-500/10 px-2 py-1.5 text-red-400">
          {error}
        </div>
      )}

      {/* 内容摘要 */}
      {status === 'success' && previewText && (
        <div className="mt-2 rounded border border-border bg-background/60 px-2 py-1.5 text-text-secondary">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-text-muted">提取摘要</div>
          <div className="line-clamp-5 whitespace-pre-wrap">{previewText}</div>
        </div>
      )}

      {/* 截图标记 */}
      {status === 'success' && hasScreenshot && (
        <div className="mt-2 flex items-center gap-1.5 text-text-muted">
          <ImageIcon className="h-3 w-3" />
          <span>已生成网页截图</span>
        </div>
      )}
    </div>
  )
}
