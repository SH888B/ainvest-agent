# 05. 行情看板模块（Market Panel）

> **目标**：读完本文档，你能知道行情看板怎么实现视图切换、怎么展示 Mock 数据、以及怎么和聊天面板联动。

---

## 一、模块定位

行情看板是主界面**左侧 40%** 的区域，是独立的行情展示面板，与聊天面板、Session 列表并列为三大核心模块。

**核心职责**：
1. 展示行情总览（指数 + 自选股 + 热点新闻）
2. 展示个股详情（基本信息 + 实时行情 + 相关新闻 + 财务指标）
3. 支持总览页和个股详情页之间的视图切换
4. 响应来自聊天面板的个股联动事件（点击【贵州茅台】跳转）

---

## 二、组件架构

```
MarketPanel (index.tsx)
│
├── MarketNavBar                    # 顶部导航栏（行情总览 / 个股详情 标签）
│
├── 当 currentView === 'overview':
│   └── MarketOverview
│       ├── IndexOverview           # 指数概览区（3 个主要指数）
│       │   └── IndexCard × 3      # 单个指数卡片
│       ├── WatchlistSection        # 自选股区域
│       │   └── WatchlistTable      # 自选股表格
│       │       └── WatchlistRow × N # 单行股票数据（可点击）
│       └── HotNewsSection          # 热点新闻区域
│           └── NewsList            # 新闻列表
│               └── NewsItem × N    # 单条新闻
│
└── 当 currentView === 'stockDetail':
    └── StockDetail (symbol: string)
        ├── StockDetailHeader       # 头部（返回按钮 + 股票名称代码）
        ├── StockBasicInfo          # 基本信息（行业、主营业务）
        ├── StockPricePanel         # 价格面板（大字号价格 + 涨跌幅）
        ├── StockMetricsGrid        # 财务指标网格（成交量、市值、PE、PB）
        └── StockNewsSection        # 相关新闻
            └── NewsList            # 复用 NewsList 组件
```

---

## 三、核心组件接口定义

### 3.1 MarketPanel（模块入口）

```typescript
// src/renderer/features/market-panel/index.tsx

import { useMarketStore } from '@/stores/useMarketStore';
import { MarketOverview } from './components/MarketOverview';
import { StockDetail } from './components/StockDetail';
import { MarketNavBar } from './components/MarketNavBar';

/**
 * 行情看板根组件
 * 职责：根据 currentView 渲染不同的子视图
 */
export function MarketPanel(): JSX.Element {
  const { currentView, activeSymbol } = useMarketStore();

  return (
    <div className="flex flex-col h-full w-full bg-gray-900 border-r border-gray-800">
      {/* 顶部导航 */}
      <MarketNavBar currentView={currentView} />

      {/* 视图内容区 */}
      <div className="flex-1 overflow-y-auto">
        {currentView === 'overview' && <MarketOverview />}
        {currentView === 'stockDetail' && activeSymbol && (
          <StockDetail symbol={activeSymbol} />
        )}
      </div>
    </div>
  );
}
```

### 3.2 MarketNavBar（顶部导航）

```typescript
// src/renderer/features/market-panel/components/MarketNavBar.tsx

import { useMarketStore } from '@/stores/useMarketStore';
import type { MarketView } from '@/stores/useMarketStore';

interface MarketNavBarProps {
  currentView: MarketView;
}

export function MarketNavBar({ currentView }: MarketNavBarProps): JSX.Element {
  const { switchToOverview } = useMarketStore();

  return (
    <div className="flex items-center h-10 px-3 border-b border-gray-800">
      {currentView === 'stockDetail' && (
        <button
          className="mr-3 text-gray-400 hover:text-white"
          onClick={switchToOverview}
        >
          ← 返回
        </button>
      )}
      <div className="flex space-x-4">
        <button
          className={`text-sm font-medium ${
            currentView === 'overview' ? 'text-white' : 'text-gray-500'
          }`}
          onClick={switchToOverview}
        >
          行情总览
        </button>
        {currentView === 'stockDetail' && (
          <span className="text-sm font-medium text-white">个股详情</span>
        )}
      </div>
    </div>
  );
}
```

### 3.3 MarketOverview（行情总览页）

