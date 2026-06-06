# 01. 项目目录结构与模块边界

> **目标**：读完本文档，你能知道项目里每个文件夹是干什么的，以及模块之间的"红线"在哪里。

---

## 一、完整目录结构（v1 版本）

```
ainvest-electron/
├── electron/                           # Electron 相关配置（不是业务代码）
│   ├── main.ts                         # 主进程入口：创建窗口、注册 IPC
│   ├── preload.ts                      # Preload 脚本：安全地暴露 API 给渲染进程
│   └── vite.config.ts                  # Electron 的 Vite 配置
│
├── src/                                # ====== 核心业务代码 ======
│   ├── main/                           # 主进程业务代码（v1 较少，主要是文件读写）
│   │   ├── ipc/                        # IPC 处理器注册
│   │   │   ├── handlers/               # 按领域分组的 IPC 处理函数
│   │   │   │   ├── session.handlers.ts # Session 相关 IPC：创建、读取、保存
│   │   │   │   ├── file.handlers.ts    # 文件系统 IPC：读、写、删除
│   │   │   │   └── preference.handlers.ts # 偏好设置 IPC
│   │   │   └── register.ts             # 统一注册所有 IPC 处理器
│   │   ├── services/                   # 主进程服务层
│   │   │   └── fileService.ts          # 文件读写封装（抽象 Node.js fs）
│   │   └── utils/                      # 主进程工具函数
│   │       └── paths.ts                # 路径常量（userData 下的目录结构）
│   │
│   ├── renderer/                       # 渲染进程业务代码（这是大头，90% 代码在这里）
│   │   ├── main.tsx                    # 渲染进程入口：挂载 React App
│   │   ├── App.tsx                     # 根组件：三栏布局的组装
│   │   │
│   │   ├── components/                 # 通用组件（跨模块复用）
│   │   │   ├── ui/                     # 原子级 UI 组件（Button、Input、Card）
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Card.tsx
│   │   │   │   ├── Badge.tsx           # 标签组件（用于显示涨跌幅红绿色）
│   │   │   │   └── ScrollArea.tsx      # 滚动区域（聊天和列表都用）
│   │   │   ├── layout/                 # 布局级组件
│   │   │   │   ├── TitleBar.tsx        # 自定义标题栏（Electron 无边框窗口）
│   │   │   │   ├── ResizablePanel.tsx  # 可拖拽调整宽度的面板（三栏布局用）
│   │   │   │   └── SplitPane.tsx       # 分栏容器
│   │   │   └── common/                 # 业务通用组件
│   │   │       ├── EmptyState.tsx      # 空状态占位图
│   │   │       ├── LoadingSpinner.tsx  # 加载动画
│   │   │       └── ErrorBoundary.tsx   # 错误边界（防止单个组件崩溃拖垮整个页面）
│   │   │
│   │   ├── features/                   # ====== 按功能模块组织的组件 ======
│   │   │   │                           # 每个 feature 是一个独立模块，内部自治
│   │   │   ├── market-panel/           # 【行情看板模块】
│   │   │   │   ├── index.tsx           # 模块入口：MarketPanel 根组件
│   │   │   │   ├── components/         # 模块内部组件
│   │   │   │   │   ├── MarketOverview.tsx    # 行情总览页
│   │   │   │   │   ├── StockDetail.tsx       # 个股详情页
│   │   │   │   │   ├── IndexCard.tsx         # 指数卡片（上证指数等）
│   │   │   │   │   ├── WatchlistTable.tsx    # 自选股列表
│   │   │   │   │   ├── NewsList.tsx          # 新闻列表（行情看板内用）
│   │   │   │   │   └── StockMetrics.tsx      # 财务指标面板
│   │   │   │   ├── hooks/              # 模块内部 Hooks
│   │   │   │   │   └── useStockData.ts # 获取个股数据的 Hook
│   │   │   │   └── types.ts            # 模块内部类型（行情看板专属类型）
│   │   │   │
│   │   │   ├── chat-panel/             # 【聊天面板模块】
│   │   │   │   ├── index.tsx           # ChatPanel 根组件
│   │   │   │   ├── components/
│   │   │   │   │   ├── ChatMessageList.tsx   # 消息列表容器（滚动管理）
│   │   │   │   │   ├── UserMessageBubble.tsx # 用户消息气泡（右对齐）
│   │   │   │   │   ├── AgentMessageBubble.tsx# Agent 消息气泡（左对齐）
│   │   │   │   │   ├── ThinkingBlock.tsx     # 思考过程折叠区
│   │   │   │   │   ├── ToolCallCard.tsx      # 工具调用展示卡片
│   │   │   │   │   ├── MarketResultCard.tsx  # 行情查询结果卡片
│   │   │   │   │   ├── NewsResultList.tsx    # 新闻查询结果列表
│   │   │   │   │   ├── BacktestResultCard.tsx# 策略回测结果卡片
│   │   │   │   │   └── StockLink.tsx         # 【关键】个股可点击链接
│   │   │   │   ├── hooks/
│   │   │   │   │   ├── useChatScroll.ts      # 自动滚动到底部
│   │   │   │   │   └── useMessageParser.ts   # 解析消息中的【个股】链接
│   │   │   │   └── types.ts
│   │   │   │
│   │   │   ├── session-sidebar/        # 【Session 侧边栏模块】
│   │   │   │   ├── index.tsx           # SessionSidebar 根组件
│   │   │   │   ├── components/
│   │   │   │   │   ├── SessionList.tsx       # Session 列表
│   │   │   │   │   ├── SessionItem.tsx       # 单个 Session 项
│   │   │   │   │   ├── NewSessionButton.tsx  # 新建按钮
│   │   │   │   │   └── SessionContextMenu.tsx# 右键菜单（重命名/删除）
│   │   │   │   └── types.ts
│   │   │   │
│   │   │   ├── command-bar/            # 【快捷指令栏模块】
│   │   │   │   ├── index.tsx           # CommandBar 根组件
│   │   │   │   ├── components/
│   │   │   │   │   └── CommandButton.tsx     # 单个指令按钮
│   │   │   │   └── constants.ts        # 指令定义常量
│   │   │   │
│   │   │   └── settings/               # 【设置面板模块】
│   │   │       ├── index.tsx           # SettingsPanel 根组件
│   │   │       └── components/
│   │   │           ├── ThemeSelector.tsx
│   │   │           ├── MarketSelector.tsx
│   │   │           └── LanguageSelector.tsx
│   │   │
│   │   ├── stores/                     # ====== Zustand 全局状态 ======
│   │   │   ├── useSessionStore.ts      # Session 列表 + 当前 Session
│   │   │   ├── useChatStore.ts         # 当前 Session 的消息列表
│   │   │   ├── useMarketStore.ts       # 【新增】行情看板状态（视图、当前个股）
│   │   │   ├── usePreferenceStore.ts   # 用户偏好设置
│   │   │   ├── useToolStore.ts         # 工具调用状态（当前调用中、结果缓存）
│   │   │   └── index.ts                # 统一导出所有 Store
│   │   │
│   │   ├── services/                   # ====== 服务层（业务逻辑） ======
│   │   │   ├── mock/                   # Mock 服务（v1 全部在这里）
│   │   │   │   ├── marketMock.ts       # 行情查询 Mock
│   │   │   │   ├── newsMock.ts         # 新闻检索 Mock
│   │   │   │   ├── strategyMock.ts     # 策略回测 Mock
│   │   │   │   ├── stockProfileMock.ts # 股票档案 Mock
│   │   │   │   └── index.ts            # 统一导出 + 工具注册表
│   │   │   ├── agent/                  # Agent 核心逻辑
│   │   │   │   ├── intentRecognizer.ts # 意图识别（硬编码规则）
│   │   │   │   ├── agentEngine.ts      # Agent 引擎（接收输入 → 识别 → 调用工具 → 回复）
│   │   │   │   └── messageBuilder.ts   # 消息构建（组装 Agent 回复文本）
│   │   │   └── persistence/            # 持久化服务（封装读写操作）
│   │   │       ├── localStorageService.ts # localStorage 读写封装
│   │   │       └── ipcFileService.ts      # 通过 IPC 调用主进程的文件读写
│   │   │
│   │   ├── hooks/                      # 全局通用 Hooks（跨 feature 复用）
│   │   │   └── useDebounce.ts          # 防抖 Hook（搜索输入用）
│   │   │
│   │   ├── types/                      # 全局共享类型
│   │   │   ├── index.ts                # 统一导出
│   │   │   ├── session.ts              # Session 相关类型
│   │   │   ├── message.ts              # 聊天消息类型
│   │   │   ├── tool.ts                 # 工具调用相关类型
│   │   │   ├── market.ts               # 行情数据类型
│   │   │   └── preference.ts           # 用户偏好类型
│   │   │
│   │   ├── utils/                      # 纯工具函数（无副作用）
│   │   │   ├── formatters.ts           # 格式化（价格、涨跌幅、时间）
│   │   │   ├── validators.ts           # 校验（股票代码格式等）
│   │   │   ├── stockRegex.ts           # 【关键】股票名称/代码正则匹配
│   │   │   └── constants.ts            # 全局常量
│   │   │
│   │   └── styles/                     # 全局样式
│   │       └── globals.css             # Tailwind 导入 + 全局 CSS 变量
│   │
│   └── shared/                         # 主进程和渲染进程共享的代码
│       ├── types/                      # 共享类型（IPC 参数/返回值类型）
│       │   └── ipc.ts                  # IPC 通道类型定义
│       └── constants.ts                # 共享常量（IPC 通道名、存储路径）
│
├── docs/                               # 文档（你正在看的）
│   ├── prd/
│   │   └── v1-prd.md
│   └── arch/                           # 技术架构文档
│       ├── 01-overview.md              # ← 你在这里
│       ├── 02-electron-process.md
│       ├── 03-state-management.md
│       ├── 04-mock-services.md
│       ├── 05-market-panel.md
│       ├── 06-chat-panel.md
│       ├── 07-session-management.md
│       ├── 08-persistence.md
│       └── 09-sequencing.md
│
├── public/                             # 静态资源（不经过构建）
│   └── fonts/                          # 自定义字体
│
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── eslint.config.js
└── prettier.config.js
```

