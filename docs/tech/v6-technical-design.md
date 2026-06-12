# AInvest Agent v6.0 技术方案

> 版本：v6.0.0
> 日期：2026-06-11
> 对应 PRD：`docs/prd/v6-prd.md`

---

## 一、核心问题诊断

### 1.1 三个 UX Bug 的共因：MessageList 订阅模式错误

**根因定位**：`MessageList.tsx` 使用了 `useMemo + getMessages` 来获取消息列表：

```typescript
// MessageList.tsx —— 错误的订阅方式
const messages = useMemo(
  () => (currentSessionId ? getMessages(currentSessionId) : []),
  [currentSessionId, getMessages]
)
```

**问题分析**：
- `getMessages` 是 zustand store 的方法引用，创建后永不变
- `useMemo` 的依赖数组 `[currentSessionId, getMessages]` 只在 `currentSessionId` 变化时重新计算
- 消息内容变化（`messagesBySession[sessionId]` 改变）**不会触发 `useMemo` 重新计算**
- 这就是为什么"切换 Session 再切回"能修复显示 —— 它强制触发了 `currentSessionId` 变化

**影响面**：
| Bug 现象 | 触发场景 | 为什么 |
|---------|---------|--------|
| 流式输出完成后界面卡住 | `appendAssistantContent` 更新 store，但 `useMemo` 不感知 | 消息已写入 store，但组件不 re-render |
| 连续多轮对话后新消息不显示 | `addMessage` 更新 store，但 `useMemo` 不感知 | 同上 |
| 新建 Session 延迟/批量创建 | 快速点击时，`handleCreateSession` 异步归档阻塞，UI 无 loading 态 | 按钮可重复点击 + 无即时反馈 |

**结论**：三个 Bug 中，#2 和 #3 是同一根因（`useMemo` 订阅错误）；#1 是独立问题（Session 创建无 loading 态保护）。

---

## 二、Bug 修复技术方案

### 2.1 MessageList 订阅修复（核心）

**方案**：将 `useMemo + getMessages` 改为 zustand 直接选择器订阅：

```typescript
// 修复后：直接订阅 messagesBySession 中的对应 Session 消息
const messages = useChatStore(
  useCallback(
    (state) => (currentSessionId ? state.messagesBySession[currentSessionId] || [] : []),
    [currentSessionId]
  )
)
```

或使用 `useShallow`（zustand v4+）避免不必要的 re-render：

```typescript
import { useShallow } from 'zustand/react/shallow'

const messages = useChatStore(
  useShallow((state) =>
    currentSessionId ? state.messagesBySession[currentSessionId] || [] : []
  )
)
```

**需要检查并修复的组件**：
- `MessageList.tsx` —— 核心修复
- `ChatPanel.tsx` 第 34 行 —— `const messages = ... getMessages()` 同样问题（虽然只用于空状态判断）
- 全局搜索 `getMessages` 的所有使用处，确保没有其他地方用 `useMemo` 包裹

### 2.2 ChatStore 持久化策略优化

**当前问题**：`createDebouncedStorage(800)` 虽然不影响 React re-render，但 800ms 延迟过长，关闭应用时可能丢失最后 800ms 的消息。

**方案**：
1. **缩短 debounce**：`800ms → 100ms`
2. **流式输出完成后立即 flush**：在 `onDone` 回调中调用立即持久化
3. **窗口关闭前强制保存**：监听 `beforeunload` 事件，强制 flush

```typescript
// useChatStore.ts 关键变更
const createDebouncedStorage = (delay = 100) => { ... }

// 在 store 外部提供 flush 方法
export const flushChatStorage = () => {
  // 触发一次立即写入
}
```

### 2.3 SessionStore 创建竞态修复

**方案**：在 `SessionSidebar.tsx` 添加本地 loading 态，异步归档不阻塞 UI：

```typescript
// SessionSidebar.tsx
const [isCreating, setIsCreating] = useState(false)

const handleCreateSession = async () => {
  if (isCreating) return  // 防重复
  setIsCreating(true)

  // 异步归档放后台，不阻塞创建
  if (currentSessionId && isConfigValid) {
    archiveSession(...).catch(() => {}).finally(() => {
      updateArchivedCount(currentSessionId, messages.length)
    })
  }

  createSession()
  setIsCreating(false)
}
```

**按钮状态**：
```tsx
<button disabled={isCreating} ...>
  {isCreating ? <Loader2 className="animate-spin" /> : <Plus />}
</button>
```

