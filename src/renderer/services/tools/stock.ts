import { registerTool } from './registry'
import { mockStockProfile } from '../mocks'

/**
 * 个股档案工具
 */
registerTool(
  'stock.profile',
  'stock.profile',
  '查询个股基本面档案',
  (args: Record<string, unknown>) => {
    const symbol = String(args.symbol || '')
    if (!symbol) {
      return '请提供股票代码'
    }

    const profile = mockStockProfile(symbol)

    return `【公司档案】
名称：${profile.name}
股票代码：${profile.symbol}
所属行业：${profile.industry}
市值：${profile.marketCap}
CEO：${profile.ceo}
成立时间：${profile.founded}

公司简介：
${profile.description}`
  }
)
