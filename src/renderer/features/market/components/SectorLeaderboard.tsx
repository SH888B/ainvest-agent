import React from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import type { SectorInfo } from '../../../services/mocks'

interface SectorLeaderboardProps {
  topGainers: SectorInfo[]
  topLosers: SectorInfo[]
}

/**
 * 行业板块排行
 * 展示涨幅 Top 5 和跌幅 Top 5 板块
 */
export const SectorLeaderboard: React.FC<SectorLeaderboardProps> = ({
  topGainers,
  topLosers,
}) => {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        行业板块
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {/* 涨幅榜 */}
        <div className="space-y-1.5">
          <div className="mb-1 text-xs text-success">涨幅榜</div>
          {topGainers.map((sector) => (
            <div
              key={sector.name}
              className="flex items-center justify-between rounded bg-surface px-2 py-1.5"
            >
              <span className="text-xs text-text">{sector.name}</span>
              <span className="flex items-center text-xs font-mono text-success">
                <TrendingUp className="mr-1 h-3 w-3" />
                +{sector.changePercent.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>

        {/* 跌幅榜 */}
        <div className="space-y-1.5">
          <div className="mb-1 text-xs text-danger">跌幅榜</div>
          {topLosers.map((sector) => (
            <div
              key={sector.name}
              className="flex items-center justify-between rounded bg-surface px-2 py-1.5"
            >
              <span className="text-xs text-text">{sector.name}</span>
              <span className="flex items-center text-xs font-mono text-danger">
                <TrendingDown className="mr-1 h-3 w-3" />
                {sector.changePercent.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