---

## 三、浏览器自动化技术方案

### 3.1 架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                         主进程 (Main)                                │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              BrowserCDPService                                  │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐  │  │
│  │  │ BrowserWin │  │ CDP Client │  │ Content Extractor      │  │  │
│  │  │ 隐藏窗口   │  │ debugger   │  │ (文本/截图/结构化)      │  │  │
│  │  └────────────┘  └────────────┘  └────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                          │                                          │
│  ┌───────────────────────┼──────────────────────────────────────┐  │
│  │   IPC Handlers        │  browser:open                        │  │
│  │   (src/main/ipcHandlers/browser.ts) │  browser:snapshot    │  │
│  │                       │  browser:screenshot                  │  │
│  │                       │  browser:close                       │  │
│  └───────────────────────┴──────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ IPC
┌───────────────────────────┼─────────────────────────────────────────┐
│                      渲染进程 (Renderer)                              │
│  ┌────────────────────────┼─────────────────────────────────────┐   │
│  │      Agent Engine      │                                     │   │
│  │  意图识别 → web.browse │                                     │   │
│  │  工具调用 → browser.open                                │   │
│  │  结果展示 → BrowserToolCard                             │   │
│  └────────────────────────┴─────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 模块设计

#### 3.2.1 主进程 — BrowserCDPService

```typescript
// src/main/services/browserCDP.ts

interface BrowseOptions {
  url: string
  waitForSelector?: string
  timeout?: number
}

interface BrowseResult {
  success: boolean
  title: string
  url: string
  text: string
  error?: string
}

interface ScreenshotResult {
  success: boolean
  dataUrl: string
  error?: string
}

export class BrowserCDPService {
  private window: BrowserWindow | null = null
  private debugger: Electron.Debugger | null = null

  /** 打开网页并提取内容 */
  async browse(options: BrowseOptions): Promise<BrowseResult>

  /** 截图 */
  async screenshot(): Promise<ScreenshotResult>

  /** 关闭浏览器窗口 */
  async close(): Promise<void>

  /** 检查 URL 是否在白名单 */
  isUrlAllowed(url: string, whitelist: string[]): boolean
}
```

**CDP 交互流程**：
1. 创建 `BrowserWindow`（`show: false, offscreen: true`）
2. `webContents.debugger.attach('1.3')`
3. 发送 `Page.navigate` CDP 命令导航到 URL
4. 监听 `Page.loadEventFired` 事件
5. 发送 `Runtime.evaluate` 执行 JS 提取 `document.body.innerText`
6. 清理：detach debugger，destroy window

**内容提取策略**：
```typescript
const EXTRACTION_SCRIPT = `
  (() => {
    // 1. 移除噪声元素
    const noise = document.querySelectorAll('script, style, nav, footer, aside, iframe, .ad, .advertisement');
    noise.forEach(el => el.remove());

    // 2. 提取可见文本
    const text = document.body.innerText
      .split('\\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\\n');

    // 3. 截断到 8000 字符
    return text.slice(0, 8000);
  })()
`
```

#### 3.2.2 IPC Handler

```typescript
// src/main/ipcHandlers/browser.ts

import { ipcMain } from 'electron'
import { BrowserCDPService } from '../services/browserCDP'

const browserService = new BrowserCDPService()

export const registerBrowserIPC = () => {
  ipcMain.handle('browser:open', async (_event, options: unknown) => {
    // 参数校验
    if (!options || typeof options !== 'object') {
      throw new Error('Invalid options')
    }
    const { url } = options as { url: string }
    if (!url || typeof url !== 'string') {
      throw new Error('URL is required')
    }
    return browserService.browse({ url })
  })

  ipcMain.handle('browser:screenshot', async () => {
    return browserService.screenshot()
  })

  ipcMain.handle('browser:close', async () => {
    return browserService.close()
  })
}
```

#### 3.2.3 Preload API

```typescript
// src/preload/index.ts —— 新增 BrowserAPI

export interface BrowserAPI {
  open: (options: { url: string }) => Promise<{
    success: boolean
    title: string
    url: string
    text: string
    error?: string
  }>
  screenshot: () => Promise<{
    success: boolean
    dataUrl: string
    error?: string
  }>
  close: () => Promise<void>
}

const browserAPI: BrowserAPI = {
  open: (options) => ipcRenderer.invoke('browser:open', options),
  screenshot: () => ipcRenderer.invoke('browser:screenshot'),
  close: () => ipcRenderer.invoke('browser:close'),
}

contextBridge.exposeInMainWorld('browser', browserAPI)

declare global {
  interface Window {
    browser: BrowserAPI
    // ... 其他 API
  }
}
```