```typescript
// src/renderer/features/market-panel/components/MarketOverview.tsx

import { useEffect, useState } from 'react';
import { queryIndices, queryWatchlist } from '@/services/mock/marketMock';
import { newsSearch } from '@/services/mock/newsMock';
import { useMarketStore } from '@/stores/useMarketStore';
import type { MarketData, IndexData } from '@/types/market';
import type { NewsItem } from '@/types/tool';
import { IndexCard } from './IndexCard';
import { WatchlistTable } from './WatchlistTable';
import { NewsList } from './NewsList';

export function MarketOverview(): JSX.Element {
  const { watchlist, switchToStockDetail } = useMarketStore();
  const [indices, setIndices] = useState<IndexData[]>([]);
  const [watchlistData, setWatchlistData] = useState<MarketData[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      try {
        const [indicesData, watchlistResult, newsResult] = await Promise.all([
          queryIndices(),
          queryWatchlist(watchlist),
          newsSearch({ keyword: '财经', limit: 6 }),
        ]);

        if (!cancelled) {
          setIndices(indicesData);
          setWatchlistData(watchlistResult);
          setNews(newsResult);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [watchlist]);

  if (loading) {
    return <div className="p-4 text-gray-500">加载中...</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      {/* 指数概览 */}
      <section>
        <h3 className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
          指数概览
        </h3>
        <div className="grid grid-cols-1 gap-2">
          {indices.map((index) => (
            <IndexCard key={index.symbol} data={index} />
          ))}
        </div>
      </section>

      {/* 自选股 */}
      <section>
        <h3 className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
          自选股
        </h3>
        <WatchlistTable
          data={watchlistData}
          onStockClick={(symbol) => switchToStockDetail(symbol)}
        />
      </section>

      {/* 热点新闻 */}
      <section>
        <h3 className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
          热点新闻
        </h3>
        <NewsList items={news} />
      </section>
    </div>
  );
}
```

### 3.4 IndexCard（指数卡片）

```typescript
// src/renderer/features/market-panel/components/IndexCard.tsx

import type { IndexData } from '@/types/market';

interface IndexCardProps {
  data: IndexData;
}

export function IndexCard({ data }: IndexCardProps): JSX.Element {
  const isUp = data.changePercent >= 0;

  return (
    <div className="flex items-center justify-between px-3 py-2 bg-gray-800/50 rounded-md">
      <span className="text-sm text-gray-300">{data.name}</span>
      <div className="flex items-center gap-3">
        <span className="text-sm font-mono text-white">{data.point}</span>
        <span className={`text-xs font-mono ${isUp ? 'text-red-400' : 'text-green-400'}`}>
          {isUp ? '+' : ''}{data.changePercent}%
        </span>
      </div>
    </div>
  );
}
```

**注意**：A 股市场传统中，**红色表示上涨，绿色表示下跌**。这和美股相反，代码中必须遵循这个约定。

### 3.5 WatchlistTable（自选股表格）

```typescript
// src/renderer/features/market-panel/components/WatchlistTable.tsx

import type { MarketData } from '@/types/market';

interface WatchlistTableProps {
  data: MarketData[];
  onStockClick: (symbol: string) => void;
}

export function WatchlistTable({ data, onStockClick }: WatchlistTableProps): JSX.Element {
  return (
    <div className="bg-gray-800/30 rounded-md overflow-hidden">
      {/* 表头 */}
      <div className="grid grid-cols-4 px-3 py-1.5 text-xs text-gray-500 border-b border-gray-700">
        <span>名称</span>
        <span className="text-right">最新价</span>
        <span className="text-right">涨跌额</span>
        <span className="text-right">涨跌幅</span>
      </div>
      {/* 数据行 */}
      {data.map((stock) => {
        const isUp = stock.change >= 0;
        return (
          <div
            key={stock.symbol}
            className="grid grid-cols-4 px-3 py-2 text-sm hover:bg-gray-800 cursor-pointer transition-colors"
            onClick={() => onStockClick(stock.symbol)}
          >
            <div className="flex flex-col">
              <span className="text-white">{stock.name}</span>
              <span className="text-xs text-gray-500">{stock.symbol}</span>
            </div>
            <span className="text-right text-white font-mono">{stock.price}</span>
            <span className={`text-right font-mono ${isUp ? 'text-red-400' : 'text-green-400'}`}>
              {isUp ? '+' : ''}{stock.change}
            </span>
            <span className={`text-right font-mono ${isUp ? 'text-red-400' : 'text-green-400'}`}>
              {isUp ? '+' : ''}{stock.changePercent}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

### 3.6 StockDetail（个股详情页）

```typescript
// src/renderer/features/market-panel/components/StockDetail.tsx

import { useEffect, useState } from 'react';
import { marketQuery } from '@/services/mock/marketMock';
import { stockProfileQuery } from '@/services/mock/stockProfileMock';
import { getStockNews } from '@/services/mock/newsMock';
import type { MarketData } from '@/types/market';
import type { StockProfile, NewsItem } from '@/types/tool';
import { NewsList } from './NewsList';
import { StockMetricsGrid } from './StockMetricsGrid';

interface StockDetailProps {
  symbol: string; // 如 '600519.SH'
}

