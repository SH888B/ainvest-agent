import React, { useState } from 'react'
import { MarketOverview } from './MarketOverview'
import { WatchList } from './WatchList'
import { StockDetail } from './StockDetail'

type MarketTab = 'overview' | 'watchlist' | 'detail'

/**
 * 行情看板主容器
 * 支持总览/自选股/个股详情三个标签页切换
 */
export const MarketPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<MarketTab>('overview')
  const [selectedSymbol, setSelectedSymbol] = useState<string>('')

  const handleSelectSymbol = (symbol: string) => {
    setSelectedSymbol(symbol)
    setActiveTab('detail')
  }

  return (
    <div className="flex h-full flex-col">
      {/* 标签导航 */}
      <div className="flex border-b border-border">
        {[
          { key: 'overview' as MarketTab, label: '总览' },
          { key: 'watchlist' as MarketTab, label: '自选股' },
          { key: 'detail' as MarketTab, label: '个股详情' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-b-2 border-primary text-primary'
                : 'text-text-muted hover:text-text'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'overview' && <MarketOverview onSelectSymbol={handleSelectSymbol} />}
        {activeTab === 'watchlist' && <WatchList onSelectSymbol={handleSelectSymbol} />}
        {activeTab === 'detail' && <StockDetail symbol={selectedSymbol} />}
      </div>
    </div>
  )
}