#### 3.2.4 渲染进程 — 工具定义

```typescript
// src/renderer/services/tools/browser.ts

import { ToolDefinition } from '@shared/types'

export const BROWSER_TOOL_DEFINITION: ToolDefinition = {
  name: 'browser.open',
  description: '打开指定网页并提取内容，用于获取实时信息。只支持白名单中的金融网站。',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: '要访问的网页 URL',
      },
      action: {
        type: 'string',
        enum: ['snapshot', 'screenshot'],
        description: '提取方式：snapshot(文本) 或 screenshot(截图)',
      },
    },
    required: ['url', 'action'],
  },
}

export const executeBrowserTool = async (args: {
  url: string
  action: 'snapshot' | 'screenshot'
}): Promise<string> => {
  const { url, action } = args

  // 1. 安全检查：域名白名单
  const whitelist = await getBrowserWhitelist()
  const hostname = new URL(url).hostname
  const allowed = whitelist.some((domain) => hostname.endsWith(domain))
  if (!allowed) {
    return `错误：域名 ${hostname} 不在允许访问列表中。支持的网站：${whitelist.join('、')}`
  }

  // 2. 执行浏览
  const result = await window.browser.open({ url })
  if (!result.success) {
    return `浏览失败：${result.error}`
  }

  // 3. 根据 action 返回结果
  if (action === 'screenshot') {
    const screenshot = await window.browser.screenshot()
    await window.browser.close()
    return `已访问 ${result.title}\n网页内容摘要：\n${result.text.slice(0, 500)}...\n[截图: ${screenshot.dataUrl}]`
  }

  await window.browser.close()
  return `已访问 ${result.title} (${result.url})\n\n提取内容：\n${result.text}`
}
```

#### 3.2.5 意图识别扩展

```typescript
// src/renderer/services/agent/intentClassifier.ts —— 新增正则规则

{
  pattern: /(查|搜索|看看|打开|浏览).{0,10}(网页|网站|研报|新闻|公告|雪球|东方财富|同花顺|财联社)/,
  intent: 'web.browse',
  confidence: 0.85,
},
{
  pattern: /(雪球|东方财富|同花顺|财联社).{0,10}(查|搜索|看看)/,
  intent: 'web.browse',
  confidence: 0.85,
},

// src/shared/types/index.ts —— IntentType 扩展
export type IntentType =
  | 'market.query'
  | 'news.search'
  | 'strategy.backtest'
  | 'stock.profile'
  | 'general.chat'
  | 'session.manage'
  | 'preference.update'
  | 'shell.execute'
  | 'web.browse'        // 新增
  | 'unknown'
```

#### 3.2.6 Prompt 扩展

```typescript
// src/renderer/services/agent/prompts.ts —— buildSystemPrompt

// 在 capabilities 列表中添加：
// 6. 浏览金融网站获取实时信息（如雪球、东方财富、财联社）——当用户询问最新研报、公告、新闻时，你可以打开相关网页提取内容

// buildIntentPrompt 中添加 web.browse 类型说明
// - web.browse: 浏览网页获取实时信息（如查看最新研报、公告）
```

#### 3.2.7 UI 组件 — BrowserToolCard

```typescript
// src/renderer/features/chat/BrowserToolCard.tsx

interface BrowserToolCardProps {
  url: string
  title: string
  status: 'loading' | 'success' | 'error'
  textPreview?: string
  screenshot?: string
}

// 展示样式：
// ┌──────────────────────────────┐
// │ 🔗 正在访问 雪球网            │
// │ https://xueqiu.com/...      │
// │                              │
// │ ✓ 已提取内容                 │
// │ ┌──────────────────────────┐ │
// │ │ 宁德时代2026Q1营收增长...│ │
// │ └──────────────────────────┘ │
// │ [查看截图]                   │
// └──────────────────────────────┘
```

#### 3.2.8 设置页扩展

```typescript
// src/renderer/features/settings/SettingsPage.tsx —— 新增浏览器设置区块

interface BrowserSettings {
  enabled: boolean
  whitelist: string[]
}

// 默认白名单
const DEFAULT_WHITELIST = [
  'xueqiu.com',
  'eastmoney.com',
  'cls.cn',
  '10jqka.com.cn',
  'sina.com.cn',
  'cninfo.com.cn',
  'cs.com.cn',
  'hexun.com',
]
```

