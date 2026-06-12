# AInvest Agent 技术架构文档

> **版本**：v6.0.1  
> **最后更新**：2026-06-12  
> **状态**：唯一活架构文档（Living Document）  
> **本文档覆盖整个系统，不仅是增量变更**

---

## 一、系统概述

### 1.1 产品定义

AInvest Agent 是一个 **LLM 驱动的桌面智能投研助手**，基于 Electron 构建。用户通过自然语言对话，完成股票行情查询、金融网站实时信息抓取、策略回测、个股档案查看、本地脚本执行等投研任务。

### 1.2 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | Electron v42+ | 主进程 + 渲染进程 + Preload |
| 前端 | React 18 + TypeScript 5.6+ | 函数式组件 + Hooks |
| 状态管理 | Zustand v5 | 5 个 Store，带 persist 中间件 |
| 样式 | Tailwind CSS v3.4 | Dark mode |
| 构建 | electron-vite v3 | 主进程/渲染进程/Preload 分离构建 |
| 向量存储 | Vectra v0.15 | 本地向量索引，主进程 |
| LLM | 智谱 GLM / Kimi 等 | OpenAI-compatible API |
| Embedding | 智谱 AI Embedding-3 | 512 维，0.5 元/百万 Tokens |

### 1.3 核心架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        主进程 (Main Process)                      │
│                                                                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐           │
│  │ BrowserCDP   │ │ VectorStore  │ │ Shell        │           │
│  │ Service      │ │ Service      │ │ Executor     │           │
│  │ executeJS    │ │ Vectra 索引  │ │ 白名单校验    │           │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘           │
│         │                │                │                     │
│  ┌──────┴────────────────┴────────────────┴────────────────┐  │
│  │                    IPC Handlers                           │  │
│  │  browser:open/screenshot/close · memory:archive/search   │  │
│  │  shell:execute · persistence:readFile/writeFile          │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────┘
                                │ contextBridge
┌───────────────────────────────┼─────────────────────────────────┐
│                        渲染进程 (Renderer)                        │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                     Agent Engine                           │  │
│  │  classifyIntent → extractToolArgs → executeTool → streamChat│  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐           │
│  │ 意图分类器    │ │ 工具注册表    │ │ LLM 服务     │           │
│  │ 正则+LLM    │ │ 5 个工具     │ │ 流式对话     │           │
│  └──────────────┘ └──────────────┘ └──────────────┘           │
│                                                                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐           │
│  │ 记忆系统     │ │ Zustand      │ │ React UI     │           │
│  │ Embed+检索  │ │ 5 个 Store   │ │ 6 个 Feature │           │
│  └──────────────┘ └──────────────┘ └──────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、目录结构

