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

/** 意图类型列表 */
export const INTENT_TYPES: IntentType[] = [
  'market.query',
  'news.search',
  'strategy.backtest',
  'stock.profile',
  'general.chat',
  'session.manage',
  'preference.update',
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
    name: 'news.search',
    description: '搜索与股票或行业相关的新闻',
    parameters: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: '搜索关键词',
        },
        limit: {
          type: 'number',
          description: '返回条数，默认 5',
        },
      },
      required: ['keyword'],
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
]

/** 上下文保留轮数 */
export const MAX_CONTEXT_ROUNDS = 10

/** localStorage Key */
export const STORAGE_KEYS = {
  LLM_CONFIG: 'ainvest:llmConfig',
  SESSIONS: 'ainvest:sessions',
  CURRENT_SESSION_ID: 'ainvest:currentSessionId',
} as const

/** 文件路径常量 */
export const FILE_PATHS = {
  MEMORY: 'memory.json',
  SESSIONS_DIR: 'sessions',
} as const
