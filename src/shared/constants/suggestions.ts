/**
 * 推荐问话配置
 * v3.0.0: 空 Session 时展示的问题卡片
 */

export interface Suggestion {
  id: string
  text: string
  intent: string
  icon: string
}

export const DEFAULT_SUGGESTIONS: Suggestion[] = [
  { id: 's1', text: '查一下贵州茅台的行情', intent: 'market.query', icon: 'TrendingUp' },
  { id: 's2', text: '最近有什么新能源行业新闻', intent: 'news.search', icon: 'Newspaper' },
  { id: 's3', text: '茅台公司是做什么的', intent: 'stock.profile', icon: 'FileText' },
  { id: 's4', text: '回测一下趋势策略', intent: 'strategy.backtest', icon: 'Calculator' },
]
