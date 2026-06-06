# v4 行情看板与聊天体验增强 技术架构文档

> 版本：v4.0.0
> 日期：2026-06-06
> 状态：评审通过
> 基线架构：`docs/arch/v3-ux-observability.md`

---

## 一、技术目标

在 v3 可观测性与用户体验基础上，实现：
1. Mock 数据扩充（腾讯、阿里、英伟达 + 走势数据生成器）
2. 行情看板总览信息密度升级（指数看板 + 涨跌分布柱状图 + 行业板块排行）
3. 自选股覆盖港美股（AAPL / TSLA / 腾讯 / 阿里 / 英伟达）
4. 个股详情增加 30 日走势图
5. Session 消息持久化可靠（ChatStore 重构 + zustand/persist）
6. Agent 回复 Markdown 富文本渲染（流式期间纯文本，完成后 Markdown）
7. 三栏布局背景色差异化
8. DevTool 看板显式开关（开发环境扳手按钮）

---

## 二、关键决策

| # | 决策项 | 选择 | 理由 |
|---|--------|------|------|
| 1 | 走势/分布图表库 | **recharts** | React 原生声明式 API，Tree-shaking 友好，团队熟悉 |
| 2 | Markdown 渲染库 | **react-markdown** | 无 XSS 风险（不 dangerouslySetInnerHTML），React 原生组件 |
| 3 | 消息持久化方案 | **ChatStore 重构为 `messagesBySession` + `zustand/persist`** | 根治多 Session 切换丢消息问题，与 SessionStore 方案一致 |
| 4 | Markdown 流式策略 | **流式期间纯文本，status=completed 后切 Markdown** | 避免频繁 AST 重建导致滚动卡顿 |
| 5 | 走势数据生成 | **基于当前价格反向随机游走生成 30 日数据** | 简单可靠，无需维护历史数据集 |
| 6 | DevTool 状态管理 | **新建 `useDevToolStore`（不持久化）** | 运行时调试状态，不需要跨会话记忆 |
| 7 | 三栏背景色实现 | **Tailwind extend 自定义语义化色名** | 保持 Tailwind 一致性，禁止 inline style |

---

## 三、模块设计

### 3.1 Mock 数据层（`src/renderer/services/mocks/index.ts`）

**新增类型定义**：

```typescript
// src/shared/types/market.ts

/** 市场标识 */
export type MarketType = 'CN' | 'HK' | 'US'

/** 指数数据 */
export interface MarketIndex {
  symbol: string        // 'DJI' | 'IXIC' | 'SPX'
  name: string
  nameCn: string        // '道琼斯工业平均指数'
  point: number
  change: number
  changePercent: number
}

/** 涨跌分布区间 */
export interface DistributionBin {
  label: string         // '+5% ~ +7%'
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
  date: string          // '06-01'
  price: number
}

/** 扩展的个股档案 */
export interface StockProfile {
  symbol: string
  name: string
  market: MarketType
  industry: string
  marketCap: number
  marketCapStr: string  // '3.8万亿港元'
  description: string
  ceo: string
  founded: string
  pe?: number
  pb?: number
}
```

**走势数据生成器**：

```typescript
// src/renderer/services/mocks/chartDataGenerator.ts

/**
 * 基于当前价格反向生成 30 个交易日的模拟收盘价
 * 使用随机游走模型，确保最后一日价格收敛到当前价
 */
export function generatePriceHistory(
  currentPrice: number,
  volatility: number = 0.02   // 日波动率 2%
): StockPricePoint[] {
  const days = 30
  const prices: number[] = new Array(days)
  prices[days - 1] = currentPrice

  // 反向随机游走
  for (let i = days - 2; i >= 0; i--) {
    const change = (Math.random() - 0.5) * 2 * volatility
    prices[i] = prices[i + 1] * (1 - change)
  }

  // 生成日期标签（最近 30 个交易日，简化版）
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
```

**Mock 服务接口扩展**：

```typescript
// src/renderer/services/mocks/index.ts

/** 获取美股三大指数 Mock 数据 */
export function queryMarketIndices(): Promise<MarketIndex[]>

/** 获取全市场涨跌分布 Mock 数据 */
export function queryMarketDistribution(): Promise<DistributionBin[]>

/** 获取行业板块排行 Mock 数据 */
export function querySectorLeaderboard(): Promise<{
  topGainers: SectorInfo[]
  topLosers: SectorInfo[]
}>

/** 获取个股 30 日走势 Mock 数据 */
export function queryStockChart(symbol: string): Promise<StockPricePoint[]>
```

---