```
src/
├── main/                          # 主进程
│   ├── index.ts                    # 入口：窗口创建 + IPC 注册
│   ├── ipcHandlers/                # IPC 处理器
│   │   ├── browser.ts             #   browser:open/screenshot/close
│   │   ├── memory.ts              #   memory:archive/search/query
│   │   └── shell.ts               #   shell:execute
│   └── services/                   # 主进程服务
│       ├── browserCDP.ts           #   浏览器自动化（executeJavaScript）
│       ├── logger.ts               #   日志服务
│       ├── shellExecutor.ts        #   Shell 执行器
│       └── vectorStore.ts          #   Vectra 向量索引管理
│
├── preload/                        # Preload 桥接
│   └── index.ts                    #   contextBridge 暴露 5 组 API
│
├── renderer/                       # 渲染进程
│   ├── App.tsx                     #   React 根组件
│   ├── main.tsx                    #   入口
│   ├── features/                   #   UI 功能模块
│   │   ├── chat/                   #     聊天面板
│   │   │   ├── ChatPanel.tsx       #       主容器（handleSend、inputRef）
│   │   │   ├── ChatInput.tsx       #       输入框（externalRef 模式）
│   │   │   ├── MessageList.tsx     #       消息列表（EMPTY_MESSAGES + ??）
│   │   │   ├── ThinkingBlock.tsx   #       思考过程展示
│   │   │   ├── BrowserToolCard.tsx #       浏览器工具卡片
│   │   │   └── QuickTools.tsx     #       快捷工具按钮栏
│   │   ├── session/                #     Session 侧边栏
│   │   │   └── SessionSidebar.tsx  #       列表+创建+归档
│   │   ├── settings/               #     设置页
│   │   │   ├── SettingsPage.tsx    #       主容器
│   │   │   ├── LLMSettings.tsx     #       LLM 配置 + 自动归档开关
│   │   │   └── BrowserSettings.tsx #       浏览器自动化设置
│   │   ├── layout/                 #     布局
│   │   │   └── MainLayout.tsx      #       主布局
│   │   └── devtool/                #     开发工具
│   │       └── DevToolPanel.tsx    #       日志面板
│   ├── services/                   #   业务服务
│   │   ├── agent/                  #     Agent 核心
│   │   │   ├── agentEngine.ts      #       引擎（runAgentTurn）
│   │   │   ├── intentClassifier.ts #       意图分类器
│   │   │   ├── prompts.ts          #       System Prompt + 5 个提取 Prompt
│   │   │   └── memoryExtractor.ts  #       记忆提炼
│   │   ├── tools/                  #     工具注册
│   │   │   ├── registry.ts         #       工具注册表
│   │   │   ├── browser.ts          #       web.browse 工具
│   │   │   ├── market.ts           #       market.query 工具
│   │   │   ├── news.ts             #       (废弃，待清理)
│   │   │   ├── shell.ts            #       shell.execute 工具
│   │   │   ├── strategy.ts         #       strategy.backtest 工具
│   │   │   ├── stock.ts            #       stock.profile 工具
│   │   │   └── index.ts            #       统一注册入口
│   │   ├── llm/                    #     LLM 服务
│   │   │   └── llmService.ts       #       streamChat 流式对话
│   │   ├── memory/                 #     记忆系统
│   │   │   ├── memoryArchive.ts    #       归档 + 语义检索
│   │   │   └── embeddingService.ts #       Embedding API 代理
│   │   ├── mocks/                  #     Mock 数据
│   │   │   ├── marketData.ts       #       行情 mock
│   │   │   ├── newsData.ts         #       新闻 mock
│   │   │   └── ...                 #       回测/档案 mock
│   │   └── logger/                 #     日志服务
│   │       └── logger.ts           #       分类日志 + 环形缓冲区
│   └── stores/                     #   Zustand Store
│       ├── useChatStore.ts         #       消息管理（messagesBySession）
│       ├── useSessionStore.ts      #       Session 管理
│       ├── usePreferenceStore.ts   #       偏好/配置（browserEnabled 等）
│       ├── useMemoryStore.ts       #       用户记忆
│       ├── useThinkingStore.ts     #       思考过程状态
│       └── useDevToolStore.ts      #       开发工具状态
│
└── shared/                         # 共享类型和常量
    ├── types/
    │   ├── index.ts                #   核心类型（ChatMessage, IntentType, LLMConfig 等）
    │   ├── memory.ts               #   记忆类型（MemoryFragment 等）
    │   └── log.ts                   #   日志类型
    └── constants/
        ├── index.ts                 #   常量（INTENT_TYPES, BROWSER_DOMAIN_WHITELIST 等）
        ├── suggestions.ts           #   推荐问话配置
        └── quickTools.ts            #   快捷工具配置
```

---

## 三、进程通信（IPC）

### 3.1 Preload Bridge API

```typescript
// window.persistence
readFile(path: string): Promise<{ success: boolean; data?: string; error?: string }>
writeFile(path: string, content: string): Promise<{ success: boolean; error?: string }>

// window.appAPI
getUserDataPath(): Promise<string>
getVersion(): Promise<string>

// window.shell
execute(command: string, args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }>

// window.memoryAPI
archive(data: ArchiveRequest): Promise<ArchiveResult>
search(query: string, options: SearchOptions): Promise<SearchResult[]>
query(query: string): Promise<MemoryFragment[]>

// window.browser
open(options: { url: string }): Promise<BrowseResult>
screenshot(): Promise<ScreenshotResult>
close(): Promise<void>
```

