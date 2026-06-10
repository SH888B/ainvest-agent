import React, { useEffect, useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { queryStockChart } from '../../../services/mocks'
import type { StockPricePoint } from '../../../services/mocks'

interface StockChartProps {
  symbol: string
  isUp: boolean
}

/**
 * 个股 30 日走势图
 * 使用 recharts AreaChart 展示收盘价走势
 */
export const StockChart: React.FC<StockChartProps> = ({ symbol, isUp }) => {
  const [data, setData] = useState<StockPricePoint[]>([])

  useEffect(() => {
    let cancelled = false

    async function loadChart() {
      const chartData = await queryStockChart(symbol)
      if (!cancelled) {
        setData(chartData)
      }
    }

    loadChart()
    return () => {
      cancelled = true
    }
  }, [symbol])

  const color = isUp ? '#10b981' : '#f43f5e'

  if (data.length === 0) {
    return (
      <div className="mt-4 h-52 animate-pulse rounded-lg bg-surface">
        <div className="flex h-full items-center justify-center text-xs text-text-muted">
          加载走势数据中...
        </div>
      </div>
    )
  }

  return (
    <div className="mt-4">
      <h4 className="mb-2 text-xs font-semibold text-text-muted">30日走势</h4>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id={`gradient-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" stroke="#9ca3af" fontSize={11} />
            <YAxis stroke="#9ca3af" fontSize={11} domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '6px',
                fontSize: '12px',
              }}
              formatter={(value) => [`${Number(value).toFixed(2)}`, '收盘价']}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke={color}
              strokeWidth={2}
              fill={`url(#gradient-${symbol})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
