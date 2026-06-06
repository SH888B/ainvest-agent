# AInvest v4.0.0 开发 - 审核 - 测试流程

> 版本：v4.0.0
> 日期：2026-06-06
> 状态：待启动
> 依据：`docs/prd/v4-prd.md` + `docs/arch/v4-market-chat-enhancement.md`

---

## 一、总体策略

### 1.1 分阶段串行开发

v4 功能存在明确的依赖链，采用 **Phase 串行 + Module 内串行** 策略。每个 Phase 完成后必须经过 Reviewer 审核和回归测试，方可进入下一阶段。

```
Phase 1 基础设施层
    ↓ [Reviewer 审核 + 回归测试通过]
Phase 2 行情看板层
    ↓ [Reviewer 审核 + 回归测试通过]
Phase 3 聊天体验层
    ↓ [Reviewer 审核 + 回归测试通过]
Phase 4 集成测试与收尾
    ↓ [最终验收]
v4.0.0 发布
```

### 1.2 人员分工

| 角色 | 职责 | 介入时机 |
|------|------|---------|
| **Developer** | 按 Module 实现代码，自测通过后提交 Review | 每个 Module 开始时 |
| **Reviewer** | 执行 Code Review，输出 Review 报告，标记 BLOCKER | Developer 提交后 |
| **Team Lead** | 协调资源、确认流程节点、最终验收 | 每个 Phase 结束、项目收尾 |

---

## 二、Phase 划分与依赖关系

### Phase 1：基础设施层（底层依赖）

**目标**：打好数据基础和状态管理基础，确保 Mock 数据可用、ChatStore 重构无 regression。

| Module | 说明 | 依赖 | 预估工时 |
|--------|------|------|---------|
| M1.1 Mock 数据扩充 | 新增腾讯/阿里/英伟达行情+档案+走势数据；新增走势数据生成器；新增 Mock 服务接口（指数/分布/板块/走势） | 无 | 2h |
| M1.2 ChatStore 重构 + persist | messages → messagesBySession 重构；所有 action 增加 sessionId 参数；添加 zustand/persist；组件层读取方式适配 | 无 | 3h |
| M1.3 Tailwind 背景色 + DevTool Store | tailwind.config.js 新增 panel-* 色值；新建 useDevToolStore | 无 | 1h |

**串行顺序**：M1.1 → M1.2 → M1.3
- M1.1 优先：Mock 数据是上层所有功能的基础
- M1.2 次之：高风险的 Store 重构，需尽早完成并充分测试
- M1.3 最后：纯配置和轻量 Store，无依赖风险

**关键交付物**：
- `src/renderer/services/mocks/index.ts`（扩充）
- `src/renderer/services/mocks/chartDataGenerator.ts`（新增）
- `src/renderer/stores/useChatStore.ts`（重构）
- `src/renderer/stores/useDevToolStore.ts`（新增）
- `tailwind.config.js`（扩展色值）

**验收标准**：
- [ ] TypeScript 编译零报错
- [ ] Mock 数据：5 只默认股票 + 3 只新增股票行情数据完整
- [ ] 走势数据生成器：输入当前价，输出 30 个数据点，最后一日收敛到当前价
- [ ] ChatStore 重构：能正常发送/接收消息，切换 Session 消息不丢
- [ ] persist 生效：重启应用后，messagesBySession 从 localStorage 恢复
- [ ] DevTool Store：toggle/open/close 正常

---

### Phase 2：行情看板层（P0 功能）

**目标**：完成左侧行情看板的全面升级。

| Module | 说明 | 依赖 | 预估工时 |
|--------|------|------|---------|
| M2.1 行情总览 redesign | MarketIndexBoard（3 指数卡片）+ MarketDistributionChart（recharts 横向柱状图）+ SectorLeaderboard（Top 5 涨幅/跌幅） | M1.1 | 4h |
| M2.2 自选股更新 + 个股走势图 | WatchList 默认列表更新；StockDetail 下方集成 StockChart（recharts AreaChart）；走势数据随股票切换更新 | M1.1, M1.2 | 2h |