### 3.2 IPC 通道完整列表

| 通道 | 方向 | 用途 |
|------|------|------|
| `browser:open` | R→M | 打开网页提取内容 |
| `browser:screenshot` | R→M | 截图当前页面 |
| `browser:close` | R→M | 关闭浏览器窗口 |
| `memory:archive` | R→M | 归档对话到记忆 |
| `memory:search` | R→M | 语义搜索记忆 |
| `memory:query` | R→M | 关键词查询记忆 |
| `shell:execute` | R→M | 执行 Shell 命令 |
| `persistence:readFile` | R→M | 读取文件 |
| `persistence:writeFile` | R→M | 写入文件 |
| `app:getUserDataPath` | R→M | 获取数据目录 |
| `app:getVersion` | R→M | 获取版本号 |

---

## 四、状态管理（Zustand）

### 4.1 Store 总览

| Store | 持久化 | 说明 |
|-------|--------|------|
| `useChatStore` | ✅ localStorage | 消息管理 |
| `useSessionStore` | ✅ localStorage | Session 管理 |
| `usePreferenceStore` | ✅ localStorage | LLM 配置 + 偏好 |
| `useMemoryStore` | ❌ | 用户记忆（实时从主进程获取） |
| `useThinkingStore` | ❌ | 思考过程展示 |
| `useDevToolStore` | ❌ | 开发工具面板 |

### 4.2 useChatStore

```typescript
interface ChatState {
  messagesBySession: Record<string, ChatMessage[]>
  // Actions
  addMessage: (sessionId: string, message: ChatMessage) => void
  appendAssistantContent: (sessionId: string, content: string) => void
  getMessages: (sessionId: string) => ChatMessage[]
  clearMessages: (sessionId: string) => void
  setLoading: (loading: boolean) => void
}
```

**关键模式**：
- 消息选择器用 `EMPTY_MESSAGES` 常量 + `??` 避免无限 re-render
- `appendAssistantContent` 用于流式输出追加

### 4.3 useSessionStore

```typescript
interface SessionState {
  sessions: Session[]
  currentSessionId: string | null
  isCreating: boolean  // 防竞态标记，由 createSession 内部管理
  // Actions
  createSession: () => string | null
  switchSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  autoRenameSession: (id: string, title: string) => void  // 只改"新对话"标题
  deleteSession: (id: string) => void
  updateArchivedCount: (id: string, count: number) => void
}
```

**关键模式**：
- `onRehydrateStorage` 重置 `currentSessionId = null`（应用重启不恢复旧 Session）
- `autoRenameSession` 只在 `!isCustomNamed && title === '新对话'` 时生效
- `createSession()` 后需用 `useSessionStore.getState().sessions` 获取最新值（闭包问题）

### 4.4 usePreferenceStore

```typescript
interface PreferenceState {
  llmConfig: LLMConfig
  isConfigValid: boolean
  autoArchiveOnNewSession: boolean  // v6.0.1: 默认 false
  browserEnabled: boolean           // v6.0.1: 默认 true
  // Actions
  setLLMConfig: (config: Partial<LLMConfig>) => void
  validateConfig: () => boolean
  setAutoArchiveOnNewSession: (val: boolean) => void
  setBrowserEnabled: (val: boolean) => void
}
```

**注意**：`validateConfig()` 需手动调用，`setLLMConfig` 不自动触发。

---

## 五、Agent 引擎

### 5.1 Agent 回合流程