export function StockDetail({ symbol }: StockDetailProps): JSX.Element {
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [profile, setProfile] = useState<StockProfile | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadStockData() {
      setLoading(true);
      try {
        const [market, prof, newsData] = await Promise.all([
          marketQuery({ symbol }),
          stockProfileQuery({ symbol }).catch(() => null),
          getStockNews(symbol),
        ]);

        if (!cancelled) {
          setMarketData(market);
          setProfile(prof);
          setNews(newsData);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadStockData();
    return () => { cancelled = true; };
  }, [symbol]);

  if (loading) {
    return <div className="p-4 text-gray-500">加载个股数据中...</div>;
  }

  if (!marketData) {
    return <div className="p-4 text-red-400">加载失败，请重试</div>;
  }

  const isUp = marketData.change >= 0;

  return (
    <div className="flex flex-col gap-4 p-3">
      {/* 基本信息 */}
      <div>
        <h2 className="text-lg font-bold text-white">{marketData.name}</h2>
        <p className="text-sm text-gray-400">{marketData.symbol}</p>
        {profile && (
          <p className="text-xs text-gray-500 mt-1">所属行业：{profile.industry}</p>
        )}
      </div>

      {/* 价格大面板 */}
      <div className="bg-gray-800/50 rounded-lg p-4">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-white font-mono">
            {marketData.price}
          </span>
          <span className={`text-lg font-mono ${isUp ? 'text-red-400' : 'text-green-400'}`}>
            {isUp ? '+' : ''}{marketData.change}
          </span>
          <span className={`text-sm font-mono ${isUp ? 'text-red-400' : 'text-green-400'}`}>
            ({isUp ? '+' : ''}{marketData.changePercent}%)
          </span>
        </div>
      </div>

      {/* 财务指标网格 */}
      {profile && <StockMetricsGrid market={marketData} profile={profile} />}

      {/* 相关新闻 */}
      <section>
        <h3 className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
          相关新闻
        </h3>
        <NewsList items={news} />
      </section>
    </div>
  );
}
```

### 3.7 StockMetricsGrid（财务指标网格）

```typescript
// src/renderer/features/market-panel/components/StockMetricsGrid.tsx

import type { MarketData } from '@/types/market';
import type { StockProfile } from '@/types/tool';

interface StockMetricsGridProps {
  market: MarketData;
  profile: StockProfile;
}

export function StockMetricsGrid({ market, profile }: StockMetricsGridProps): JSX.Element {
  const metrics = [
    { label: '成交量', value: `${(market.volume / 10000).toFixed(1)}万手` },
    { label: '成交额', value: `${(market.turnover / 10000).toFixed(1)}万` },
    { label: '市值', value: formatMarketCap(market.marketCap) },
    { label: '换手率', value: `${(market.turnoverRate * 100).toFixed(2)}%` },
    { label: '市盈率(PE)', value: profile.peRatio.toFixed(1) },
    { label: '市净率(PB)', value: profile.pbRatio.toFixed(1) },
    { label: '每股收益(EPS)', value: profile.eps.toFixed(2) },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {metrics.map((m) => (
        <div key={m.label} className="bg-gray-800/30 rounded-md px-3 py-2">
          <p className="text-xs text-gray-500">{m.label}</p>
          <p className="text-sm text-white font-mono">{m.value}</p>
        </div>
      ))}
    </div>
  );
}

function formatMarketCap(cap: number): string {
  if (cap >= 1e12) return `${(cap / 1e12).toFixed(2)}万亿`;
  if (cap >= 1e8) return `${(cap / 1e8).toFixed(2)}亿`;
  return `${(cap / 1e4).toFixed(2)}万`;
}
```

---

## 四、个股联动机制

### 4.1 联动原理

行情看板和聊天面板之间**不直接通信**，它们通过 `useMarketStore` 这个"中间人"来实现联动：

```
┌─────────────────┐     setActiveSymbol('600519.SH')     ┌─────────────────┐
│   聊天面板       │ ────────────────────────────────────→ │  useMarketStore │
│  (StockLink)    │                                      │  activeSymbol   │
└─────────────────┘                                      └────────┬────────┘
                                                                  │
                                                                  │ 订阅变化
                                                                  ▼
                                                         ┌─────────────────┐
                                                         │   行情看板       │
                                                         │  (StockDetail)  │
                                                         └─────────────────┘
```

### 4.2 StockLink 组件（聊天面板中渲染个股链接）

```typescript
// src/renderer/features/chat-panel/components/StockLink.tsx

import { useMarketStore } from '@/stores/useMarketStore';

interface StockLinkProps {
  symbol: string;   // 股票代码，如 '600519.SH'
  name: string;     // 股票名称，如 '贵州茅台'
}

export function StockLink({ symbol, name }: StockLinkProps): JSX.Element {
  const { switchToStockDetail } = useMarketStore();

  return (
    <button
      className="inline text-blue-400 underline hover:text-blue-300 cursor-pointer bg-transparent border-none p-0"
      onClick={() => switchToStockDetail(symbol)}
      title={`点击查看 ${name} 行情`}
    >
      【{name}】
    </button>
  );
}
```

### 4.3 消息解析器（在 AgentMessageBubble 中使用）

```typescript
// src/renderer/features/chat-panel/hooks/useMessageParser.ts

import { useMemo } from 'react';

/**
 * 解析消息文本中的股票标记
 * 支持格式：【贵州茅台】或【600519.SH】
 * @returns 解析后的片段数组，每个片段是文本或股票链接
 */
export function useMessageParser(content: string) {
  return useMemo(() => {
    const regex = /【(.+?)】/g;
    const parts: Array<
      | { type: 'text'; content: string }
      | { type: 'stock'; name: string; symbol: string }
    > = [];

    let lastIndex = 0;
    let match;

    while ((match = regex.exec(content)) !== null) {
      // 匹配前的文本
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: content.slice(lastIndex, match.index),
        });
      }

      const matchedText = match[1];
      // 判断是代码还是名称
      const symbol = resolveToSymbol(matchedText);
      const name = resolveToName(matchedText) ?? matchedText;

      parts.push({ type: 'stock', name, symbol });
      lastIndex = match.index + match[0].length;
    }

    // 剩余文本
    if (lastIndex < content.length) {
      parts.push({ type: 'text', content: content.slice(lastIndex) });
    }

    return parts;
  }, [content]);
}