---

## 二、目录设计说明（为什么这样分）

### 2.1 `features/` 目录：按功能模块组织

**问题**：如果按 `components/`、`hooks/`、`utils/` 这种"类型"来分文件夹，一个功能模块的文件会散落在各处，新人找不到代码。

**解决**：按功能模块（feature）组织，一个模块的所有文件放在一起。

```
features/market-panel/     ← 行情看板的所有东西都在这里
features/chat-panel/       ← 聊天面板的所有东西都在这里
```

**规则**：
- feature 内部可以有自己的 `components/`、`hooks/`、`types.ts`
- feature 之间不能直接 import 对方的内部文件（只能 import 对方的 `index.tsx` 导出的公共接口）
- 跨 feature 共享的代码放到 `renderer/components/common/` 或 `renderer/hooks/`

### 2.2 `components/ui/` 目录：原子组件

这里放的是最基础的 UI 元素，**不包含业务逻辑**，只负责展示。

| 组件 | 职责 | 示例 |
|------|------|------|
| `Button` | 按钮 | `<Button variant="primary">发送</Button>` |
| `Input` | 输入框 | `<Input placeholder="请输入..." />` |
| `Card` | 卡片容器 | `<Card><Card.Header>标题</Card.Header>...</Card>` |
| `Badge` | 标签 | `<Badge color={change > 0 ? 'red' : 'green'}>+2.5%</Badge>` |