```
用户输入
  │
  ├── 1. 意图识别 (classifyIntent)
  │     ├── 本地正则 (classifyIntentLocal) → 置信度 ≥ 0.9 → 直接返回
  │     ├── LLM 分类 (classifyIntentLLM) → 置信度 > 0.7 → 返回
  │     └── 本地兜底 → 返回
  │
  ├── 2. 非工具意图处理
  │     ├── session.manage / preference.update → "请在界面中手动完成"
  │     └── 其他 → 继续
  │
  ├── 3. 语义检索相关记忆 (searchMemories)
  │
  ├── 4. 构建 System Prompt (buildSystemPrompt)
  │     └── 注入用户偏好 + 相关记忆片段
  │
  ├── 5. 工具意图处理
  │     ├── extractToolArgs (LLM 提取参数)
  │     ├── web.browse 兜底逻辑 (detectDomainFromInput)
  │     ├── executeTool (调用注册工具)
  │     └── 工具结果注入上下文
  │
  └── 6. LLM 流式生成回复 (streamChat)
```

### 5.2 意图分类器

**算法**：`classifyIntentLocal` 遍历所有规则，返回**最高置信度**匹配（v6.0.1 修复：不再返回首个匹配）

**双层策略**：
1. 本地正则：20+ 条规则，高置信度（≥ 0.9）直接返回，不调用 LLM
2. LLM 分类：低置信度时调用 LLM，温度 0.1
3. 兜底：LLM 置信度 ≤ 0.7 时用本地结果

**当前规则表**（v6.0.1）：

| 意图 | 正则示例 | 置信度 |
|------|---------|--------|
| `market.query` | `/(行情\|价格\|多少钱).{0,5}(\d{6}\|[A-Z]{2,5})/` | 0.8–0.9 |
| `web.browse` | `/(搜\|搜索\|查\|看看).{0,10}(网页\|网站\|研报\|新闻\|资讯\|东方财富)/` | 0.75–0.85 |
| `web.browse` | `/(东方财富\|雪球\|同花顺).{0,10}(搜\|搜索\|查)/` | 0.85 |
| `strategy.backtest` | `/(回测\|策略\|历史回测)/` | 0.85 |
| `stock.profile` | `/(档案\|基本面\|公司简介).{0,5}(\d{6}\|[\u4e00-\u9fa5]{2,6})/` | 0.8 |
| `session.manage` | `/(新建\|删除\|切换).{0,3}(对话\|会话)/` | 0.9 |
| `shell.execute` | `/(运行\|执行).{0,5}(python\|node\|npm)/` | 0.9 |
| `preference.update` | `/(设置\|更新\|修改).{0,5}(风险偏好\|偏好\|关注板块)/` | 0.9 |
| `preference.update` | `/^(记住\|我喜欢\|我不喜欢\|我关注\|我偏好)/` | 0.85 |
| `general.chat` | `/^(你好\|您好\|嗨\|hello)$/i` | 0.95 |

### 5.3 工具参数提取

每个工具有对应的 LLM 提取 Prompt（`BROWSER_EXTRACTION_PROMPT` 等），让 LLM 从用户输入提取结构化参数。

**web.browse 特殊处理**：
1. LLM 返回 `query` + `domain` → `buildSearchUrl` 构造搜索 URL
2. LLM 返回 `url` → 直接访问
3. LLM 返回空 → `extractFallbackBrowseQuery` + `detectDomainFromInput` 兜底

---

## 六、工具系统

### 6.1 工具注册表

```typescript
// registry.ts
const tools = new Map<string, { description: string; execute: Function }>()

export const registerTool = (intent: string, toolName: string, description: string, execute: Function)
export const executeTool = (intent: string, args: Record<string, unknown>) => Promise<string>
export const hasTool = (intent: string) => boolean
```

### 6.2 web.browse（核心工具）

**注册**：`registerTool('web.browse', 'browser.open', ...)`

**executeBrowserTool 参数处理**：
```
args.url 存在 → finalUrl = args.url
args.url 不存在 + args.query 存在 → finalUrl = buildSearchUrl(query, domain)
两者都不存在 → 返回错误
```

**buildSearchUrl**：
```typescript
export const buildSearchUrl = (query: string, domain?: string): string => {
  const targetDomain = domain && SEARCH_URL_TEMPLATES[domain] ? domain : 'baidu.com'
  const template = SEARCH_URL_TEMPLATES[targetDomain]
  return template.replace('{query}', encodeURIComponent(query))
}
```

