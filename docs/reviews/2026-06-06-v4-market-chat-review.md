# Code Review 报告

## 基本信息
- Review 日期：2026-06-06
- Review 范围：V4 行情看板与聊天体验增强（全部 Phase 1~3）
- Developer：Developer（AI Agent）
- Reviewer：Reviewer（AI Agent）
- 依据：`docs/prd/v4-prd.md` + `docs/arch/v4-market-chat-enhancement.md`

---

## 总体评价

- [ ] 通过（无 BLOCKER）
- [x] **有条件通过（有 BLOCKER，修复后通过）**
- [ ] 不通过（需重大重构）

**评价说明**：整体代码质量良好，架构符合技术文档要求，PRD 功能基本覆盖。发现 **1 个 BLOCKER**（MarkdownRenderer 嵌套 `<pre>`），**2 个 WARNING**，**4 个 SUGGESTION**。修复 BLOCKER 后可通过。

---

## 详细审查

### 文件：`src/renderer/features/chat/components/MarketdownRenderer.tsx`

#### [BLOCKER] `code` 组件内部渲染 `<pre>` 导致 HTML 嵌套
- **位置**：第 22-33 行
- **问题**：`code` 组件在 block 模式下返回了 `<pre><code>...</code></pre>`，但 react-markdown 渲染 fenced code block 时，**默认会在 `code` 外部再包裹一层 `<pre>`**。最终输出为 `<pre><pre class="...">...</pre></pre>`，HTML 语义错误。
- **建议**：拆分 `pre` 和 `code` 组件。`pre` 负责代码块外层样式，`code` 只负责 `<code>` 标签本身：
  ```tsx
  code: ({ children, className }) => {
    const isInline = !className
    return isInline ? (
      <code className="rounded bg-background px-1 py-0.5 font-mono text-xs text-primary">
        {children}
      </code>
    ) : (
      <code className="font-mono text-xs text-text-secondary">{children}</code>
    )
  },
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-md border border-border bg-background p-2">
      {children}
    </pre>
  ),
  ```
- **影响**：代码块显示样式异常（双重边框/背景），可访问性受损

---

### 文件：`src/renderer/features/chat/MessageItem.tsx`

#### [WARNING] 流式期间 react-markdown 频繁 re-render 可能导致滚动卡顿
- **位置**：第 64 行（`MarkdownRenderer` 调用处）
- **问题**：Agent 消息在流式追加（`appendAssistantContent`）期间，`content` 每收到一个 chunk 就会变化，触发 `MarkdownRenderer` 重新解析整个 Markdown AST。高频 chunk（如 mock 模式的 15ms 间隔）下可能导致消息列表滚动卡顿。
- **建议**：短期可接受（当前消息量不大）。后续优化方案：
  1. 给 `ChatMessage` 添加 `status?: 'streaming' | 'completed'` 字段
  2. 流式期间（`status === 'streaming'`）用 `<span className="whitespace-pre-wrap">{content}</span>` 纯文本渲染
  3. 流式完成后（`onDone` 时更新 `status: 'completed'`）切换为 `MarkdownRenderer`
- **影响**：低频率 API 场景下无感知；mock 高频场景可能有轻微卡顿

---

### 文件：`src/renderer/services/mocks/index.ts`

#### [WARNING] `generatePriceHistory` 纯随机导致同一 symbol 图表不稳定
- **位置**：第 245 行附近（`generatePriceHistory` 函数）
- **问题**：`Math.random()` 每次调用生成不同序列。用户在同一 Session 内多次切换同一只股票，每次看到的走势图形状都不同，体验不一致。
- **建议**：基于 symbol 做 seeded random。例如：
  ```typescript
  const seededRandom = (seed: string) => {
    let hash = 0
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
    }
    return () => {
      hash = (hash * 16807 + 0) % 2147483647
      return (hash - 1) / 2147483646
    }
  }
  // 使用 const rng = seededRandom(symbol + currentPrice.toFixed(2))
  ```
- **影响**：用户感知到图表不稳定，投研体验受损

#### [SUGGESTION] `queryMarketIndices` 等 Mock 接口返回固定值
- **位置**：第 273-320 行
- **问题**：PRD 要求"涨跌幅在 -2%~+2% 之间随机"，当前实现为固定值（道琼斯 +0.42%、纳斯达克 +0.88%、标普500 +0.56%）。
- **建议**：添加小幅随机波动，如 `changePercent: 0.42 + (Math.random() - 0.5) * 0.3`，使每次启动有细微差异。
- **影响**：低，功能正常但缺乏"生气"

---

### 文件：`src/renderer/features/market/MarketOverview.tsx`

#### [SUGGESTION] 保留了 PRD 原型之外的"市场行情"股票卡片列表
- **位置**：第 72-97 行
- **问题**：PRD 的界面原型（6.1）中，总览页仅包含指数看板 + 涨跌分布 + 行业板块。当前实现额外保留了原有的"市场行情"股票卡片列表，导致左侧看板内容过多。
- **建议**：考虑将股票卡片列表移除，或折叠为更紧凑的形式（如只展示涨跌最快的 3 只）。当前内容可滚动，不阻塞功能。
- **影响**：信息密度过高，用户需要更多滚动