### 3.2 行情看板总览页 redesign（`MarketOverview.tsx`）

**信息结构（从上到下）**：

```
MarketOverview
├── MarketIndexBoard          # 指数看板（3 列卡片）
│   └── IndexCard × 3
├── MarketDistributionChart   # 涨跌分布横向柱状图
└── SectorLeaderboard         # 行业板块 Top 5 涨幅/跌幅
    ├── TopGainerList
    └── TopLoserList
```

**指数卡片组件**：

```typescript
// src/renderer/features/market/components/IndexCard.tsx

import type { MarketIndex } from '@/shared/types/market'

interface IndexCardProps {
  data: MarketIndex
}

export function IndexCard({ data }: IndexCardProps): JSX.Element {
  const isUp = data.changePercent >= 0

  return (
    <div className="flex flex-col items-center p-3 bg-surface rounded-lg">
      <span className="text-xs text-text-muted">{data.nameCn}</span>
      <span className="text-lg font-mono font-bold text-text mt-1">
        {data.point.toLocaleString()}
      </span>
      <div className="flex items-center gap-1 mt-0.5">
        <span className={`text-xs font-mono ${isUp ? 'text-success' : 'text-danger'}`}>
          {isUp ? '+' : ''}{data.change.toFixed(2)}
        </span>
        <span className={`text-xs font-mono ${isUp ? 'text-success' : 'text-danger'}`}>
          ({isUp ? '+' : ''}{data.changePercent.toFixed(2)}%)
        </span>
      </div>
    </div>
  )
}
```

**涨跌分布柱状图组件**：

```typescript
// src/renderer/features/market/components/MarketDistributionChart.tsx

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts'
import type { DistributionBin } from '@/shared/types/market'

interface Props {
  data: DistributionBin[]
}

export function MarketDistributionChart({ data }: Props): JSX.Element {
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis type="number" stroke="#9ca3af" fontSize={12} />
          <YAxis
            dataKey="label"
            type="category"
            stroke="#9ca3af"
            fontSize={11}
            width={70}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '6px',
              fontSize: '12px',
            }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.type === 'up' ? '#22c55e' : entry.type === 'down' ? '#ef4444' : '#6b7280'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

---

### 3.3 个股走势图（`StockChart.tsx`）

```typescript
// src/renderer/features/market/components/StockChart.tsx

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts'
import type { StockPricePoint } from '@/shared/types/market'

interface StockChartProps {
  data: StockPricePoint[]
  isUp: boolean        // 整体涨跌趋势，决定填充色
}

export function StockChart({ data, isUp }: StockChartProps): JSX.Element {
  const color = isUp ? '#22c55e' : '#ef4444'

  return (
    <div className="h-52 mt-4">
      <h4 className="text-xs font-semibold text-text-muted mb-2">30日走势</h4>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="date" stroke="#9ca3af" fontSize={11} />
          <YAxis stroke="#9ca3af" fontSize={11} domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '6px',
              fontSize: '12px',
            }}
            formatter={(value: number) => [value.toFixed(2), '收盘价']}
          />
          <Area
            type="monotone"
            dataKey="price"
            stroke={color}
            strokeWidth={2}
            fill="url(#colorPrice)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