**规则**：
- ui 组件不能 import Store、不能 import feature 组件
- 所有 props 必须有 interface 定义
- 必须有 `className` prop 支持外部样式覆盖

### 2.3 `stores/` 目录：全局状态

每个 Store 一个文件，**不要在一个文件里写多个 Store**。

Store 是**唯一允许跨 feature 被 import** 的东西，因为状态管理本身就是跨模块的。

### 2.4 `services/` 目录：业务逻辑层

**原则**：组件只负责展示，业务逻辑放在 service 里。

```typescript
// ❌ 错误：组件里直接写业务逻辑
function ChatPanel() {
  const handleSend = async (text: string) => {
    // 这里写了一大堆识别意图、调用工具的代码...
  };
}

// ✅ 正确：组件只调用 service
function ChatPanel() {
  const handleSend = async (text: string) => {
    await agentEngine.processUserInput(text);
  };
}
```

### 2.5 `shared/` 目录：进程间共享

Electron 的主进程和渲染进程是两个独立的运行环境，但它们可以共享类型定义和常量。

```typescript
// shared/types/ipc.ts
// 这个文件同时被主进程和渲染进程 import
export interface IpcChannels {
  'session:save': {
    request: { sessionId: string; messages: ChatMessage[] };
    response: { success: boolean };
  };
}
```