**串行顺序**：M2.1 → M2.2
- M2.1 优先：总览页是行情看板的核心，组件多、交互复杂
- M2.2 次之：依赖 M2.1 中的 recharts 引入和主题适配经验

**关键交付物**：
- `src/renderer/features/market/components/MarketIndexBoard.tsx`
- `src/renderer/features/market/components/IndexCard.tsx`
- `src/renderer/features/market/components/MarketDistributionChart.tsx`
- `src/renderer/features/market/components/SectorLeaderboard.tsx`
- `src/renderer/features/market/components/StockChart.tsx`
- `src/renderer/features/market/MarketOverview.tsx`（修改）
- `src/renderer/features/market/WatchList.tsx`（修改）
- `src/renderer/features/market/StockDetail.tsx`（修改）

**验收标准**：
- [ ] 指数看板：3 个指数点位和涨跌幅正确展示，涨跌颜色正确（红涨绿跌）
- [ ] 涨跌分布图：8 个区间横向柱状图正常渲染，颜色区分上涨/下跌/平盘
- [ ] 行业板块：涨幅 Top 5 + 跌幅 Top 5 正确展示，两列布局
- [ ] 行情看板内容超过高度时可滚轮滚动
- [ ] 自选股：默认展示 AAPL/TSLA/0700.HK/9988.HK/NVDA
- [ ] 个股走势图：30 日折线图正确渲染，切换股票后数据正确更新
- [ ] 图表整体涨跌趋势决定填充色（上涨绿色渐变，下跌红色渐变）
- [ ] 行情看板总览首次渲染 < 300ms
- [ ] 个股走势图切换 < 200ms

---

### Phase 3：聊天体验层（P0 + P1 功能）

**目标**：完成聊天面板体验优化和 DevTool 显式开关。

| Module | 说明 | 依赖 | 预估工时 |
|--------|------|------|---------|
| M3.1 Markdown 渲染集成 | MarkdownRenderer 组件（react-markdown + 自定义样式）；MessageItem 流式策略（纯文本 → Markdown 切换） | M1.2 | 2h |
| M3.2 DevTool 按钮 + 三栏背景色 | ChatPanel 顶部扳手按钮（DEV 环境）；MainLayout 三栏背景色差异化 | M1.3 | 1h |

**串行顺序**：M3.1 → M3.2
- M3.1 优先：涉及消息渲染核心逻辑
- M3.2 次之：纯 UI 调整，无技术风险

**关键交付物**：
- `src/renderer/features/chat/components/MarkdownRenderer.tsx`
- `src/renderer/features/chat/MessageItem.tsx`（修改）
- `src/renderer/features/chat/ChatPanel.tsx`（修改）
- `src/renderer/features/layout/MainLayout.tsx`（修改）

**验收标准**：
- [ ] Agent 回复中的 `**text**` 正确渲染为加粗
- [ ] 列表语法正确渲染为带缩进的列表
- [ ] 代码块正确渲染为等宽字体 + 深色背景
- [ ] 引用块左侧有 primary 色边框
- [ ] 链接可点击，在新标签页打开
- [ ] 流式期间消息以纯文本展示，完成后自动切换为 Markdown
- [ ] 消息列表滚动无卡顿
- [ ] DevTool 扳手按钮仅在 DEV 环境可见
- [ ] 点击按钮 toggle DevTool 面板，与快捷键状态同步
- [ ] 三栏背景色有肉眼可感知的微妙差异

---

### Phase 4：集成测试与收尾

**目标**：全量回归测试 + 性能验证 + 文档更新。

| Module | 说明 | 依赖 | 预估工时 |
|--------|------|------|---------|
| M4.1 全量回归测试 | 验证 v3 功能无 regression：Thinking 块、快捷工具、自动命名、DevTool 快捷键、Session 管理 | Phase 1~3 | 2h |
| M4.2 性能验证 | 行情看板渲染耗时、走势图切换耗时、Markdown 切换耗时、消息滚动流畅度 | Phase 1~3 | 1h |
| M4.3 文档更新 | 更新 README、CHANGELOG、各模块文档中的接口变更 | Phase 1~3 | 1h |

