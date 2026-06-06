import { registerTool } from './registry'
import { mockStrategyBacktest } from '../mocks'

/**
 * 策略回测工具
 */
registerTool(
  'strategy.backtest',
  'strategy.backtest',
  '对投资策略进行历史回测',
  (args: Record<string, unknown>) => {
    const strategyName = String(args.strategyName || '默认策略')
    const symbol = String(args.symbol || '')
    const startDate = String(args.startDate || '2025-01-01')
    const endDate = String(args.endDate || '2025-12-31')

    if (!symbol) {
      return '请提供回测标的代码'
    }

    const result = mockStrategyBacktest(strategyName, symbol, startDate, endDate)

    return `【策略回测结果】
策略名称：${result.strategyName}
回测标的：${result.symbol}
回测区间：${startDate} 至 ${endDate}
年化收益率：${result.annualReturn.toFixed(2)}%
最大回撤：${result.maxDrawdown.toFixed(2)}%
夏普比率：${result.sharpeRatio.toFixed(2)}
交易次数：${result.trades} 次

（注：以上为 Mock 回测数据，仅供演示）`
  }
)
