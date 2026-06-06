import React from 'react'
import { QUICK_TOOLS, QuickTool } from '@shared/constants/quickTools'
import { TrendingUp, Newspaper, FileText, Calculator } from 'lucide-react'

interface QuickToolsProps {
  onSelect: (tool: QuickTool) => void
}

const ICON_MAP: Record<string, React.ReactNode> = {
  TrendingUp: <TrendingUp className="h-3 w-3" />,
  Newspaper: <Newspaper className="h-3 w-3" />,
  FileText: <FileText className="h-3 w-3" />,
  Calculator: <Calculator className="h-3 w-3" />,
}

/**
 * 快捷工具按钮栏
 * 输入框上方，点击填充模板到输入框
 */
export const QuickTools: React.FC<QuickToolsProps> = ({ onSelect }) => {
  return (
    <div className="mb-2 flex gap-2">
      {QUICK_TOOLS.map((tool) => (
        <button
          key={tool.id}
          onClick={() => onSelect(tool)}
          className="flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-muted transition-colors hover:border-primary hover:text-text"
        >
          {ICON_MAP[tool.icon]}
          {tool.label}
        </button>
      ))}
    </div>
  )
}