**验收标准**：
- [ ] 现有 v3 功能无 regression
- [ ] TypeScript 编译零报错
- [ ] ESLint 零错误
- [ ] 性能指标全部达标
- [ ] 文档与代码一致

---

## 三、审核流程（Reviewer）

### 3.1 触发条件

Reviewer 在以下时机被调用：
1. Developer 完成一个 Module 的开发并自测通过
2. Developer 向 Reviewer 提交 Review 请求（附带变更说明和自测结果）

### 3.2 审核步骤

```
Developer 提交 Review 请求
    ↓
Reviewer 执行：
  1. 读取对应 Module 的 PRD 章节，确认需求覆盖度
  2. 读取架构文档，确认技术规范符合度
  3. 逐文件审查变更（git diff）
  4. 运行 TypeScript 编译检查
  5. 运行 ESLint 检查
  6. 检查关键逻辑分支和边界 case
    ↓
Reviewer 输出 Review 报告（docs/reviews/）
  - [BLOCKER] 必须修复
  - [WARNING] 建议修复
  - [SUGGESTION] 可选优化
    ↓
Developer 修复所有 [BLOCKER]
    ↓
Reviewer 确认修复，标记 "Review 通过"
    ↓
进入下一 Module / Phase
```

### 3.3 每个 Module 的 Reviewer 重点

| Module | Reviewer 重点检查项 |
|--------|-------------------|
| M1.1 Mock 数据 | 新增股票数据完整（price/change/volume/pe/pb/marketCap/industry/description/ceo/founded）；走势数据生成器最后一日收敛到当前价；A 股/港股/美股数据格式区分（价格精度、市值单位） |
| M1.2 ChatStore 重构 | `messagesBySession` 结构正确；所有 action 的 sessionId 参数无遗漏；persist 的 `partialize` 不持久化运行时状态；删除 Session 时同步清理消息；切换 Session 时消息正确加载 |
| M1.3 Tailwind + DevTool Store | 色值命名语义化（panel-left/center/right）；DevTool Store 不持久化；无 inline style |
| M2.1 行情总览 redesign | recharts 仅使用白名单组件；深色主题适配（stroke 颜色）；涨跌分布数据总和合理；行业板块至少覆盖 20 个；内容溢出时可滚动 |
| M2.2 自选股 + 走势图 | 默认 watchlist 为 5 只；StockChart 随 symbol 切换更新；AreaChart 渐变填充正确；30 个数据点完整 |
| M3.1 Markdown 渲染 | react-markdown 未引入 rehype-raw（防 XSS）；流式期间纯文本渲染逻辑正确（status !== 'completed'）；代码块/引用块/列表样式与深色主题一致；链接强制 target="_blank" |
| M3.2 DevTool 按钮 + 背景色 | `import.meta.env.DEV` 判断正确；按钮与快捷键状态同步；三栏色值肉眼可区分但差异克制；卡片（bg-surface）在三栏上显示正常 |

---

## 四、测试流程

### 4.1 三级测试

| 级别 | 执行者 | 时机 | 内容 |
|------|--------|------|------|
| **单元自测** | Developer | 每个 Module 完成后 | TypeScript 编译 + ESLint + 功能自测（按验收标准逐项勾选） |
| **回归测试** | Reviewer | 每个 Phase 结束后 | 全量功能走查 + v3 核心功能回归 |
| **集成验收** | Team Lead | 全部 Phase 完成后 | 完整用户流程走查 + 性能指标验证 + 视觉验收 |

### 4.2 回归测试基线

| 指标 | 基线值 | 允许波动 |
|------|--------|---------|
| TypeScript 编译 | 零报错 | 不允许警告 |
| ESLint | 零错误 | 警告需评估 |
| v3 功能回归 | 100% 通过 | Thinking 块 / 快捷工具 / 自动命名 / DevTool 快捷键 |

### 4.3 性能指标验证

