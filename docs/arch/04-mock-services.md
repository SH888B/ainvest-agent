# 04. Mock 服务层与工具调用框架

> **目标**：读完本文档，你能知道 Agent 是怎么"调用工具"的，Mock 数据是怎么生成的，以及如果以后要接入真实 API 该怎么替换。

---

## 一、架构决策：Mock 放在渲染进程

**决策**：v1 的 Mock 服务层放在**渲染进程**内，不经过 IPC。

**为什么？**
1. **开发速度快**：不需要写 IPC 通道、主进程处理器、Preload 暴露，直接 import 调用
2. **调试方便**：Mock 函数就在 Chrome DevTools 里，可以打断点
3. **v2 迁移成本低**：Mock 服务被封装在 `services/mock/` 目录，v2 只需替换这个目录的实现

**v2 怎么迁移？**
```
v1: 组件 → Store → Agent Engine → Mock Service（渲染进程内）
v2: 组件 → Store → Agent Engine → IPC → Real API Service（主进程内）
                        ↑
                        只改这一层
```

---

## 二、工具调用框架总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        工具调用流程                               │
│                                                                  │
│  用户输入: "查询贵州茅台行情"                                     │
│        │                                                         │
│        ▼                                                         │
│  ┌─────────────────┐                                             │
│  │ intentRecognizer │  识别意图 → { toolId: 'market.query' }      │
│  └────────┬────────┘                                             │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                             │
│  │   agentEngine    │  构建参数 → { symbol: '600519.SH' }         │
│  └────────┬────────┘                                             │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                             │
│  │  Tool Registry   │  查找工具 → marketMock.queryStock()         │
│  │  (工具注册表)     │                                             │
│  └────────┬────────┘                                             │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                             │
│  │   Mock Service   │  生成 Mock 数据 → MarketData 对象           │
│  │  (marketMock.ts) │                                             │
│  └────────┬────────┘                                             │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                             │
│  │   Chat Store     │  更新消息，展示结果卡片                      │
│  └─────────────────┘                                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 三、工具注册表（Tool Registry）

所有工具必须先在注册表中登记，Agent 引擎通过 `toolId` 查找对应的执行函数。

```typescript
// src/renderer/services/mock/index.ts

import { marketQuery } from './marketMock';
import { newsSearch } from './newsMock';
import { strategyBacktest } from './strategyMock';
import { stockProfileQuery } from './stockProfileMock';

// ============================================================
// 工具定义接口
// ============================================================

export interface ToolDefinition {
  id: string;           // 唯一标识，如 'market.query'
  name: string;         // 中文名称，如 '行情查询'
  description: string;  // 功能描述
  parameters: ToolParameter[];
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  description: string;
}

/**
 * 工具执行函数签名
 * 所有工具函数都必须符合这个签名
 */
export type ToolExecutor = (
  params: Record<string, unknown>
) => Promise<unknown>;

// ============================================================
// 工具注册表
// ============================================================

interface ToolRegistryEntry {
  definition: ToolDefinition;
  executor: ToolExecutor;
}

const registry = new Map<string, ToolRegistryEntry>();

/**
 * 注册工具
 * @param definition 工具定义（元数据）
 * @param executor 工具执行函数
 */
export function registerTool(
  definition: ToolDefinition,
  executor: ToolExecutor
): void {
  if (registry.has(definition.id)) {
    console.warn(`工具 ${definition.id} 已被注册，将被覆盖`);
  }
  registry.set(definition.id, { definition, executor });
}

/**
 * 获取工具执行函数
 * @param toolId 工具 ID
 * @returns 工具执行函数
 * @throws 如果工具不存在则抛出错误
 */
export function getTool(toolId: string): ToolExecutor {
  const entry = registry.get(toolId);
  if (!entry) {
    throw new Error(`未知工具: ${toolId}`);
  }
  return entry.executor;
}

/**
 * 获取工具定义（用于展示）
 */
export function getToolDefinition(toolId: string): ToolDefinition | undefined {
  return registry.get(toolId)?.definition;
}

/**
 * 获取所有已注册工具的定义列表
 */
export function getAllToolDefinitions(): ToolDefinition[] {
  return Array.from(registry.values()).map((entry) => entry.definition);
}

// ============================================================
// 注册 v1 所有工具
// ============================================================

registerTool(
  {
    id: 'market.query',
    name: '行情查询',
    description: '查询指定股票的实时行情数据',
    parameters: [
      {
        name: 'symbol',
        type: 'string',
        required: true,
        description: '股票代码，如 600519.SH',
      },
    ],
  },
  marketQuery
);

registerTool(
  {
    id: 'news.search',
    name: '新闻检索',
    description: '搜索股票或行业相关的新闻',
    parameters: [
      {
        name: 'keyword',
        type: 'string',
        required: true,
        description: '搜索关键词，如"贵州茅台"或"新能源"',
      },
      {
        name: 'limit',
        type: 'number',
        required: false,
        description: '返回条数，默认 5',
      },
    ],
  },
  newsSearch
);

registerTool(
  {
    id: 'strategy.backtest',
    name: '策略回测',
    description: '对简单策略进行历史回测',
    parameters: [
      {
        name: 'strategy',
        type: 'string',
        required: true,
        description: '策略名称，如"MA5交叉"',
      },
      {
        name: 'symbol',
        type: 'string',
        required: true,
        description: '股票代码',
      },
    ],
  },
  strategyBacktest
);

registerTool(
  {
    id: 'stock.profile',
    name: '股票档案',
    description: '查询公司基本信息和财务指标',
    parameters: [
      {
        name: 'symbol',
        type: 'string',
        required: true,
        description: '股票代码',
      },
    ],
  },
  stockProfileQuery
);
```

