import React from 'react'
import { mockStockProfile, mockMarketQuery } from '../../services/mocks'
import { StockChart } from './components/StockChart'
import { TrendingUp, TrendingDown, Building2, User, Calendar } from 'lucide-react'

interface StockDetailProps {
  symbol: string
}

/**
 * 个股详情
 * 展示选中股票的基本面、行情数据和 30 日走势图
 */
export const StockDetail: React.FC<StockDetailProps> = ({ symbol }) => {
  const profile = mockStockProfile(symbol)
  const market = mockMarketQuery(symbol)

  if (!symbol) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted">
        请在总览或自选股中选择一只股票查看详情
      </div>
    )
  }

  const isUp = market ? market.change >= 0 : true

  return (
    <div className="space-y-4">
      {/* 头部信息 */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-text">{profile?.name || symbol}</h2>
            <div className="text-sm text-text-muted">{symbol}</div>
          </div>
          {market && (
            <div className="text-right">
              <div className="text-2xl font-mono font-bold text-text">
                {market.price.toFixed(2)}
              </div>
              <div
                className={`flex items-center justify-end text-sm font-medium ${
                  market.change >= 0 ? 'text-success' : 'text-danger'
                }`}
              >
                {market.change >= 0 ? (
                  <TrendingUp className="mr-1 h-4 w-4" />
                ) : (
                  <TrendingDown className="mr-1 h-4 w-4" />
                )}
                {market.change >= 0 ? '+' : ''}
                {market.change.toFixed(2)} ({market.changePercent.toFixed(2)}%)
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 行情指标 */}
      {market && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-surface p-3">
            <div className="text-xs text-text-muted">成交量</div>
            <div className="mt-1 font-mono text-sm text-text">
              {(market.volume / 10000).toFixed(0)}万
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface p-3">
            <div className="text-xs text-text-muted">市盈率 PE</div>
            <div className="mt-1 font-mono text-sm text-text">{market.pe}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface p-3">
            <div className="text-xs text-text-muted">市净率 PB</div>
            <div className="mt-1 font-mono text-sm text-text">{market.pb}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface p-3">
            <div className="text-xs text-text-muted">涨跌额</div>
            <div
              className={`mt-1 font-mono text-sm ${
                market.change >= 0 ? 'text-success' : 'text-danger'
              }`}
            >
              {market.change >= 0 ? '+' : ''}
              {market.change.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {/* 基本面信息 */}
      {profile && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-text">公司档案</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center text-text-muted">
              <Building2 className="mr-2 h-4 w-4" />
              <span>行业: {profile.industry}</span>
            </div>
            <div className="flex items-center text-text-muted">
              <Calendar className="mr-2 h-4 w-4" />
              <span>成立: {profile.founded}</span>
            </div>
            <div className="flex items-center text-text-muted">
              <User className="mr-2 h-4 w-4" />
              <span>CEO: {profile.ceo}</span>
            </div>
            <div className="flex items-center text-text-muted">
              <span className="ml-6">市值: {profile.marketCap}</span>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-text-muted">{profile.description}</p>
        </div>
      )}

      {/* 30 日走势图 */}
      <StockChart symbol={symbol} isUp={isUp} />
    </div>
  )
}