### 3.3 安全设计

| 层面 | 措施 |
|------|------|
| 域名过滤 | IPC handler 中校验 URL hostname 是否在白名单 |
| 内容过滤 | 提取时移除 `<script>`、`<style>` 等标签 |
| 隔离 | 使用独立隐藏窗口，session/cookie 与用户主窗口隔离 |
| 超时 | 单页面加载超时 15s，总操作超时 30s |
| 频率限制 | 同一域名 60 秒内最多访问 3 次 |
| 资源清理 | `browser:close` 强制销毁窗口，防止内存泄漏 |

### 3.4 错误处理

```typescript
// BrowserCDPService 错误码
enum BrowserError {
  INVALID_URL = 'INVALID_URL',
  NOT_WHITELISTED = 'NOT_WHITELISTED',
  TIMEOUT = 'TIMEOUT',
  NAVIGATION_FAILED = 'NAVIGATION_FAILED',
  EXTRACTION_FAILED = 'EXTRACTION_FAILED',
  ALREADY_RUNNING = 'ALREADY_RUNNING',
}
```

---

## 四、风险与应对

| 风险 | 影响 | 概率 | 应对 |
|------|------|------|------|
| CDP API 在 Electron v42 中行为变化 | 浏览器自动化失效 | 低 | 降级为 Mock 数据；记录 Electron 版本兼容性矩阵 |
| 网页反爬虫机制 | 内容提取为空 | 中 | 文本提取用通用 `innerText`，不依赖特定选择器；失败时返回"该页面无法访问" |
| Bug 修复引入回归 | 其他功能异常 | 低 | 修改范围小（仅订阅模式），改动前补充单元测试 |
| 浏览器窗口内存泄漏 | 应用卡顿 | 中 | 每次操作后强制 `close()`；主进程添加定时清理任务 |
| 隐藏窗口被安全软件拦截 | 浏览功能不可用 | 低 | 使用 `offscreen: true` 而非隐藏窗口作为备选方案 |

---

## 五、附录

### A.1 改动文件清单

**Bug 修复（5 个文件）**：
1. `src/renderer/features/chat/MessageList.tsx` —— 订阅模式修复
2. `src/renderer/features/chat/ChatPanel.tsx` —— messages 引用修复
3. `src/renderer/stores/useChatStore.ts` —— debounce 缩短 + flush
4. `src/renderer/features/session/SessionSidebar.tsx` —— loading 态
5. `src/renderer/stores/useSessionStore.ts` —— 可选：添加 `isCreating`

**浏览器自动化（10 个文件新增/修改）**：
1. `src/main/services/browserCDP.ts` —— 新建
2. `src/main/ipcHandlers/browser.ts` —— 新建
3. `src/renderer/services/tools/browser.ts` —— 新建
4. `src/renderer/features/chat/BrowserToolCard.tsx` —— 新建
5. `src/preload/index.ts` —— 修改（+ BrowserAPI）
6. `src/main/index.ts` —— 修改（+ registerBrowserIPC）
7. `src/renderer/services/tools/index.ts` —— 修改（+ import browser）
8. `src/renderer/services/agent/intentClassifier.ts` —— 修改（+ web.browse 规则）
9. `src/renderer/services/agent/prompts.ts` —— 修改（+ 浏览器能力）
10. `src/renderer/services/agent/agentEngine.ts` —— 修改（+ 工具集成）

**类型/常量（2 个文件）**：
1. `src/shared/types/index.ts` —— IntentType + 可能的新类型
2. `src/shared/constants/index.ts` —— TOOL_DEFINITIONS + INTENT_TYPES

**设置页（1 个文件）**：
1. `src/renderer/features/settings/SettingsPage.tsx` —— 新增浏览器设置区块

### A.2 关键决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| CDP vs Puppeteer/Playwright | **CDP** | 0 额外体积，复用 Electron 自带 Chromium |
| 隐藏窗口 vs offscreen | **隐藏窗口（show: false）** | offscreen 在某些 Electron 版本有截图限制；隐藏窗口更稳定 |
| 白名单校验位置 | **主进程 IPC handler** | 安全：渲染进程不可绕过 |
| 内容提取策略 | **通用 innerText + 噪声过滤** | 不依赖特定网站 DOM 结构，更鲁棒 |
| 截图存储 | **base64 dataUrl 内存传递** | 不写入磁盘，IPC 直接传递；消息记录中保留截图 |