**detectDomainFromInput**（agentEngine.ts）：
```typescript
const DOMAIN_KEYWORDS = [
  { keywords: ['东方财富', 'eastmoney'], domain: 'eastmoney.com' },
  { keywords: ['雪球', 'xueqiu'], domain: 'xueqiu.com' },
  { keywords: ['同花顺', '10jqka'], domain: '10jqka.com.cn' },
  { keywords: ['财联社', 'cls'], domain: 'cls.cn' },
  { keywords: ['新浪', 'sina'], domain: 'sina.com.cn' },
  { keywords: ['百度', 'baidu'], domain: 'baidu.com' },
]
// 默认返回 'baidu.com'
```

### 6.3 其他工具

| 工具 | 文件 | 数据源 | 说明 |
|------|------|--------|------|
| market.query | market.ts | Mock | 返回模拟行情数据 |
| strategy.backtest | strategy.ts | Mock | 返回模拟回测结果 |
| stock.profile | stock.ts | Mock | 返回模拟公司档案 |
| shell.execute | shell.ts | 真实 | 通过 IPC 执行真实 Shell 命令 |

---

## 七、浏览器自动化详细架构

### 7.1 BrowserCDPService（主进程）

```typescript
// src/main/services/browserCDP.ts

class BrowserCDPService {
  private window: BrowserWindow | null = null
  private autoCloseTimer: ReturnType<typeof setTimeout> | null = null

  // 打开网页提取内容
  async browse(options: BrowseOptions): Promise<BrowseResult>

  // 截图
  async screenshot(): Promise<ScreenshotResult>

  // 关闭窗口
  async close(): Promise<void>

  // 白名单校验
  isUrlAllowed(url: string, whitelist?: string[]): boolean
}
```

### 7.2 browse() 流程

```
1. URL 校验 + 白名单校验
2. 如已有窗口 → 先关闭
3. 创建隐藏 BrowserWindow (1280x800, show:false, offscreen:true)
4. 导航到目标 URL + 等待 did-finish-load
5. 智能轮询：每 500ms 检查 document.body.innerText.length
   ├── 内容出现 → 提前返回
   └── 5s 超时 → 继续提取已有内容
6. 提取标题 (getTitle)
7. 提取内容 (executeJavaScript)
8. 噪声过滤 (cleanExtractedText, Node.js 侧)
9. 重置自动关闭计时器 (60s)
10. 返回结果
```

### 7.3 内容提取策略

**浏览器侧**（最小化，避免编码问题）：
```javascript
document.body.innerText.slice(0, 8000)
```

**Node.js 侧**（噪声过滤）：
```typescript
const NOISE_LINE_PATTERNS = [
  /^(登录|注册|下载|客户端|设为首页|加入VIP|版权|备案|举报|反馈)/,
  /^(本网站|本站|免责|隐私|使用条款|用户协议|ICP|京公网)/,
]

function cleanExtractedText(raw: string): string {
  return raw.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && line.length < 500)
    .filter(line => !NOISE_LINE_PATTERNS.some(p => p.test(line)))
    .join('\n')
}
```

### 7.4 关键设计决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 脚本执行方式 | `executeJavaScript` | CDP Runtime.evaluate 有 UTF-8 编码问题 |
| DOM 操作 | 不做 el.remove() | 会误删搜索结果容器 |
| 噪声过滤位置 | Node.js 侧 | 浏览器侧中文正则有编码风险 |
| 默认搜索引擎 | baidu.com | SSR 渲染，提取 100% 可靠 |
| SPA 等待策略 | 智能轮询 | 固定延迟不可靠 |

---

## 八、记忆系统

### 8.1 架构

```
对话归档请求
  │
  ├── 1. LLM 提取记忆片段 (memoryExtractor)
  │     └── 返回 { category, content, importance }[]
  │
  ├── 2. Embedding API 生成向量
  │     └── 智谱 Embedding-3, 512 维
  │
  └── 3. 写入 Vectra 向量索引 (主进程)
        └── memory:archive IPC
```

### 8.2 语义检索