---

## 四、各 Mock 服务详细接口

### 4.1 行情查询（marketMock.ts）

```typescript
// src/renderer/services/mock/marketMock.ts

import type { MarketData, IndexData } from '@/types/market';

// ============================================================
// Mock 数据仓库
// ============================================================

/** 预设的股票数据池 */
const STOCK_POOL: Record<string, { name: string; basePrice: number; industry: string }> = {
  '600519.SH': { name: '贵州茅台', basePrice: 1688.0, industry: '白酒' },
  '000858.SZ': { name: '五粮液', basePrice: 158.0, industry: '白酒' },
  '300750.SZ': { name: '宁德时代', basePrice: 210.5, industry: '电池' },
  '002594.SZ': { name: '比亚迪', basePrice: 268.0, industry: '汽车' },
  '000333.SZ': { name: '美的集团', basePrice: 65.0, industry: '家电' },
  '000001.SZ': { name: '平安银行', basePrice: 11.5, industry: '银行' },
  '601318.SH': { name: '中国平安', basePrice: 48.0, industry: '保险' },
  '601012.SH': { name: '隆基绿能', basePrice: 22.0, industry: '光伏' },
  '600036.SH': { name: '招商银行', basePrice: 35.0, industry: '银行' },
  '002415.SZ': { name: '海康威视', basePrice: 32.0, industry: '电子' },
};

/** 主要指数数据 */
const INDEX_DATA: Record<string, { name: string; basePoint: number }> = {
  '000001.SH': { name: '上证指数', basePoint: 3380.0 },
  '399001.SZ': { name: '深证成指', basePoint: 10890.0 },
  '399006.SZ': { name: '创业板指', basePoint: 2250.0 },
};

// ============================================================
// 辅助函数：生成随机波动
// ============================================================

function generateFluctuation(base: number, volatility: number = 0.02): number {
  const change = (Math.random() - 0.5) * 2 * volatility;
  return base * (1 + change);
}

function formatNumber(num: number, decimals: number = 2): number {
  return Number(num.toFixed(decimals));
}

// ============================================================
// 工具函数：行情查询
// ============================================================

/**
 * 查询单只股票实时行情
 * @param params.symbol 股票代码，如 '600519.SH'
 * @returns MarketData 行情数据
 */
export async function marketQuery(params: Record<string, unknown>): Promise<MarketData> {
  const symbol = params.symbol as string;
  const stock = STOCK_POOL[symbol];

  if (!stock) {
    throw new Error(`未找到股票: ${symbol}`);
  }

  // 模拟延迟（100-300ms）
  await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));

  // 生成带随机波动的价格
  const price = generateFluctuation(stock.basePrice, 0.015);
  const change = price - stock.basePrice;
  const changePercent = (change / stock.basePrice) * 100;

  return {
    symbol,
    name: stock.name,
    price: formatNumber(price),
    change: formatNumber(change),
    changePercent: formatNumber(changePercent, 2),
    volume: Math.floor(Math.random() * 1000000) + 50000,
    marketCap: formatNumber(price * 1000000000, 0), // 简化：假设 10 亿股
    turnover: Math.floor(Math.random() * 500000),
    turnoverRate: formatNumber(Math.random() * 0.01, 4),
    updateTime: new Date().toISOString(),
  };
}

/**
 * 查询主要指数行情
 * @returns IndexData[] 指数列表
 */
export async function queryIndices(): Promise<IndexData[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));

  return Object.entries(INDEX_DATA).map(([symbol, data]) => {
    const point = generateFluctuation(data.basePoint, 0.008);
    const change = point - data.basePoint;
    return {
      symbol,
      name: data.name,
      point: formatNumber(point, 2),
      change: formatNumber(change, 2),
      changePercent: formatNumber((change / data.basePoint) * 100, 2),
    };
  });
}

/**
 * 查询自选股列表行情
 * @param symbols 股票代码数组
 * @returns MarketData[]
 */
export async function queryWatchlist(symbols: string[]): Promise<MarketData[]> {
  const results = await Promise.all(
    symbols.map((symbol) => marketQuery({ symbol }))
  );
  return results;
}
```