// 名称/代码解析映射（简化版）
const SYMBOL_MAP: Record<string, { symbol: string; name: string }> = {
  '贵州茅台': { symbol: '600519.SH', name: '贵州茅台' },
  '600519.SH': { symbol: '600519.SH', name: '贵州茅台' },
  '五粮液': { symbol: '000858.SZ', name: '五粮液' },
  '宁德时代': { symbol: '300750.SZ', name: '宁德时代' },
  '比亚迪': { symbol: '002594.SZ', name: '比亚迪' },
};

function resolveToSymbol(text: string): string {
  return SYMBOL_MAP[text]?.symbol ?? text;
}

function resolveToName(text: string): string | undefined {
  return SYMBOL_MAP[text]?.name;
}
```

### 4.4 AgentMessageBubble（使用解析器渲染消息）

```typescript
// src/renderer/features/chat-panel/components/AgentMessageBubble.tsx（简化）

import { useMessageParser } from '../hooks/useMessageParser';
import { StockLink } from './StockLink';
import type { ChatMessage } from '@/stores/useChatStore';

interface AgentMessageBubbleProps {
  message: ChatMessage;
}

export function AgentMessageBubble({ message }: AgentMessageBubbleProps): JSX.Element {
  const parsedParts = useMessageParser(message.content);

  return (
    <div className="flex flex-col max-w-[85%]">
      {/* 思考过程（可折叠） */}
      {message.thinking && <ThinkingBlock content={message.thinking} />}

      {/* 消息内容 */}
      <div className="bg-gray-800 rounded-lg px-4 py-3 text-sm text-gray-100 leading-relaxed">
        {parsedParts.map((part, index) =>
          part.type === 'text' ? (
            <span key={index}>{part.content}</span>
          ) : (
            <StockLink key={index} symbol={part.symbol} name={part.name} />
          )
        )}
      </div>

      {/* 工具调用卡片 */}
      {message.toolCalls?.map((tc) => (
        <ToolCallCard key={tc.toolId} toolCall={tc} />
      ))}
    </div>
  );
}
```

---

## 五、样式约定

行情看板的样式必须遵循以下约定：

| 元素 | 颜色/样式 | 说明 |
|------|----------|------|
| 面板背景 | `bg-gray-900` | 深色主背景 |
| 卡片背景 | `bg-gray-800/50` | 半透明卡片 |
| 上涨文字 | `text-red-400` | A 股传统：红涨 |
| 下跌文字 | `text-green-400` | A 股传统：绿跌 |
| 标题文字 | `text-gray-400` | 灰色小字标题 |
| 正文文字 | `text-white` / `text-gray-300` | 主要内容 |
| 数字字体 | `font-mono` | 价格、涨跌幅等数字用等宽字体 |
| 分隔线 | `border-gray-800` / `border-gray-700` |  subtle 分隔 |
| 圆角 | `rounded-md` / `rounded-lg` | 统一圆角风格 |

---

> **下一步**：阅读 `06-chat-panel.md`，理解聊天面板模块的技术实现。
