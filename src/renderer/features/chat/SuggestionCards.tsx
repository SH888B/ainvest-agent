import React from 'react'
import { DEFAULT_SUGGESTIONS } from '@shared/constants/suggestions'
import { TrendingUp, Newspaper, FileText, Calculator } from 'lucide-react'

interface SuggestionCardsProps {
  onSelect: (text: string) => void
}

const ICON_MAP: Record<string, React.ReactNode> = {
  TrendingUp: <TrendingUp className="h-5 w-5" />,
  Newspaper: <Newspaper className="h-5 w-5" />,
  FileText: <FileText className="h-5 w-5" />,
  Calculator: <Calculator className="h-5 w-5" />,
}

/**
 * 推荐问话卡片
 * 空 Session 时展示，引导用户发起首次对话
 */
export const SuggestionCards: React.FC<SuggestionCardsProps> = ({ onSelect }) => {
  return (
    <div className="grid grid-cols-2 gap-3">
      {DEFAULT_SUGGESTIONS.map((s) => (
        <button
          key={s.id}
          onClick={() => onSelect(s.text)}
          className="flex flex-col items-start gap-2 rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-primary hover:bg-surface-hover"
        >
          <div className="text-text-muted">{ICON_MAP[s.icon]}</div>
          <span className="text-sm text-text">{s.text}</span>
        </button>
      ))}
    </div>
  )
}