```

---

### 3.4 ChatStore 重构 + 持久化（`useChatStore.ts`）

**重构后结构**：

```typescript
// src/renderer/stores/useChatStore.ts

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ChatState {
  // ─── State ───
  messagesBySession: Record<string, ChatMessage[]>
  currentSessionId: string | null
  isTyping: boolean

  // ─── Actions ───
  setCurrentSessionId: (sessionId: string | null) => void
  addUserMessage: (sessionId: string, content: string) => ChatMessage
  addAgentMessage: (sessionId: string, content?: string) => ChatMessage
  updateMessage: (sessionId: string, messageId: string, updates: Partial<ChatMessage>) => void
  setMessageThinking: (sessionId: string, messageId: string, thinking: string) => void
  addToolCall: (sessionId: string, messageId: string, toolCall: ToolCallInfo) => void
  updateToolCallResult: (sessionId: string, messageId: string, toolId: string, result: unknown, error?: string) => void
  setIsTyping: (typing: boolean) => void
  clearSessionMessages: (sessionId: string) => void
  deleteSessionMessages: (sessionId: string) => void
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messagesBySession: {},
      currentSessionId: null,
      isTyping: false,

      setCurrentSessionId: (sessionId) => set({ currentSessionId: sessionId }),

      addUserMessage: (sessionId, content) => {
        const message: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content,
          timestamp: Date.now(),
        }
        set((state) => ({
          messagesBySession: {
            ...state.messagesBySession,
            [sessionId]: [...(state.messagesBySession[sessionId] ?? []), message],
          },
        }))
        return message
      },

      addAgentMessage: (sessionId, content = '') => {
        const message: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'agent',
          content,
          timestamp: Date.now(),
          status: 'thinking',
        }
        set((state) => ({
          messagesBySession: {
            ...state.messagesBySession,
            [sessionId]: [...(state.messagesBySession[sessionId] ?? []), message],
          },
          isTyping: true,
        }))
        return message
      },

      updateMessage: (sessionId, messageId, updates) => {
        set((state) => ({
          messagesBySession: {
            ...state.messagesBySession,
            [sessionId]: state.messagesBySession[sessionId]?.map((m) =>
              m.id === messageId ? { ...m, ...updates } : m
            ) ?? [],
          },
        }))
      },

      setMessageThinking: (sessionId, messageId, thinking) => {
        set((state) => ({
          messagesBySession: {
            ...state.messagesBySession,
            [sessionId]: state.messagesBySession[sessionId]?.map((m) =>
              m.id === messageId ? { ...m, thinking } : m
            ) ?? [],
          },
        }))
      },

      // ... addToolCall / updateToolCallResult 类似模式

      setIsTyping: (typing) => set({ isTyping: typing }),

      clearSessionMessages: (sessionId) => {
        set((state) => ({
          messagesBySession: {
            ...state.messagesBySession,
            [sessionId]: [],
          },
        }))
      },

      deleteSessionMessages: (sessionId) => {
        set((state) => {
          const { [sessionId]: _, ...rest } = state.messagesBySession
          return { messagesBySession: rest }
        })
      },
    }),
    {
      name: 'ainvest-chat-messages',
      partialize: (state) => ({
        messagesBySession: state.messagesBySession,
        // ❌ 不持久化 isTyping（运行时状态）
        // ❌ 不持久化 currentSessionId（由 SessionStore 管理）
      }),
    }
  )
)
```

**组件层读取方式**：

```typescript
// MessageList.tsx / ChatPanel.tsx 中
const currentSessionId = useSessionStore((state) => state.currentSessionId)
const messages = useChatStore(
  (state) => (currentSessionId ? state.messagesBySession[currentSessionId] ?? [] : [])
)
```

**Session 切换同步**：

```typescript
// 在 Session 切换管理器或组件层
function handleSwitchSession(sessionId: string) {
  useSessionStore.getState().setCurrentSession(sessionId)
  useChatStore.getState().setCurrentSessionId(sessionId)
}

// 删除 Session 时同步清理消息
function handleDeleteSession(sessionId: string) {
  useChatStore.getState().deleteSessionMessages(sessionId)
  useSessionStore.getState().deleteSession(sessionId)
}
```

---

### 3.5 Markdown 渲染组件（`MarkdownRenderer.tsx`）

```typescript
// src/renderer/features/chat/components/MarkdownRenderer.tsx

import ReactMarkdown from 'react-markdown'

interface MarkdownRendererProps {
  content: string
}

export function MarkdownRenderer({ content }: MarkdownRendererProps): JSX.Element {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        strong: ({ children }) => <strong className="text-text font-semibold">{children}</strong>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="text-text-secondary">{children}</li>,
        code: ({ children, className }) => {
          const isInline = !className
          return isInline ? (
            <code className="px-1 py-0.5 bg-surface rounded text-xs font-mono text-primary">
              {children}
            </code>
          ) : (
            <pre className="p-2 bg-surface border border-border rounded-md overflow-x-auto my-2">
              <code className="text-xs font-mono text-text-secondary">{children}</code>
            </pre>
          )
        },
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-primary pl-3 my-2 text-text-muted">
            {children}
          </blockquote>
        ),
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
```

**MessageItem 中的使用策略**：

```typescript
// Agent 消息渲染逻辑
{message.status === 'completed' ? (
  <MarkdownRenderer content={message.content} />
) : (
  <span className="whitespace-pre-wrap">{message.content}</span>
)}
```

---

### 3.6 DevTool 状态管理（`useDevToolStore.ts`）

```typescript
// src/renderer/stores/useDevToolStore.ts

import { create } from 'zustand'

interface DevToolState {
  isOpen: boolean
  toggle: () => void
  open: () => void
  close: () => void
}

export const useDevToolStore = create<DevToolState>((set) => ({
  isOpen: false,
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))
```

**快捷键与按钮联动**：

```typescript
// MainLayout.tsx 或 ChatPanel.tsx
useEffect(() => {
  if (!import.meta.env.DEV) return

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'L') {
      e.preventDefault()
      useDevToolStore.getState().toggle()
    }
  }

  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [])
