import React, { useEffect, useState } from 'react'
import {
  queryMarketIndices,
  queryMarketDistribution,
  querySectorLeaderboard,
  getAllMarketData,
} from '../../services/mocks'
import type {
  MarketIndex,
  DistributionBin,
  SectorInfo,
  MarketData,
} from '../../services/mocks'
import { IndexCard } from './components/IndexCard'
import { MarketDistributionChart } from './components/MarketDistributionChart'
import { SectorLeaderboard } from './components/SectorLeaderboard'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface MarketOverviewProps {
  onSelectSymbol: (symbol: string) => void
}

/**
 * 行情总览（重新设计）
 * 从上到下：指数看板 → 涨跌分布柱状图 → 行业板块排行 → 市场股票列表
 */
export const MarketOverview: React.FC<MarketOverviewProps> = ({ onSelectSymbol }) => {
  const [indices, setIndices] = useState<MarketIndex[]>([])
  const [distribution, setDistribution] = useState<DistributionBin[]>([])
  const [sectors, setSectors] = useState<{ topGainers: SectorInfo[]; topLosers: SectorInfo[] }>({
    topGainers: [],
    topLosers: [],
  })
  const [stocks] = useState<MarketData[]>(getAllMarketData())

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      const [indicesData, distributionData, sectorData] = await Promise.all([
        queryMarketIndices(),
        queryMarketDistribution(),
        querySectorLeaderboard(),
      ])

      if (!cancelled) {
        setIndices(indicesData)
        setDistribution(distributionData)
        setSectors(sectorData)
      }
    }

    loadData()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-5">
      {/* 指数看板 */}
      <div className="grid grid-cols-3 gap-3">
        {indices.map((index) => (
          <IndexCard key={index.symbol} data={index} />
        ))}
      </div>

      {/* 涨跌分布柱状图 */}
      <MarketDistributionChart data={distribution} />

      {/* 行业板块排行 */}
      <SectorLeaderboard topGainers={sectors.topGainers} topLosers={sectors.topLosers} />

      {/* 市场股票列表 */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          市场行情
        </h3>
        {stocks.map((stock) => (
          <div
            key={stock.symbol}
            onClick={() => onSelectSymbol(stock.symbol)}
            className="cursor-pointer rounded-lg border border-border bg-surface p-3 transition-colors hover:bg-surface-hover"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-text">{stock.name}</div>
                <div className="text-xs text-text-muted">{stock.symbol}</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm font-bold text-text">
                  {stock.price.toFixed(2)}
                </div>
                <div
                  className={`flex items-center justify-end text-xs ${
                    stock.change >= 0 ? 'text-success' : 'text-danger'
                  }`}
                >
                  {stock.change >= 0 ? (
                    <TrendingUp className="mr-1 h-3 w-3" />
                  ) : (
                    <TrendingDown className="mr-1 h-3 w-3" />
                  )}
                  {stock.change >= 0 ? '+' : ''}
                  {stock.changePercent.toFixed(2)}%
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
