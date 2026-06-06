import React from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { DistributionBin } from '../../../services/mocks'

interface MarketDistributionChartProps {
  data: DistributionBin[]
}

/**
 * 涨跌分布横向柱状图
 * 展示全市场股票按涨跌幅区间的分布情况
 */
export const MarketDistributionChart: React.FC<MarketDistributionChartProps> = ({ data }) => {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        涨跌分布
      </h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis type="number" stroke="#9ca3af" fontSize={12} />
            <YAxis
              dataKey="label"
              type="category"
              stroke="#9ca3af"
              fontSize={11}
              width={70}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '6px',
                fontSize: '12px',
              }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={
                    entry.type === 'up'
                      ? '#22c55e'
                      : entry.type === 'down'
                        ? '#ef4444'
                        : '#6b7280'
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
