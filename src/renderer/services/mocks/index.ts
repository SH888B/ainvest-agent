/**
 * Mock 数据层
 * 提供行情、新闻、策略回测、个股档案的 Mock 数据
 */

export interface MarketData {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  volume: number
  pe: number
  pb: number
}

export interface NewsItem {
  id: string
  title: string
  source: string
  time: string
  summary: string
}

export interface BacktestResult {
  strategyName: string
  symbol: string
  annualReturn: number
  maxDrawdown: number
  sharpeRatio: number
  trades: number
}

export interface StockProfile {
  symbol: string
  name: string
  industry: string
  marketCap: string
  description: string
  ceo: string
  founded: string
}

/** Mock 股票池 */
const MOCK_STOCKS: Record<string, MarketData> = {
  '600519': {
    symbol: '600519',
    name: '贵州茅台',
    price: 1688.88,
    change: 12.5,
    changePercent: 0.74,
    volume: 2850000,
    pe: 28.5,
    pb: 8.2,
  },
  '000858': {
    symbol: '000858',
    name: '五粮液',
    price: 145.6,
    change: -2.3,
    changePercent: -1.56,
    volume: 15200000,
    pe: 18.2,
    pb: 4.5,
  },
  'AAPL': {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    price: 189.52,
    change: 1.23,
    changePercent: 0.65,
    volume: 45200000,
    pe: 29.8,
    pb: 45.2,
  },
  'TSLA': {
    symbol: 'TSLA',
    name: 'Tesla Inc.',
    price: 238.45,
    change: -5.67,
    changePercent: -2.32,
    volume: 98200000,
    pe: 62.4,
    pb: 12.8,
  },
}

/**
 * 查询行情 Mock
 */
export const mockMarketQuery = (symbol: string, _metric?: string): MarketData | null => {
  return MOCK_STOCKS[symbol] || null
}

/**
 * 搜索新闻 Mock
 */
export const mockNewsSearch = (keyword: string, limit = 5): NewsItem[] => {
  const allNews: NewsItem[] = [
    {
      id: '1',
      title: `${keyword}：市场关注度持续升温，机构看好后续表现`,
      source: '财联社',
      time: '2026-06-06 10:30',
      summary: `近期${keyword}相关板块表现活跃，多家券商发布研报给予买入评级。`,
    },
    {
      id: '2',
      title: `${keyword}发布最新财报，营收同比增长 23%`,
      source: '华尔街见闻',
      time: '2026-06-05 18:00',
      summary: '公司财报显示核心业务稳健增长，毛利率提升至 42%。',
    },
    {
      id: '3',
      title: `${keyword}获北向资金连续 5 日净流入`,
      source: '东方财富',
      time: '2026-06-05 15:30',
      summary: '外资持续加仓，累计净流入超 12 亿元。',
    },
    {
      id: '4',
      title: `行业快讯：${keyword}所属板块政策利好`,
      source: '证券时报',
      time: '2026-06-04 09:15',
      summary: '相关部门发布支持性政策，行业龙头有望受益。',
    },
    {
      id: '5',
      title: `${keyword}：机构调研纪要`,
      source: '中金公司',
      time: '2026-06-03 14:00',
      summary: '公司管理层透露下半年产能扩张计划，预计营收增长 30%。',
    },
  ]
  return allNews.slice(0, limit)
}

/**
 * 策略回测 Mock
 */
export const mockStrategyBacktest = (
  strategyName: string,
  symbol: string,
  _startDate?: string,
  _endDate?: string
): BacktestResult => {
  return {
    strategyName,
    symbol,
    annualReturn: 15.6 + Math.random() * 10,
    maxDrawdown: -(8 + Math.random() * 12),
    sharpeRatio: 1.2 + Math.random() * 0.8,
    trades: Math.floor(20 + Math.random() * 80),
  }
}

/**
 * 个股档案 Mock
 */
export const mockStockProfile = (symbol: string): StockProfile | null => {
  const profiles: Record<string, StockProfile> = {
    '600519': {
      symbol: '600519',
      name: '贵州茅台',
      industry: '白酒',
      marketCap: '2.1万亿',
      description:
        '贵州茅台酒股份有限公司是中国最大的白酒生产企业，主导产品贵州茅台酒是世界三大蒸馏名酒之一。',
      ceo: '丁雄军',
      founded: '1999-11-20',
    },
    'AAPL': {
      symbol: 'AAPL',
      name: 'Apple Inc.',
      industry: '消费电子',
      marketCap: '2.9万亿美元',
      description:
        '苹果公司是一家美国跨国科技公司，设计、开发和销售消费电子产品、计算机软件和在线服务。',
      ceo: 'Tim Cook',
      founded: '1976-04-01',
    },
  }
  return profiles[symbol] || {
    symbol,
    name: `${symbol} (Mock)`,
    industry: '未知',
    marketCap: '-',
    description: '暂无详细档案信息',
    ceo: '-',
    founded: '-',
  }
}

/** 获取全部 Mock 行情 */
export const getAllMarketData = (): MarketData[] => Object.values(MOCK_STOCKS)