```

```typescript
// ChatPanel 顶部扳手按钮
import { Wrench } from 'lucide-react'

{import.meta.env.DEV && (
  <button
    onClick={() => useDevToolStore.getState().toggle()}
    className="text-text-muted hover:text-text transition-colors"
    title="DevTool 看板"
  >
    <Wrench size={16} />
  </button>
)}
```

---

### 3.7 三栏背景色差异化（`tailwind.config.js`）

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        'panel-left': '#0c0e14',
        'panel-center': '#0f1117',
        'panel-right': '#12141c',
      },
    },
  },
}
```

**MainLayout.tsx 应用**：

```typescript
// 左栏：行情看板
<div className="w-[40%] bg-panel-left border-r border-border">
  <MarketPanel />
</div>

// 中栏：聊天面板（基准色）
<div className="w-[40%] bg-panel-center">
  <ChatPanel />
</div>

// 右栏：Session 列表
<div className="w-[20%] bg-panel-right border-l border-border">
  <SessionSidebar />
</div>
```

---

## 四、数据流图

### 4.1 行情看板总览数据流

```
MarketOverview 挂载
  ↓
并行发起 3 个 Mock 请求：
  ├─ queryMarketIndices() → MarketIndex[]
  ├─ queryMarketDistribution() → DistributionBin[]
  └─ querySectorLeaderboard() → { topGainers, topLosers }
  ↓
各子组件独立渲染：
  ├─ MarketIndexBoard → 3 个 IndexCard
  ├─ MarketDistributionChart → recharts BarChart
  └─ SectorLeaderboard → 双列列表
```

### 4.2 消息持久化数据流（重构后）

```
用户发送消息
  ↓
useChatStore.addUserMessage(sessionId, content)
  ↓ 更新 messagesBySession[sessionId]
zustand/persist 中间件 → localStorage（ainvest-chat-messages）
  ↓
切换 Session
  ↓
组件层同步：SessionStore.currentSessionId + ChatStore.currentSessionId
  ↓
MessageList Selector 读取 messagesBySession[newSessionId]
  ↓
消息从内存直接渲染（无需 IPC 加载延迟）
```

### 4.3 Markdown 渲染数据流

```
Agent 流式回复中
  ↓
message.status = 'thinking' / 'tool_calling'
  ↓
MessageItem 渲染 <span className="whitespace-pre-wrap">{content}</span>
  ↓
流式完成
  ↓
message.status = 'completed'
  ↓
MessageItem 切换为 <MarkdownRenderer content={content} />
```

---

## 五、文件变更清单

### 新增文件

| 文件路径 | 说明 |
|---------|------|
| `src/shared/types/market.ts` | 市场相关类型（MarketIndex, DistributionBin, SectorInfo, StockPricePoint, StockProfile） |
| `src/renderer/services/mocks/chartDataGenerator.ts` | 走势数据生成器（随机游走模型） |
| `src/renderer/features/market/components/MarketIndexBoard.tsx` | 指数看板组件 |
| `src/renderer/features/market/components/IndexCard.tsx` | 单个指数卡片 |
| `src/renderer/features/market/components/MarketDistributionChart.tsx` | 涨跌分布柱状图 |
| `src/renderer/features/market/components/SectorLeaderboard.tsx` | 行业板块排行 |
| `src/renderer/features/market/components/StockChart.tsx` | 个股 30 日走势图 |
| `src/renderer/features/chat/components/MarkdownRenderer.tsx` | Markdown 渲染包装组件 |
| `src/renderer/stores/useDevToolStore.ts` | DevTool 面板显隐状态 |

### 修改文件

