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

/** 市场类型 */
export type MarketType = 'CN' | 'HK' | 'US'

/** 指数数据 */
export interface MarketIndex {
  symbol: string
  name: string
  nameCn: string
  point: number
  change: number
  changePercent: number
}

/** 涨跌分布区间 */
export interface DistributionBin {
  label: string
  count: number
  type: 'up' | 'down' | 'neutral'
}

/** 行业板块 */
export interface SectorInfo {
  name: string
  changePercent: number
}

/** 个股走势数据点 */
export interface StockPricePoint {
  date: string
  price: number
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
  '0700.HK': {
    symbol: '0700.HK',
    name: '腾讯控股',
    price: 382.4,
    change: 2.5,
    changePercent: 0.66,
    volume: 15000000,
    pe: 18.5,
    pb: 3.8,
  },
  '9988.HK': {
    symbol: '9988.HK',
    name: '阿里巴巴',
    price: 74.35,
    change: -1.2,
    changePercent: -1.58,
    volume: 28000000,
    pe: 15.2,
    pb: 1.6,
  },
  'NVDA': {
    symbol: 'NVDA',
    name: 'NVIDIA',
    price: 125.8,
    change: 3.52,
    changePercent: 2.88,
    volume: 350000000,
    pe: 65.0,
    pb: 55.0,
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
    '000858': {
      symbol: '000858',
      name: '五粮液',
      industry: '白酒',
      marketCap: '5600亿',
      description:
        '宜宾五粮液股份有限公司是中国浓香型白酒的典型代表，以五粮液及其系列酒的生产、销售为主业。',
      ceo: '曾从钦',
      founded: '1998-04-21',
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
    'TSLA': {
      symbol: 'TSLA',
      name: 'Tesla Inc.',
      industry: '新能源汽车',
      marketCap: '7600亿美元',
      description:
        '特斯拉公司是一家美国电动汽车和清洁能源公司，设计、制造和销售电动汽车、电池储能系统和太阳能产品。',
      ceo: 'Elon Musk',
      founded: '2003-07-01',
    },
    '0700.HK': {
      symbol: '0700.HK',
      name: '腾讯控股',
      industry: '互联网',
      marketCap: '3.8万亿港元',
      description:
        '腾讯控股有限公司是中国最大的互联网综合服务提供商之一，业务涵盖社交、游戏、金融科技、云计算等领域。',
      ceo: '马化腾',
      founded: '1998-11-11',
    },
    '9988.HK': {
      symbol: '9988.HK',
      name: '阿里巴巴',
      industry: '电商/云计算',
      marketCap: '1.6万亿港元',
      description:
        '阿里巴巴集团控股有限公司是全球领先的电子商务和云计算公司，业务覆盖零售、批发、物流、云计算等多个领域。',
      ceo: '吴泳铭',
      founded: '1999-06-28',
    },
    'NVDA': {
      symbol: 'NVDA',
      name: 'NVIDIA',
      industry: '半导体/AI',
      marketCap: '3.2万亿美元',
      description:
        '英伟达公司是全球领先的图形处理器（GPU）和人工智能计算平台制造商，产品广泛应用于游戏、数据中心、自动驾驶等领域。',
      ceo: 'Jensen Huang',
      founded: '1993-04-05',
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

/**
 * 基于种子字符串创建确定性随机数生成器
 */
const createSeededRandom = (seed: string) => {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }
  return () => {
    hash = (hash * 16807) % 2147483647
    return (hash - 1) / 2147483646
  }
}

/**
 * 基于当前价格反向生成 30 个交易日的模拟收盘价
 * 使用随机游走模型，确保最后一日价格收敛到当前价
 * 当提供 symbol 时，使用 seeded random 保证同一 symbol 走势稳定
 */
export function generatePriceHistory(
  currentPrice: number,
  symbol?: string,
  volatility: number = 0.02
): StockPricePoint[] {
  const days = 30
  const prices: number[] = new Array(days)
  prices[days - 1] = currentPrice

  const rng = symbol ? createSeededRandom(symbol + currentPrice.toFixed(2)) : Math.random

  for (let i = days - 2; i >= 0; i--) {
    const change = (rng() - 0.5) * 2 * volatility
    prices[i] = prices[i + 1] * (1 - change)
  }

  const result: StockPricePoint[] = []
  const today = new Date()
  for (let i = 0; i < days; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - (days - 1 - i))
    result.push({
      date: `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      price: Number(prices[i].toFixed(2)),
    })
  }
  return result
}

/**
 * 查询美股三大指数 Mock 数据
 */
export const queryMarketIndices = (): Promise<MarketIndex[]> => {
  return Promise.resolve([
    {
      symbol: 'DJI',
      name: 'Dow Jones',
      nameCn: '道琼斯',
      point: 42150.3,
      change: 175.2,
      changePercent: 0.42,
    },
    {
      symbol: 'IXIC',
      name: 'NASDAQ',
      nameCn: '纳斯达克',
      point: 18230.15,
      change: 158.6,
      changePercent: 0.88,
    },
    {
      symbol: 'SPX',
      name: 'S&P 500',
      nameCn: '标普500',
      point: 5875.2,
      change: 32.8,
      changePercent: 0.56,
    },
  ])
}

/**
 * 获取全市场涨跌分布 Mock 数据
 */
export const queryMarketDistribution = (): Promise<DistributionBin[]> => {
  return Promise.resolve([
    { label: '> +7%', count: 12, type: 'up' },
    { label: '+5% ~ +7%', count: 28, type: 'up' },
    { label: '+3% ~ +5%', count: 45, type: 'up' },
    { label: '0 ~ +3%', count: 1860, type: 'up' },
    { label: '0 ~ -3%', count: 1920, type: 'down' },
    { label: '-3% ~ -5%', count: 68, type: 'down' },
    { label: '-5% ~ -7%', count: 42, type: 'down' },
    { label: '< -7%', count: 25, type: 'down' },
  ])
}

/**
 * 获取行业板块排行 Mock 数据
 */
export const querySectorLeaderboard = (): Promise<{
  topGainers: SectorInfo[]
  topLosers: SectorInfo[]
}> => {
  const sectors: SectorInfo[] = [
    { name: '半导体', changePercent: 3.2 },
    { name: 'AI算力', changePercent: 2.8 },
    { name: '新能源汽车', changePercent: 2.5 },
    { name: '云计算', changePercent: 1.9 },
    { name: '生物医药', changePercent: 1.6 },
    { name: '通信设备', changePercent: 1.3 },
    { name: '消费电子', changePercent: 0.8 },
    { name: '互联网', changePercent: 0.5 },
    { name: '软件开发', changePercent: 0.3 },
    { name: '银行', changePercent: -0.4 },
    { name: '保险', changePercent: -0.7 },
    { name: '房地产', changePercent: -1.2 },
    { name: '建材', changePercent: -1.5 },
    { name: '钢铁', changePercent: -1.8 },
    { name: '煤炭', changePercent: -2.1 },
    { name: '石油', changePercent: -2.3 },
    { name: '电力', changePercent: -2.5 },
    { name: '交通运输', changePercent: -2.8 },
    { name: '食品饮料', changePercent: -3.0 },
    { name: '白酒', changePercent: -3.2 },
  ]

  const sorted = [...sectors].sort((a, b) => b.changePercent - a.changePercent)
  return Promise.resolve({
    topGainers: sorted.slice(0, 5),
    topLosers: sorted.slice(-5).reverse(),
  })
}

/**
 * 获取个股 30 日走势 Mock 数据
 */
export const queryStockChart = (symbol: string): Promise<StockPricePoint[]> => {
  const stock = MOCK_STOCKS[symbol]
  if (!stock) {
    return Promise.resolve(generatePriceHistory(100, symbol))
  }
  return Promise.resolve(generatePriceHistory(stock.price, symbol))
}
