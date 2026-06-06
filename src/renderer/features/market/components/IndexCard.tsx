import React from 'react'
import type { MarketIndex } from '../../../services/mocks'

interface IndexCardProps {
  data: MarketIndex
}

/**
 * 单个指数卡片
 * 展示指数名称、点位、涨跌额、涨跌幅
 */
export const IndexCard: React.FC<IndexCardProps> = ({ data }) => {
  const isUp = data.changePercent >= 0

  return (
    <div className="flex flex-col items-center rounded-lg bg-surface/80 p-3 backdrop-blur-sm border border-border-subtle hover:bg-surface-hover hover:border-border transition-all duration-150">
      <span className="text-xs text-text-secondary">{data.nameCn}</span>
      <span className="mt-1 font-mono text-lg font-bold text-text">
        {data.point.toLocaleString()}
      </span>
      <div className="mt-0.5 flex items-center gap-1">
        <span className={`text-xs font-mono ${isUp ? 'text-success' : 'text-danger'}`}>
          {isUp ? '+' : ''}{data.change.toFixed(2)}
        </span>
        <span className={`text-xs font-mono ${isUp ? 'text-success' : 'text-danger'}`}>
          ({isUp ? '+' : ''}{data.changePercent.toFixed(2)}%)
        </span>
      </div>
    </div>
  )
}