**返回类型定义**：

```typescript
// src/renderer/types/market.ts

export interface MarketData {
  symbol: string;           // 股票代码
  name: string;             // 股票名称
  price: number;            // 当前价格
  change: number;           // 涨跌额
  changePercent: number;    // 涨跌幅（%）
  volume: number;           // 成交量（手）
  marketCap: number;        // 市值
  turnover: number;         // 成交额
  turnoverRate: number;     // 换手率
  updateTime: string;       // 更新时间 ISO 字符串
}

export interface IndexData {
  symbol: string;
  name: string;
  point: number;            // 指数点数
  change: number;
  changePercent: number;
}
```

---

### 4.2 新闻检索（newsMock.ts）

```typescript
// src/renderer/services/mock/newsMock.ts

import type { NewsItem } from '@/types/tool';

// ============================================================
// Mock 新闻数据库
// ============================================================

const NEWS_TEMPLATES: Record<string, string[]> = {
  贵州茅台: [
    '贵州茅台发布三季度业绩报告，净利润同比增长 15%',
    '茅台酒批价稳中有升，经销商库存处于低位',
    '白酒板块整体走强，贵州茅台领涨',
    '茅台冰淇淋推出新口味，跨界营销持续发力',
    '外资持续加仓贵州茅台，北向资金净流入',
  ],
  宁德时代: [
    '宁德时代发布新一代麒麟电池，续航里程突破 1000 公里',
    '宁德时代与特斯拉签订长期供货协议',
    '锂电池原材料价格回落，宁德时代毛利率有望改善',
    '宁德时代欧洲工厂正式投产',
    '储能业务成宁德时代第二增长曲线',
  ],
  新能源: [
    '新能源车企销量创新高，渗透率突破 40%',
    '光伏组件价格持续下降，装机量超预期',
    '国家发布新能源补贴政策延续通知',
    '风电装机量创历史新高',
    '氢能源产业规划正式发布',
  ],
  央行: [
    '央行降准 0.5 个百分点，释放流动性约 1 万亿元',
    'LPR 利率维持不变，符合市场预期',
    '央行开展逆回购操作，维护流动性合理充裕',
  ],
};

const SOURCES = ['财联社', '证券时报', '上海证券报', '华尔街见闻', '雪球'];

// ============================================================
// 工具函数：新闻检索
// ============================================================

/**
 * 搜索新闻
 * @param params.keyword 搜索关键词
 * @param params.limit 返回条数（默认 5）
 * @returns NewsItem[]
 */
export async function newsSearch(params: Record<string, unknown>): Promise<NewsItem[]> {
  const keyword = params.keyword as string;
  const limit = (params.limit as number) ?? 5;

  await new Promise((resolve) => setTimeout(resolve, 150));

  // 查找匹配的新闻模板
  const matchedKey = Object.keys(NEWS_TEMPLATES).find((k) => keyword.includes(k)) ?? '央行';
  const templates = NEWS_TEMPLATES[matchedKey] ?? NEWS_TEMPLATES['央行'];

  // 生成新闻列表
  return templates.slice(0, limit).map((title, index) => ({
    id: `news-${Date.now()}-${index}`,
    title,
    summary: `${title}。据相关分析人士指出，该消息对市场影响偏正面，投资者可密切关注后续进展。`,
    source: SOURCES[Math.floor(Math.random() * SOURCES.length)],
    publishTime: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    url: '#',
  }));
}

/**
 * 获取单只股票的相关新闻
 * @param symbol 股票代码
 * @returns NewsItem[]
 */
export async function getStockNews(symbol: string): Promise<NewsItem[]> {
  const stockName = getStockNameFromSymbol(symbol);
  return newsSearch({ keyword: stockName, limit: 8 });
}

function getStockNameFromSymbol(symbol: string): string {
  const map: Record<string, string> = {
    '600519.SH': '贵州茅台',
    '000858.SZ': '五粮液',
    '300750.SZ': '宁德时代',
    '002594.SZ': '比亚迪',
  };
  return map[symbol] ?? symbol;
}
```

