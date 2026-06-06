import React, { useState } from 'react'
import { getAllMarketData, mockMarketQuery } from '../../services/mocks'
import { Plus, X, TrendingUp, TrendingDown } from 'lucide-react'

interface WatchListProps {
  onSelectSymbol: (symbol: string) => void
}

/**
 * 自选股列表
 * 支持添加/删除自选股（本地状态）
 */
export const WatchList: React.FC<WatchListProps> = ({ onSelectSymbol }) => {
  const [watchSymbols, setWatchSymbols] = useState<string[]>(['600519', 'AAPL'])
  const [inputSymbol, setInputSymbol] = useState('')

  const handleAdd = () => {
    const symbol = inputSymbol.trim()
    if (!symbol || watchSymbols.includes(symbol)) return
    // 简单验证：尝试查询一下
    const data = mockMarketQuery(symbol)
    if (data) {
      setWatchSymbols((prev) => [...prev, symbol])
      setInputSymbol('')
    } else {
      // 也允许添加，后续可能通过真实 API 获取
      setWatchSymbols((prev) => [...prev, symbol])
      setInputSymbol('')
    }
  }

  const handleRemove = (symbol: string) => {
    setWatchSymbols((prev) => prev.filter((s) => s !== symbol))
  }

  return (
    <div className="space-y-3">
      <h2 className="mb-4 text-lg font-semibold text-text">自选股</h2>

      {/* 添加输入框 */}
      <div className="flex gap-2">
        <input
          type="text"
          value={inputSymbol}
          onChange={(e) => setInputSymbol(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="输入股票代码"
          className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
        />
        <button
          onClick={handleAdd}
          className="flex items-center rounded-md bg-primary px-3 py-2 text-sm text-white hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* 自选股列表 */}
      <div className="space-y-2">
        {watchSymbols.map((symbol) => {
          const data = mockMarketQuery(symbol)
          return (
            <div
              key={symbol}
              className="flex items-center justify-between rounded-lg border border-border bg-surface p-3 hover:bg-surface-hover"
            >
              <div
                className="flex-1 cursor-pointer"
                onClick={() => onSelectSymbol(symbol)}
              >
                {data ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-text">{data.name}</div>
                      <div className="text-xs text-text-muted">{data.symbol}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm font-bold text-text">
                        {data.price.toFixed(2)}
                      </div>
                      <div
                        className={`flex items-center justify-end text-xs ${
                          data.change >= 0 ? 'text-success' : 'text-danger'
                        }`}
                      >
                        {data.change >= 0 ? (
                          <TrendingUp className="mr-1 h-3 w-3" />
                        ) : (
                          <TrendingDown className="mr-1 h-3 w-3" />
                        )}
                        {data.change >= 0 ? '+' : ''}
                        {data.changePercent.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-text-muted">{symbol}（暂无数据）</div>
                )}
              </div>
              <button
                onClick={() => handleRemove(symbol)}
                className="ml-2 rounded p-1 text-text-muted hover:text-danger"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