---

## 三、模块边界（红线：谁可以调用谁）

### 3.1 模块依赖规则

```
┌─────────────────────────────────────────────────────────────┐
│                         渲染进程                              │
│  ┌──────────────┐                                          │
│  │  UI 组件层    │ ← 只能被 feature 组件 import               │
│  │  (components/ui)│ 不能 import Store、不能 import service   │
│  └──────┬───────┘                                          │
│         │                                                   │
│  ┌──────┴───────┐                                          │
│  │  Feature 组件 │ ← 可以 import UI 组件、Store、service      │
│  │  (features/*) │ 不能 import 其他 feature 的内部文件        │
│  └──────┬───────┘                                          │
│         │                                                   │
│  ┌──────┴───────┐                                          │
│  │   Store 层    │ ← 可以被任何组件 import                    │
│  │  (stores/*)   │ 不能 import 组件（避免循环依赖）           │
│  └──────┬───────┘                                          │
│         │                                                   │
│  ┌──────┴───────┐                                          │
│  │  Service 层   │ ← 可以被 Store 和组件 import               │
│  │ (services/*)  │ 不能 import 组件（避免循环依赖）           │
│  └──────┬───────┘                                          │
│         │                                                   │
│  ┌──────┴───────┐                                          │
│  │ 持久化层      │ ← 只能被 service import                    │
│  │(persistence/*)│ 组件和 Store 不能直接调用                  │
│  └──────────────┘                                          │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 禁止的依赖关系（发现就改）

| 禁止行为 | 原因 |
|---------|------|
| `components/ui/*` import Store | UI 组件应该是纯展示的 |
| `features/A/*` import `features/B/components/*` | 破坏模块边界，应该通过事件或 Store 通信 |
| `stores/*` import `components/*` | 会导致循环依赖 |
| `services/*` import `components/*` | 业务逻辑层不应该知道展示层 |
| 组件直接调用 `fs` 或 `localStorage` | 必须通过 persistence 层封装 |

### 3.3 允许的跨模块通信方式

如果两个 feature 需要通信，**只允许以下三种方式**：

1. **通过 Zustand Store**（推荐，用于状态共享）
   ```typescript
   // ChatPanel 点击个股链接
   useMarketStore.getState().setActiveSymbol('600519.SH');
   // MarketPanel 自动响应状态变化
   ```

2. **通过回调函数 props**（仅用于父子组件）
   ```typescript
   <Parent onSomething={() => childAction()}>
     <Child />
   </Parent>
   ```

3. **通过全局事件**（仅用于彻底解耦的场景，如键盘快捷键）
   ```typescript
   // 极少数场景使用，v1 大概率用不到
   window.dispatchEvent(new CustomEvent('global:theme-change'));
   ```

---

## 四、Feature 模块详解

### 4.1 行情看板（market-panel）

**职责**：展示行情数据，支持总览/个股视图切换。

**对外接口**（index.tsx 导出）：
```typescript
export function MarketPanel(): JSX.Element;
```

**内部组成**：
- `MarketOverview`：行情总览页（指数 + 自选股 + 新闻）
- `StockDetail`：个股详情页（基本信息 + 行情 + 新闻 + 财务）
- 视图切换由 `useMarketStore` 驱动，外部无需关心

### 4.2 聊天面板（chat-panel）

**职责**：消息展示、用户输入、Agent 交互、个股链接渲染。

**对外接口**：
```typescript
export function ChatPanel(): JSX.Element;
```

**内部组成**：
- `ChatMessageList`：消息滚动容器
- `UserMessageBubble` / `AgentMessageBubble`：消息气泡
- `StockLink`：【关键】将【贵州茅台】渲染为可点击链接，点击后更新 `useMarketStore`
- `CommandBar`：快捷指令栏（虽然在布局上独立，但属于聊天面板的功能域）

### 4.3 Session 侧边栏（session-sidebar）

**职责**：展示 Session 列表，支持增删改查。

**对外接口**：
```typescript
export function SessionSidebar(): JSX.Element;
```

### 4.4 快捷指令栏（command-bar）

**职责**：展示快捷指令按钮，点击后填充输入框或执行操作。

**对外接口**：
```typescript
export function CommandBar(props: {
  onCommandClick: (command: string) => void;
}): JSX.Element;
```

---

## 五、新增文件清单（相对于空项目）

以下是 v1 需要**新建**的所有文件（按优先级排序）：

### P0（MVP 必须）
```
src/renderer/App.tsx
src/renderer/main.tsx
src/renderer/features/market-panel/index.tsx
src/renderer/features/market-panel/components/MarketOverview.tsx
src/renderer/features/market-panel/components/StockDetail.tsx
src/renderer/features/chat-panel/index.tsx
src/renderer/features/chat-panel/components/ChatMessageList.tsx
src/renderer/features/chat-panel/components/AgentMessageBubble.tsx
src/renderer/features/chat-panel/components/StockLink.tsx
src/renderer/features/session-sidebar/index.tsx
src/renderer/features/command-bar/index.tsx
src/renderer/stores/useSessionStore.ts
src/renderer/stores/useChatStore.ts
src/renderer/stores/useMarketStore.ts
src/renderer/stores/usePreferenceStore.ts
src/renderer/stores/useToolStore.ts
src/renderer/services/mock/marketMock.ts
src/renderer/services/mock/newsMock.ts
src/renderer/services/mock/strategyMock.ts
src/renderer/services/agent/agentEngine.ts
src/renderer/services/agent/intentRecognizer.ts
src/renderer/services/persistence/localStorageService.ts
src/renderer/services/persistence/ipcFileService.ts
src/renderer/types/*.ts
src/renderer/utils/formatters.ts
src/renderer/utils/stockRegex.ts
electron/main.ts
electron/preload.ts
src/shared/types/ipc.ts
src/shared/constants.ts
```

### P1（有更好，没有也能跑）
```
src/renderer/components/ui/*.tsx
src/renderer/features/market-panel/components/IndexCard.tsx
src/renderer/features/market-panel/components/WatchlistTable.tsx
src/renderer/features/market-panel/components/StockMetrics.tsx
src/renderer/features/chat-panel/components/ThinkingBlock.tsx
src/renderer/features/chat-panel/components/ToolCallCard.tsx
src/renderer/features/settings/index.tsx
```

---

> **下一步**：阅读 `02-electron-process.md`，理解 Electron 三个进程的分工和通信方式。