---

### 4.3 策略回测（strategyMock.ts）

```typescript
// src/renderer/services/mock/strategyMock.ts

import type { BacktestResult } from '@/types/tool';

/**
 * 策略回测 Mock
 * @param params.strategy 策略名称
 * @param params.symbol 股票代码
 * @returns BacktestResult
 */
export async function strategyBacktest(
  params: Record<string, unknown>
): Promise<BacktestResult> {
  const strategy = params.strategy as string;
  const symbol = params.symbol as string;

  await new Promise((resolve) => setTimeout(resolve, 500));

  // 模拟回测结果
  const totalReturn = Number((Math.random() * 40 - 10).toFixed(2)); // -10% ~ +30%
  const maxDrawdown = Number((Math.random() * 20 + 5).toFixed(2));   // 5% ~ 25%
  const trades = Math.floor(Math.random() * 20) + 5;

  const signals = Array.from({ length: trades }, (_, i) => ({
    date: new Date(Date.now() - (trades - i) * 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0],
    action: (i % 2 === 0 ? 'buy' : 'sell') as 'buy' | 'sell',
    price: Number((100 + Math.random() * 50).toFixed(2)),
  }));

  return {
    strategy,
    symbol,
    totalReturn,
    maxDrawdown,
    trades,
    signals,
  };
}
```

---

### 4.4 股票档案（stockProfileMock.ts）

```typescript
// src/renderer/services/mock/stockProfileMock.ts

import type { StockProfile } from '@/types/tool';

const PROFILE_DB: Record<string, StockProfile> = {
  '600519.SH': {
    symbol: '600519.SH',
    name: '贵州茅台',
    industry: '白酒',
    business: '茅台酒及系列酒的生产与销售',
    peRatio: 28.5,
    pbRatio: 8.2,
    eps: 59.2,
    marketCap: 2120000000000,
  },
  '000858.SZ': {
    symbol: '000858.SZ',
    name: '五粮液',
    industry: '白酒',
    business: '五粮液酒的生产与销售',
    peRatio: 18.3,
    pbRatio: 4.5,
    eps: 8.6,
    marketCap: 612000000000,
  },
  '300750.SZ': {
    symbol: '300750.SZ',
    name: '宁德时代',
    industry: '电池',
    business: '动力电池、储能电池的研发、生产和销售',
    peRatio: 22.1,
    pbRatio: 5.8,
    eps: 9.5,
    marketCap: 925000000000,
  },
  '002594.SZ': {
    symbol: '002594.SZ',
    name: '比亚迪',
    industry: '汽车',
    business: '新能源汽车及传统燃油汽车的生产与销售',
    peRatio: 25.6,
    pbRatio: 4.2,
    eps: 10.8,
    marketCap: 780000000000,
  },
};

/**
 * 查询股票档案
 * @param params.symbol 股票代码
 * @returns StockProfile
 */
export async function stockProfileQuery(
  params: Record<string, unknown>
): Promise<StockProfile> {
  const symbol = params.symbol as string;
  const profile = PROFILE_DB[symbol];

  if (!profile) {
    throw new Error(`未找到股票档案: ${symbol}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 100));
  return profile;
}
```

---

## 五、意图识别器（Intent Recognizer）

v1 使用硬编码规则匹配，不使用 AI 模型。

```typescript
// src/renderer/services/agent/intentRecognizer.ts

export interface RecognizedIntent {
  type: 'market_query' | 'news_search' | 'strategy_backtest' | 'stock_profile' | 'chat';
  requiresTool: boolean;
  toolId?: string;
  toolName?: string;
  params: Record<string, unknown>;
  confidence: number; // 0-1，规则匹配默认 1.0
}

/**
 * 意图识别规则引擎
 * 通过正则表达式匹配用户输入，返回对应的意图和工具参数
 */
