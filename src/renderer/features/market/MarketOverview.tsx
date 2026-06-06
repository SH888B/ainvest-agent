import React from 'react'
import { getAllMarketData } from '../../services/mocks'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface MarketOverviewProps {
  onSelectSymbol: (symbol: string) => void
}

/**
 * 行情总览
 * 展示全部 Mock 股票的简要行情卡片
 */
export const MarketOverview: React.FC<MarketOverviewProps> = ({ onSelectSymbol }) => {
  const stocks = getAllMarketData()

  return (
    <div className="space-y-3">
      <h2 className="mb-4 text-lg font-semibold text-text">市场行情</h2>
      {stocks.map((stock) => (
        <div
          key={stock.symbol}
          onClick={() => onSelectSymbol(stock.symbol)}
          className="cursor-pointer rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-surface-hover"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-bold text-text">{stock.name}</div>
              <div className="text-xs text-text-muted">{stock.symbol}</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-mono font-bold text-text">
                {stock.price.toFixed(2)}
              </div>
              <div
                className={`flex items-center justify-end text-sm font-medium ${
                  stock.change >= 0 ? 'text-success' : 'text-danger'
                }`}
              >
                {stock.change >= 0 ? (
                  <TrendingUp className="mr-1 h-4 w-4" />
                ) : (
                  <TrendingDown className="mr-1 h-4 w-4" />
                )}
                <span>
                  {stock.change >= 0 ? '+' : ''}
                  {stock.change.toFixed(2)} ({stock.changePercent.toFixed(2)}%)
                </span>
              </div>
            </div>
          </div>
          <div className="mt-2 flex gap-4 text-xs text-text-muted">
            <span>成交量: {(stock.volume / 10000).toFixed(0)}万</span>
            <span>PE: {stock.pe}</span>
            <span>PB: {stock.pb}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
