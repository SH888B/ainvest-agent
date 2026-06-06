import { registerTool } from './registry'
import { mockMarketQuery } from '../mocks'

/**
 * 行情查询工具
 */
registerTool(
  'market.query',
  'market.query',
  '查询股票行情数据',
  (args: Record<string, unknown>) => {
    const symbol = String(args.symbol || '')
    if (!symbol) {
      return '请提供股票代码'
    }

    const data = mockMarketQuery(symbol)
    if (!data) {
      return `未找到 ${symbol} 的行情数据（当前仅支持 Mock 数据）`
    }

    const direction = data.change >= 0 ? '涨' : '跌'
    return `【${data.name} (${data.symbol})】
当前价格：${data.price.toFixed(2)} 元
今日${direction}幅：${data.change >= 0 ? '+' : ''}${data.change.toFixed(2)} (${data.changePercent.toFixed(2)}%)
成交量：${(data.volume / 10000).toFixed(0)} 万手
市盈率 PE：${data.pe}
市净率 PB：${data.pb}`
  }
)