export const intentRecognizer = {
  recognize(input: string): RecognizedIntent {
    const text = input.toLowerCase().trim();

    // 1. 行情查询意图
    const marketPatterns = [
      /查询(.+?)行情/,
      /(.+?)今天[怎么样]?/,
      /(.+?)股价/,
      /(.+?)价格/,
      /(.+?)走势/,
    ];

    for (const pattern of marketPatterns) {
      const match = text.match(pattern);
      if (match) {
        const stockName = match[1].trim();
        const symbol = resolveStockName(stockName);
        if (symbol) {
          return {
            type: 'market_query',
            requiresTool: true,
            toolId: 'market.query',
            toolName: '行情查询',
            params: { symbol },
            confidence: 1.0,
          };
        }
      }
    }

    // 2. 新闻检索意图
    const newsPatterns = [
      /(.+?)(?:的)?新闻/,
      /(.+?)(?:的)?公告/,
      /关于(.+?)的消息/,
    ];

    for (const pattern of newsPatterns) {
      const match = text.match(pattern);
      if (match) {
        return {
          type: 'news_search',
          requiresTool: true,
          toolId: 'news.search',
          toolName: '新闻检索',
          params: { keyword: match[1].trim() },
          confidence: 1.0,
        };
      }
    }

    // 3. 策略回测意图
    const strategyPatterns = [
      /回测(.+?)策略/,
      /(.+?)回测/,
      /测试(.+?)策略/,
    ];

    for (const pattern of strategyPatterns) {
      const match = text.match(pattern);
      if (match) {
        return {
          type: 'strategy_backtest',
          requiresTool: true,
          toolId: 'strategy.backtest',
          toolName: '策略回测',
          params: { strategy: 'MA5交叉', symbol: '000001.SZ' }, // v1 简化
          confidence: 1.0,
        };
      }
    }

    // 4. 股票档案意图
    const profilePatterns = [
      /(.+?)基本面/,
      /(.+?)财务/,
      /(.+?)档案/,
    ];

    for (const pattern of profilePatterns) {
      const match = text.match(pattern);
      if (match) {
        const symbol = resolveStockName(match[1].trim());
        if (symbol) {
          return {
            type: 'stock_profile',
            requiresTool: true,
            toolId: 'stock.profile',
            toolName: '股票档案',
            params: { symbol },
            confidence: 1.0,
          };
        }
      }
    }

    // 5. 默认：普通聊天
    return {
      type: 'chat',
      requiresTool: false,
      params: {},
      confidence: 1.0,
    };
  },
};

// ============================================================
// 股票名称解析（简化版）
// ============================================================

const NAME_TO_SYMBOL: Record<string, string> = {
  茅台: '600519.SH',
  贵州茅台: '600519.SH',
  五粮液: '000858.SZ',
  宁德时代: '300750.SZ',
  比亚迪: '002594.SZ',
  美的: '000333.SZ',
  平安银行: '000001.SZ',
  中国平安: '601318.SH',
  隆基: '601012.SH',
  招商银行: '600036.SH',
  海康威视: '002415.SZ',
};

function resolveStockName(name: string): string | null {
  return NAME_TO_SYMBOL[name] ?? null;
}
```

---

## 六、Agent 引擎（Agent Engine）

```typescript
// src/renderer/services/agent/agentEngine.ts

import { useChatStore } from '@/stores/useChatStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useToolStore } from '@/stores/useToolStore';
import { intentRecognizer } from './intentRecognizer';
import { getTool } from '@/services/mock';

/**
 * 处理用户输入的完整流程
 * 这是整个 Agent 交互的核心 orchestrator
 */
export async function processUserInput(inputText: string): Promise<void> {
  const chatStore = useChatStore.getState();
  const sessionStore = useSessionStore.getState();
  const toolStore = useToolStore.getState();

  try {
    // 1. 添加用户消息
    chatStore.addUserMessage(inputText);

    // 2. 创建 Agent 消息（初始为空，状态为 thinking）
    const agentMsg = chatStore.addAgentMessage();

    // 3. 意图识别
    const intent = intentRecognizer.recognize(inputText);
    chatStore.setMessageThinking(
      agentMsg.id,
      `意图识别：${intent.type}\n` +
        (intent.requiresTool ? `选择工具：${intent.toolName} (${intent.toolId})` : '无需工具，直接回复')
    );

    // 4. 执行工具或生成回复
    if (intent.requiresTool && intent.toolId) {
      await executeToolWithFeedback(agentMsg.id, intent);
    } else {
      const reply = generateChatReply(inputText);
      chatStore.updateMessage(agentMsg.id, {
        content: reply,
        status: 'completed',
      });
    }

    // 5. 更新 Session 时间
    const currentId = sessionStore.currentSessionId;
    if (currentId) {
      sessionStore.touchSession(currentId);
    }
  } catch (error) {
    console.error('Agent 处理失败:', error);
    // 错误已在 executeToolWithFeedback 中处理
  } finally {
    chatStore.setIsTyping(false);
  }
}