| 文件路径 | 变更内容 |
|---------|---------|
| `src/renderer/services/mocks/index.ts` | 新增腾讯/阿里/英伟达 Mock 数据；新增 queryMarketIndices/queryMarketDistribution/querySectorLeaderboard/queryStockChart |
| `src/renderer/stores/useChatStore.ts` | **重构**：messages → messagesBySession；添加 zustand/persist；所有 action 增加 sessionId 参数 |
| `src/renderer/stores/useMarketStore.ts` | watchlist 默认值更新为 5 只港美股 |
| `src/renderer/features/market/MarketOverview.tsx` | 总览页 redesign：指数看板 + 柱状图 + 行业板块；支持 overflow-y-auto 滚动 |
| `src/renderer/features/market/WatchList.tsx` | 默认自选股更新 |
| `src/renderer/features/market/StockDetail.tsx` | 下方集成 StockChart 组件 |
| `src/renderer/features/chat/MessageItem.tsx` | Agent 消息：流式纯文本 → 完成后 MarkdownRenderer；用户消息保持原样 |
| `src/renderer/features/chat/MessageList.tsx` | 适配 ChatStore 新结构读取 messagesBySession[currentSessionId] |
| `src/renderer/features/chat/ChatPanel.tsx` | 1. 适配 ChatStore 新结构<br>2. 顶部增加 DevTool 扳手按钮（DEV 环境）<br>3. 移除/简化 IPC 消息加载逻辑 |
| `src/renderer/features/layout/MainLayout.tsx` | 三栏背景色差异化 + DevTool 面板布局 |
| `src/renderer/features/session/SessionSidebar.tsx` | 删除 Session 时同步调用 deleteSessionMessages |
| `tailwind.config.js` | 新增 panel-left / panel-center / panel-right 色值 |

---

## 六、安全规范

### 6.1 DevTool 面板

- **生产环境禁用**：通过 `import.meta.env.DEV` 判断，生产环境不注册快捷键、不渲染扳手按钮
- **状态隔离**：`useDevToolStore` 不持久化，重启后默认关闭

### 6.2 Markdown 渲染

- react-markdown 默认安全，不解析原始 HTML（无 `rehype-raw` 时不支持内联 HTML）
- 链接强制 `target="_blank" rel="noopener noreferrer"`，避免钓鱼风险
- 代码块仅做样式渲染，不执行

### 6.3 持久化数据

- localStorage 键名加 `ainvest:` 前缀，避免与其他应用冲突
- persist 配置 `partialize` 严格限制持久化字段，不存运行时状态

---

## 七、性能规范

| 指标 | 阈值 | 说明 |
|------|------|------|
| 行情看板总览首次渲染 | < 300ms | 含 3 个 Mock 请求并行 |
| 个股走势图切换 | < 200ms | recharts 数据更新 + 重绘 |
| Markdown 渲染切换 | < 50ms | 从纯文本切换到 react-markdown |
| 消息列表滚动 | 无卡顿 | 流式期间禁止 Markdown AST 重建 |
| localStorage 写入 | 不阻塞发送 | persist 中间件异步写入 |
| 三栏背景色渲染 | 无闪烁 | Tailwind 类名切换，无 JS 计算 |

---

## 八、风险与应对

| 风险 | 等级 | 应对 |
|------|------|------|
| ChatStore 重构引入 regression（消息发送/接收/切换异常） | **高** | 重构后完整走通：发送 → 回复 → 切换 Session → 切回 → 重启 |
| react-markdown 与流式追加冲突导致滚动卡顿 | 中 | 流式期间纯文本渲染，仅 completed 后切 Markdown |
| recharts 深色主题文字/轴线不可见 | 低 | 强制设置 stroke="#9ca3af" 等暗色主题适配 |
| localStorage 容量超限（>5MB） | 低 | persist 加 onError 回调，超限 Toast 提示清理旧 Session |
| 多市场股票数据格式不一致（价格/市值单位混用） | 中 | Mock 数据显式标注 market 字段，渲染层按 market 本地化格式 |
| DevTool 按钮生产环境泄露 | 低 | `import.meta.env.DEV` 条件渲染，Review 时重点检查 |
| 涨跌分布柱状图数据总和不合理 | 低 | Mock 生成时约束总和为固定值（如 5000 只） |

---

## 九、验收标准

- [ ] Mock 数据：腾讯/阿里/英伟达行情、档案、走势数据完整
- [ ] 行情总览：指数看板 + 涨跌分布柱状图 + 行业板块均正常展示
- [ ] 自选股：默认展示 AAPL/TSLA/0700.HK/9988.HK/NVDA
- [ ] 个股走势图：30 日折线图正确渲染，随股票切换更新
- [ ] 消息持久化：重启后所有 Session 消息完整保留，切换 Session 无丢失
- [ ] Markdown 渲染：加粗/列表/代码块/引用/链接正确渲染，流式期间不卡顿
- [ ] 三栏背景色：肉眼可感知微妙差异，卡片显示无冲突
- [ ] DevTool 按钮：DEV 环境可见可开关，生产环境不显示，快捷键不受影响
- [ ] TypeScript 编译零报错
- [ ] 现有 v3 功能无 regression（Thinking 块、快捷工具、自动命名、DevTool 快捷键）

---

*文档版本：v1.0*
*最后更新：2026-06-06*
