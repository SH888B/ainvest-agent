/**
 * 共享常量定义
 */

import { ToolDefinition, IntentType } from '../types'

/** 默认 API 基础地址（智谱 GLM） */
export const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4'

/** 默认模型 */
export const DEFAULT_MODEL = 'glm-5.1'

/** 可选模型列表 */
export const AVAILABLE_MODELS = [
  'glm-5.1',
  'glm-5v-turbo',
  'glm-5v',
  'glm-5',
  'glm-4-plus',
  'glm-4',
  'kimi-k2.6',
  'moonshot-v1-8k',
]

/** 默认 Temperature */
export const DEFAULT_TEMPERATURE = 0.7

/** 默认 Embedding 模型 */
export const DEFAULT_EMBEDDING_MODEL = 'embedding-3'

/** 默认 Embedding 向量维度 */
export const DEFAULT_EMBEDDING_DIMENSIONS = 512

/** 可选 Embedding 维度列表 */
export const EMBEDDING_DIMENSIONS_OPTIONS = [256, 512, 1024, 2048] as const

/** 意图类型列表（v6.0.1: news.search 已合并到 web.browse） */
export const INTENT_TYPES: IntentType[] = [
  'market.query',
  'strategy.backtest',
  'stock.profile',
  'general.chat',
  'session.manage',
  'preference.update',
  'shell.execute',
  'web.browse',
  'unknown',
]

/** 工具定义列表 */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'market.query',
    description: '查询股票行情数据，如价格、涨跌幅、成交量等',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: '股票代码，如 600519、AAPL',
        },
        metric: {
          type: 'string',
          description: '查询指标：price/volume/change/pe/pb',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'strategy.backtest',
    description: '对投资策略进行历史回测',
    parameters: {
      type: 'object',
      properties: {
        strategyName: {
          type: 'string',
          description: '策略名称',
        },
        symbol: {
          type: 'string',
          description: '回测标的代码',
        },
        startDate: {
          type: 'string',
          description: '开始日期，格式 YYYY-MM-DD',
        },
        endDate: {
          type: 'string',
          description: '结束日期，格式 YYYY-MM-DD',
        },
      },
      required: ['strategyName', 'symbol'],
    },
  },
  {
    name: 'stock.profile',
    description: '查询个股基本面档案',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: '股票代码',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'browser.open',
    description: '搜索或打开金融网站并提取内容，用于获取实时信息。默认通过百度搜索获取最全面的结果。',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: '要访问的网页 URL（如果已知完整 URL）',
        },
        query: {
          type: 'string',
          description: '搜索关键词（如"宁德时代 研报"），系统自动构造搜索 URL',
        },
        domain: {
          type: 'string',
          description: '目标网站域名（如 xueqiu.com、eastmoney.com）',
        },
        action: {
          type: 'string',
          enum: ['snapshot', 'screenshot'],
          description: '提取方式：snapshot(文本) 或 screenshot(截图)',
        },
      },
    },
  },
]

/** 上下文保留轮数 */
export const MAX_CONTEXT_ROUNDS = 10

/** localStorage Key */
export const STORAGE_KEYS = {
  LLM_CONFIG: 'ainvest:llmConfig',
  SESSIONS: 'ainvest:sessions',
  CURRENT_SESSION_ID: 'ainvest:currentSessionId',
  ARCHIVE_STATE: 'ainvest:archiveState',
} as const

/** 浏览器自动化默认域名白名单 */
export const BROWSER_DOMAIN_WHITELIST = [
  'baidu.com',       // 通用搜索引擎，SSR 渲染，提取最可靠
  'xueqiu.com',
  'eastmoney.com',
  'cls.cn',
  '10jqka.com.cn',
  'sina.com.cn',
  'cninfo.com.cn',
  'cs.com.cn',
  'hexun.com',
] as const

/** 文件路径常量 */
export const FILE_PATHS = {
  MEMORY: 'memory.json',
  SESSIONS_DIR: 'sessions',
} as const
