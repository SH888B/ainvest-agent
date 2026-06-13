import React from 'react'
import ReactMarkdown from 'react-markdown'

interface MarkdownRendererProps {
  content: string
}

/**
 * Markdown 渲染组件
 * 统一 Agent 消息的富文本渲染样式
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-text">{children}</strong>,
        em: ({ children }) => <em className="italic text-text">{children}</em>,
        ul: ({ children }) => <ul className="mb-2 list-disc space-y-0.5 pl-4">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal space-y-0.5 pl-4">{children}</ol>,
        li: ({ children }) => <li className="text-text-secondary">{children}</li>,
        code: ({ children, className }) => {
          const isInline = !className
          return isInline ? (
            <code className="rounded bg-background px-1 py-0.5 font-mono text-xs text-primary">
              {children}
            </code>
          ) : (
            <code className="font-mono text-xs text-text-secondary">{children}</code>
          )
        },
        pre: ({ children }) => (
          <pre className="my-2 overflow-x-auto rounded-md border border-border bg-background p-2">
            {children}
          </pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="my-2 border-l-2 border-primary pl-3 text-text-muted">
            {children}
          </blockquote>
        ),
        a: ({ children, href }) => (
          <a
            href={href}
            className="text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault()
            }}
            title={href || undefined}
          >
            {children}
          </a>
        ),
        h1: ({ children }) => <h1 className="mb-2 text-lg font-bold text-text">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-2 text-base font-bold text-text">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-1 text-sm font-bold text-text">{children}</h3>,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