| 指标 | 阈值 | 验证方式 |
|------|------|---------|
| 行情看板总览首次渲染 | < 300ms | 浏览器 Performance Tab |
| 个股走势图切换 | < 200ms | 肉眼观察 + Performance Tab |
| Markdown 渲染切换 | < 50ms | 肉眼观察 |
| 消息列表滚动 | 无卡顿 | 流式发送长消息时滚动测试 |
| localStorage 写入 | 不阻塞发送 | 发送消息后 UI 立即响应 |
| 三栏背景色渲染 | 无闪烁 | 肉眼观察 |

### 4.4 关键测试用例

**ChatStore 重构专项测试**：
1. 发送 3 条消息 → 切换 Session → 发送 2 条消息 → 切回原 Session → 验证 3 条消息完整
2. 删除有消息的 Session → 验证消息同步清理
3. 重启应用 → 验证所有 Session 消息从 localStorage 恢复
4. 清空 localStorage → 验证应用不崩溃，行为降级为无消息

**Markdown 渲染专项测试**：
1. Agent 回复包含加粗、列表、代码块、引用、链接 → 逐项验证渲染
2. 流式期间观察消息以纯文本追加 → 完成后自动切换为 Markdown
3. 长 Markdown 消息（>1000 字）滚动测试 → 验证无卡顿

**行情看板专项测试**：
1. 指数看板：验证 3 个指数的数值和涨跌颜色
2. 涨跌分布：验证 8 个区间都有数据，总和合理
3. 行业板块：验证涨幅/跌幅各 5 个，两列布局
4. 自选股：验证 5 只默认股票，点击可切详情
5. 走势图：验证 30 个数据点，颜色随趋势变化

---

## 五、风险与应对

| 风险 | 阶段 | 等级 | 应对 |
|------|------|------|------|
| ChatStore 重构引入全局 regression | Phase 1 | **高** | M1.2 单独作为重点 Module，Reviewer 做数据流专项审核；重构后跑 4.4 专项测试用例 |
| react-markdown 流式性能问题 | Phase 3 | 中 | M3.1 必须实现"流式纯文本 → 完成后 Markdown"策略，Reviewer 做滚动专项测试 |
| recharts 包体积过大 | Phase 2 | 低 | 严格按白名单按需引入，Review 时检查 import 语句 |
| localStorage 容量超限 | Phase 1 | 低 | persist 加 onError 处理，超限后 Toast 提示用户清理 |
| 多市场数据格式混乱 | Phase 2 | 中 | Mock 数据显式标注 market 字段，渲染层统一封装 formatPrice/formatMarketCap 函数 |
| DevTool 生产环境泄露 | Phase 3 | 低 | `import.meta.env.DEV` 条件渲染，Reviewer 安全专项 |
| Phase 2 recharts 主题适配耗时超预期 | Phase 2 | 中 | 预留 1h buffer，深色主题适配复杂时可简化（去掉网格线等） |

---

## 六、执行 Checklist

### Phase 1 启动前
- [ ] PRD 已评审通过
- [ ] 技术文档（`v4-market-chat-enhancement.md`）已确认
- [ ] developer.md 和 reviewer.md 已更新（如需）
- [ ] 基线功能已验证（v3 功能正常）

### 每个 Module 启动前
- [ ] 前置 Module 已完成并通过 Review
- [ ] Developer 已阅读对应 PRD 章节和架构文档章节

### 每个 Module 完成后
- [ ] Developer 自测通过（TypeScript + ESLint + 功能按验收标准逐项勾选）
- [ ] Developer 提交 Review 请求（含变更摘要和自测结果）
- [ ] Reviewer 输出初版报告（24h 内）
- [ ] Developer 修复所有 [BLOCKER]
- [ ] Reviewer 确认修复并标记通过

### Phase 完成后
- [ ] 运行回归测试（v3 核心功能走查）
- [ ] 运行性能指标验证
- [ ] Team Lead 确认进入下一阶段

### 项目收尾
- [ ] 全量验收标准逐项通过
- [ ] CHANGELOG.md 更新
- [ ] 文档归档

---

*文档版本：v1.0*
*最后更新：2026-06-06*