#### [SUGGESTION] `stocks` 使用 `useState(getAllMarketData())` 没有必要
- **位置**：第 24 行
- **问题**：`getAllMarketData()` 是纯同步函数，返回值不会变化，不需要用 `useState` 缓存。
- **建议**：改为 `const stocks = getAllMarketData()`，减少一次 Hook 调用。
- **影响**：微乎其微，但增加不必要的 Hook 开销

---

### 文件：`src/renderer/features/market/components/IndexCard.tsx`

#### [SUGGESTION] `toLocaleString()` 受系统 locale 影响
- **位置**：第 19 行
- **问题**：`data.point.toLocaleString()` 会按用户操作系统 locale 格式化数字。例如 en-US 显示 `42,150.3`，de-DE 显示 `42.150,3`。投研场景下数字格式不一致可能引发困惑。
- **建议**：统一使用 `toLocaleString('en-US')`，确保全球用户看到一致的格式。
- **影响**：仅在非 en-US locale 的系统上显现

---

### 文件：`src/renderer/features/market/WatchList.tsx`

#### [SUGGESTION] 自选股列表未持久化
- **位置**：第 14 行
- **问题**：`watchSymbols` 使用 `useState`，刷新页面后重置为默认值。PRD 验收标准提到"新建应用或清空自选股后，默认展示上述 5 只"，暗示持久化是期望行为。
- **建议**：后续版本可将 watchlist 存入 `localStorage` 或通过 Zustand persist 持久化。
- **影响**：低，当前行为与 v3 一致，用户可接受

---

### 文件：`src/renderer/stores/useChatStore.ts`

**审查结论**：✅ 符合规范
- persist 中间件配置正确，`partialize` 仅持久化 `messagesBySession`
- `isLoading` 等运行时状态未持久化，正确
- persist key 命名 `ainvest-chat-messages` 符合规范

---

### 文件：`src/renderer/stores/useDevToolStore.ts`

**审查结论**：✅ 符合规范
- 不持久化，运行时状态，正确
- 提供 `toggle` / `open` / `close` 三种操作，完整

---

### 文件：`src/renderer/features/layout/MainLayout.tsx`

**审查结论**：✅ 符合规范
- 三栏背景色差异化实现正确（`bg-panel-left` / `bg-panel-center` / `bg-panel-right`）
- DevTool 状态从 `useState` 提升到 `useDevToolStore`，按钮与快捷键状态同步
- `import.meta.env.DEV` 条件渲染，生产环境安全
- 快捷键事件监听正确清理（`return () => window.removeEventListener(...)`）

---

### 文件：`src/renderer/features/market/components/MarketDistributionChart.tsx`

**审查结论**：✅ 符合规范
- recharts 按需引入（BarChart/Bar/XAxis/YAxis/CartesianGrid/Tooltip/ResponsiveContainer/Cell），全部在白名单内
- 深色主题适配正确（stroke `#9ca3af`，Tooltip 暗色背景）
- 涨跌颜色区分正确（上涨绿色 `#22c55e`，下跌红色 `#ef4444`）

---

### 文件：`src/renderer/features/market/components/StockChart.tsx`

**审查结论**：✅ 符合规范
- recharts 按需引入（AreaChart/Area/XAxis/YAxis/CartesianGrid/Tooltip/ResponsiveContainer），全部在白名单内
- gradient ID 使用 `gradient-${symbol}` 保证唯一性，正确
- 加载态有骨架屏（`animate-pulse`），体验良好
- `cancelled` 标志防止竞态，正确

---

### 文件：`src/renderer/features/market/StockDetail.tsx`

**审查结论**：✅ 符合规范
- `StockChart` 集成位置正确（公司档案下方）
- `isUp` 计算在 `!symbol` 提前返回之后，安全
- `market` 为 null 时 fallback 为 `true`（上涨色），合理

---

### 文件：`src/renderer/features/session/SessionSidebar.tsx`

**审查结论**：✅ 符合规范
- 删除 Session 时同步调用 `clearMessages(session.id)`，消息与 Session 状态一致
- 顺序：先清理消息再删除 Session，避免消息孤儿

---

### 文件：`src/renderer/features/chat/ChatPanel.tsx`

**审查结论**：✅ 符合规范
- 扳手按钮仅 DEV 环境显示（`import.meta.env.DEV`），正确
- `toggleDevTool` 来自 zustand store，未加入 `handleSend` 依赖数组，正确
- 按钮 `title` 属性提供可访问性提示

---

### 文件：`tailwind.config.js`

**审查结论**：✅ 符合规范
- 色值命名语义化（`panel-left` / `panel-center` / `panel-right`）
- 未改动 `background` 主色值，中间栏保持基准色，正确

---

## 修复确认

Developer 修复后，Reviewer 确认以下项目：

- [ ] **BLOCKER-1**：MarkdownRenderer 拆分 `pre` 和 `code` 组件，消除嵌套 `<pre>`
- [ ] **WARNING-1**（可选）：MessageItem 流式期间降级为纯文本（非必须，可放后续迭代）
- [ ] **WARNING-2**（可选）：`generatePriceHistory` 基于 symbol 做 seeded random（非必须，可放后续迭代）

---

## 统计

| 级别 | 数量 | 说明 |
|------|------|------|
| BLOCKER | 1 | 必须修复 |
| WARNING | 2 | 建议修复，不阻塞 |
| SUGGESTION | 4 | 可选优化 |
| 通过 | 9 | 无问题 |

---

*报告版本：v1.0*
*最后更新：2026-06-06*
