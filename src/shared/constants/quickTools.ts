/**
 * 快捷工具配置
 * v3.0.0: 输入框上方的快速填充按钮
 */

export interface QuickTool {
  id: string
  label: string
  icon: string
  template: string
  placeholders: string[]
}

export const QUICK_TOOLS: QuickTool[] = [
  {
    id: 'market.query',
    label: '查行情',
    icon: 'TrendingUp',
    template: '查一下 [股票代码] 的行情',
    placeholders: ['[股票代码]'],
  },
  {
    id: 'news.search',
    label: '搜新闻',
    icon: 'Newspaper',
    template: '搜一下 [关键词] 的新闻',
    placeholders: ['[关键词]'],
  },
  {
    id: 'stock.profile',
    label: '看档案',
    icon: 'FileText',
    template: '看看 [股票代码] 的公司档案',
    placeholders: ['[股票代码]'],
  },
  {
    id: 'strategy.backtest',
    label: '做回测',
    icon: 'Calculator',
    template: '对 [股票代码] 做 [策略名] 回测',
    placeholders: ['[股票代码]', '[策略名]'],
  },
]