```
用户输入 → Embedding → 向量搜索 Vectra → top-5 相关记忆
  → 注入 System Prompt → LLM 回复时参考
```

### 8.3 IPC 通道

| 通道 | 入参 | 出参 |
|------|------|------|
| `memory:archive` | `{ sessionId, messages, llmConfig }` | `{ newFragments, vectorRecords }` |
| `memory:search` | `{ query, options: { topK, minScore } }` | `MemoryFragment[]` |
| `memory:query` | `{ query }` | `MemoryFragment[]` |

---

## 九、UI 组件架构

### 9.1 组件树

```
App
└── MainLayout
    ├── SessionSidebar        # Session 列表 + 归档管理
    ├── ChatPanel             # 聊天主面板
    │   ├── QuickTools        #   快捷工具按钮
    │   ├── SuggestionCards   #   推荐问话（空 Session 时）
    │   ├── MessageList       #   消息列表
    │   │   ├── ThinkingBlock #     思考过程
    │   │   └── BrowserToolCard #   浏览器工具卡片
    │   ├── ChatInput         #   输入框（externalRef 模式）
    │   └── SettingsPage      #   设置页（模态）
    │       ├── LLMSettings   #     LLM 配置 + 自动归档开关
    │       └── BrowserSettings #   浏览器自动化开关
    └── DevToolPanel          # 开发工具（仅 DEV）
```

### 9.2 关键组件模式

**ChatInput externalRef**：
```typescript
// ChatPanel 持有 inputRef，传给 ChatInput
const inputRef = useRef<HTMLTextAreaElement>(null)
<ChatInput inputRef={inputRef} ... />

// ChatInput 内部
const textareaRef = externalRef || internalRef
```

**MessageList selector**：
```typescript
const EMPTY_MESSAGES: ChatMessage[] = []
const messages = useChatStore(
  (state) => currentSessionId
    ? state.messagesBySession[currentSessionId] ?? EMPTY_MESSAGES
    : EMPTY_MESSAGES
)
```

---

## 十、配置与常量

### 10.1 域名白名单

```typescript
// src/shared/constants/index.ts
export const BROWSER_DOMAIN_WHITELIST = [
  'baidu.com',        // 通用搜索（SSR，默认）
  'xueqiu.com',       // 雪球
  'eastmoney.com',    // 东方财富
  'cls.cn',           // 财联社
  '10jqka.com.cn',    // 同花顺
  'sina.com.cn',      // 新浪财经
  'cninfo.com.cn',    // 巨潮资讯
  'cs.com.cn',        // 证券时报
  'hexun.com',        // 和讯
] as const
```

### 10.2 意图类型

```typescript
// src/shared/types/index.ts
export type IntentType =
  | 'market.query'
  | 'strategy.backtest'
  | 'stock.profile'
  | 'general.chat'
  | 'session.manage'
  | 'preference.update'
  | 'shell.execute'
  | 'web.browse'
  | 'unknown'
// 注：news.search 已合并到 web.browse
```

### 10.3 快捷工具

| ID | 标签 | 模板 |
|----|------|------|
| market.query | 查行情 | 查一下 [股票代码] 的行情 |
| web.browse | 搜新闻 | 搜索 [关键词] 的最新新闻 |
| stock.profile | 看档案 | 看看 [股票代码] 的公司档案 |
| strategy.backtest | 做回测 | 对 [股票代码] 做 [策略名] 回测 |

---

## 十一、已知问题与 v6.1 方向

| 问题 | 说明 | 优先级 |
|------|------|--------|
| 白名单动态管理 | 当前 UI 增删不持久化、不影响运行时 | P1 |
| LLM fetch 超时 | 无 AbortController，API 慢时无限等 | P1 |
| JSON.parse 错误处理 | 多处无独立 try-catch，静默失败 | P2 |
| BrowserCDPService 命名 | 已不用 CDP，应改名为 BrowserService | P2 |
| validateConfig 自动触发 | setLLMConfig 后 isConfigValid 不更新 | P2 |
| news.ts 残留 | 工具注册仍存在但不会被触发 | P3 |