/**
 * 执行工具并更新消息状态
 */
async function executeToolWithFeedback(
  messageId: string,
  intent: ReturnType<typeof intentRecognizer.recognize>
): Promise<void> {
  const chatStore = useChatStore.getState();
  const toolStore = useToolStore.getState();

  if (!intent.toolId) return;

  chatStore.updateMessage(messageId, { status: 'tool_calling' });

  // 启动工具执行
  const executionId = toolStore.startExecution(intent.toolId, intent.params);
  chatStore.addToolCall(messageId, {
    toolId: intent.toolId,
    toolName: intent.toolName ?? intent.toolId,
    params: intent.params,
    status: 'pending',
  });

  try {
    const toolFn = getTool(intent.toolId);
    const result = await toolFn(intent.params);

    // 成功
    toolStore.completeExecution(executionId, result);
    chatStore.updateToolCallResult(messageId, intent.toolId, result);

    const summary = buildSummary(intent.toolId, result);
    chatStore.updateMessage(messageId, {
      content: summary,
      status: 'completed',
    });
  } catch (error) {
    const errorMsg = (error as Error).message;

    // 失败
    toolStore.failExecution(executionId, errorMsg);
    chatStore.updateToolCallResult(messageId, intent.toolId, null, errorMsg);
    chatStore.updateMessage(messageId, {
      content: `抱歉，查询时出现问题：${errorMsg}。请检查股票代码是否正确，或稍后再试。`,
      status: 'error',
    });
  }
}

/**
 * 根据工具结果构建总结文本
 */
function buildSummary(toolId: string, result: unknown): string {
  switch (toolId) {
    case 'market.query': {
      const data = result as { name: string; price: number; changePercent: number };
      const direction = data.changePercent >= 0 ? '上涨' : '下跌';
      return `${data.name} 当前价格 ${data.price} 元，较昨日${direction} ${Math.abs(data.changePercent)}%。详细数据请查看上方的行情卡片。`;
    }
    case 'news.search': {
      const items = result as Array<{ title: string }>;
      return `为您找到 ${items.length} 条相关新闻，请查看上方的新闻列表。`;
    }
    case 'strategy.backtest': {
      const data = result as { totalReturn: number; maxDrawdown: number };
      return `回测完成。策略总收益率 ${data.totalReturn}%，最大回撤 ${data.maxDrawdown}%。详细结果请查看上方的回测卡片。`;
    }
    case 'stock.profile': {
      const data = result as { name: string; industry: string; peRatio: number };
      return `${data.name}（${data.industry}），当前市盈率 ${data.peRatio} 倍。详细财务指标请查看上方卡片。`;
    }
    default:
      return '查询完成。';
  }
}

/**
 * 生成普通聊天回复
 */
function generateChatReply(input: string): string {
  // v1 极其简化，固定回复模板
  const templates = [
    '收到，请问还有什么可以帮您的吗？',
    '了解。您可以尝试使用快捷指令，如"/行情 贵州茅台"快速查询。',
    '好的。如果您想查看某只股票的详细信息，可以直接在聊天中提及股票名称。',
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}
```

---

## 七、v2 迁移指南（预留）

当需要接入真实 API 时，只需做以下改动：

1. **创建新的服务层**：`src/renderer/services/api/`（或直接改为 IPC 调用）
2. **替换 Tool Registry 中的 executor**：保持 `registerTool` 的接口不变
3. **意图识别器替换为 LLM**：接入 OpenAI / Claude API

```typescript
// v2 示例：将 Mock 替换为真实 API
// 只需修改 registry 的注册，其他代码完全不用动

import { realMarketApi } from '@/services/api/realMarketApi';

// 替换这一行即可
registerTool(
  { id: 'market.query', name: '行情查询', description: '...', parameters: [...] },
  realMarketApi.queryStock  // ← 替换为真实 API
);
```

---

> **下一步**：阅读 `05-market-panel.md`，理解行情看板模块的技术实现。
