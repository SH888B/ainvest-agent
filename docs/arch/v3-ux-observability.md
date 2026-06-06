# v3 可观测性与用户体验优化 技术架构文档

> 版本：v3.0.0
> 日期：2026-06-06
> 状态：评审通过
> 基线架构：`docs/arch/v2-agent-llm-upgrade.md`

---

## 一、技术目标

在 v2 Agent 引擎基础上，实现：
1. Agent 运行过程可视化（Thinking 块）
2. 开发调试工具（DevTool 日志面板）
3. Session 自动命名
4. 快捷输入与空状态引导
5. Prompt 工程规范化

---

## 二、关键决策

| # | 决策项 | 选择 | 理由 |
|---|--------|------|------|
| 1 | Thinking 块更新方案 | **每步完成时更新** | 实现简单，用户体验足够，避免真流式复杂度 |
| 2 | DevTool 环境策略 | **开发环境默认启用，生产环境禁用** | 降低安全风险，通过 `import.meta.env.DEV` 判断 |
| 3 | 自动命名计量单位 | **按字符数（Unicode code point）** | 中文10字=合理长度；按byte只能截3字，体验极差 |
| 4 | 快捷工具配置 | **常量文件配置 + 组件遍历** | v3.0.0 平衡实现成本与扩展性 |
| 5 | 推荐问题配置 | **常量文件配置** | 同上，后续可接入长期记忆做个性化 |
| 6 | LLM 评测 CI | **v3.0.0 仅本地可运行，CI 接入放 v3.1.0** | 降低 v3.0.0 发布阻塞风险 |
| 7 | 占位符未替换 | **允许直接发送** | Agent 可兜底反问，不做强制拦截 |

---

## 三、模块设计

### 3.1 Thinking 块（`ThinkingBlock.tsx`）

**位置**：`src/renderer/features/chat/ThinkingBlock.tsx`

**状态管理**：独立 Zustand Store（不与消息列表耦合）

```typescript
// stores/useThinkingStore.ts
interface ThinkingState {
  currentTurnId: string | null
  steps: ThinkingStep[]
  isExpanded: boolean

  startTurn: (turnId: string) => void
  addStep: (step: ThinkingStep) => void
  completeStep: (stepType: string) => void
  failStep: (stepType: string, error: string) => void
  setExpanded: (expanded: boolean) => void
  clearTurn: () => void
}

interface ThinkingStep {
  type: 'intent.recognizing' | 'intent.resolved'
       | 'tool.extracting' | 'tool.calling' | 'tool.result'
       | 'llm.generating' | 'llm.streaming'
  status: 'pending' | 'running' | 'completed' | 'failed'
  message: string
  detail?: string      // 如工具参数摘要
  error?: string
  timestamp: number
}
```

**与 Agent 引擎集成**：

```typescript
// agentEngine.ts 中
const { startTurn, addStep, completeStep } = useThinkingStore.getState()

// 第一步：开始新 turn
startTurn(turnId)

// 第二步：意图识别
addStep({ type: 'intent.recognizing', status: 'running', message: '正在理解您的问题...', timestamp: Date.now() })
const intentResult = await classifyIntent(userInput, config)
completeStep('intent.recognizing')
addStep({ type: 'intent.resolved', status: 'completed', message: `已识别意图：${intentResult.intent}`, detail: `置信度：${intentResult.confidence}`, timestamp: Date.now() })

// 第三步：工具调用（如果是工具意图）
if (hasTool(intent)) {
  addStep({ type: 'tool.extracting', status: 'running', message: '正在提取参数...', timestamp: Date.now() })
  const args = await extractToolArgs(...)
  completeStep('tool.extracting')

  addStep({ type: 'tool.calling', status: 'running', message: `正在调用 ${intent}...`, detail: JSON.stringify(args), timestamp: Date.now() })
  const result = await executeTool(intent, args)
  completeStep('tool.calling')

  addStep({ type: 'tool.result', status: 'completed', message: '已获取工具结果', detail: `结果长度：${result.length} 字`, timestamp: Date.now() })
}

// 第四步：LLM 生成
addStep({ type: 'llm.generating', status: 'running', message: '正在生成回复...', timestamp: Date.now() })
// ...streamChat 完成后
completeStep('llm.generating')
addStep({ type: 'llm.streaming', status: 'completed', message: '回复已完成', timestamp: Date.now() })
```

**渲染位置**：
- 每条 Agent 回复消息上方（与消息绑定，不独立悬浮）
- 通过 `turnId` 与消息关联

**性能优化**：
- `ThinkingBlock` 组件使用 `React.memo`
- Store 更新粒度按 step，不按整个数组重设

---

### 3.2 DevTool 日志面板（`AgentLogPanel.tsx`）

**位置**：`src/renderer/features/devtools/AgentLogPanel.tsx`

**入口控制**：

```typescript
// MainLayout.tsx
useEffect(() => {
  // 仅开发环境注册快捷键
  if (import.meta.env.DEV) {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'L') {
        e.preventDefault()
        toggleLogPanel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }
}, [])
```

**面板形态**：
- 固定定位右侧滑出面板（`position: fixed; right: 0; top: 0; width: 480px; height: 100vh`）
- 非模态（`pointer-events: auto`，不影响左侧交互）
- 半透明背景（`bg-background/95 backdrop-blur-sm`）

**数据流**：
```
agentEngine / intentClassifier / llmService
  ↓ logEvent()
logger.ts（localStorage 环形缓冲区）
  ↓ getLogs({ sessionId })
AgentLogPanel（React 组件，定时轮询或事件订阅）
```

**实时同步方案**：
- 方案 A（推荐）：`logger.ts` 增加 `onLogAdded` 回调注册机制，面板订阅事件
- 方案 B：面板每 500ms 轮询 `getLogs()`

**敏感信息过滤**（必须在 logger.ts 中实现）：

```typescript
const SENSITIVE_KEYS = ['apiKey', 'authorization', 'token', 'password', 'secret']

export const logEvent = (event: Omit<LogEvent, 'id' | 'timestamp'>) => {
  // 过滤敏感字段
  const filteredData = Object.entries(event.data).reduce((acc, [key, value]) => {
    if (SENSITIVE_KEYS.some(sk => key.toLowerCase().includes(sk))) {
      acc[key] = '[REDACTED]'
    } else {
      acc[key] = value
    }
    return acc
  }, {} as Record<string, unknown>)

  // ...继续记录
}
```

---

### 3.3 自动命名 Session

**位置**：`src/renderer/stores/useSessionStore.ts`

**Session 类型扩展**：

```typescript
interface Session {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  isCustomNamed?: boolean   // 新增：用户是否手动重命名过
}
```

**命名规则**：

```typescript
function generateSessionName(firstMessage: string): string {
  // 去除首尾空格和标点
  const trimmed = firstMessage.trim().replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, '')

  if (!trimmed) return '新对话'

  // 按字符截取（非 byte）
  const chars = Array.from(trimmed)
  const maxLen = 10

  if (chars.length <= maxLen) return trimmed

  return chars.slice(0, maxLen).join('') + '...'
}
```

**触发时机**：`ChatInput.tsx` 的 `handleSend` 中，第一条用户消息发送后：

```typescript
// ChatInput.tsx
const { currentSessionId, sessions, renameSession } = useSessionStore()

const handleSend = async () => {
  // ...添加消息...

  // 检查是否需要自动命名
  const session = sessions.find(s => s.id === currentSessionId)
  if (session && !session.isCustomNamed && session.title === '新对话') {
    const newName = generateSessionName(text)
    renameSession(currentSessionId, newName)
  }

  // ...继续 Agent 流程...
}
```

**覆盖策略**：
- `renameSession` 被用户手动调用时，设置 `isCustomNamed: true`
- 自动命名仅在 `!isCustomNamed && title === '新对话'` 时触发

---

### 3.4 快捷工具按钮

**配置常量**：`src/shared/constants/quickTools.ts`

```typescript
export interface QuickTool {
  id: string
  label: string
  icon: string          // lucide icon name
  template: string      // 填充模板
  placeholders: string[] // 占位符列表，如 ['[股票代码]']
}

export const QUICK_TOOLS: QuickTool[] = [
  {
    id: 'market.query',
    label: '查行情',
    icon: 'TrendingUp',
    template: '查一下 [股票代码] 的行情',
    placeholders: ['[股票代码]'],
  },
  {
    id: 'news.search',
    label: '搜新闻',
    icon: 'Newspaper',
    template: '搜一下 [关键词] 的新闻',
    placeholders: ['[关键词]'],
  },
  {
    id: 'stock.profile',
    label: '看档案',
    icon: 'FileText',
    template: '看看 [股票代码] 的公司档案',
    placeholders: ['[股票代码]'],
  },
  {
    id: 'strategy.backtest',
    label: '做回测',
    icon: 'Calculator',
    template: '对 [股票代码] 做 [策略名] 回测',
    placeholders: ['[股票代码]', '[策略名]'],
  },
]
```

**占位符定位逻辑**：

```typescript
const fillTemplate = (template: string, textarea: HTMLTextAreaElement) => {
  setInput(template)

  // 定位到第一个占位符
  const firstPlaceholder = template.match(/\[.*?\]/)?.[0]
  if (firstPlaceholder) {
    const start = template.indexOf(firstPlaceholder)
    const end = start + firstPlaceholder.length

    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(start, end)
    })
  }
}
```

---

### 3.5 推荐问话卡片

**配置常量**：`src/shared/constants/suggestions.ts`

```typescript
export interface Suggestion {
  id: string
  text: string
  intent: IntentType
  icon: string
}

export const DEFAULT_SUGGESTIONS: Suggestion[] = [
  { id: 's1', text: '查一下贵州茅台的行情', intent: 'market.query', icon: 'TrendingUp' },
  { id: 's2', text: '最近有什么新能源行业新闻', intent: 'news.search', icon: 'Newspaper' },
  { id: 's3', text: '茅台公司是做什么的', intent: 'stock.profile', icon: 'FileText' },
  { id: 's4', text: '回测一下趋势策略', intent: 'strategy.backtest', icon: 'Calculator' },
]
```

**展示条件**：`messages.length === 0`

**交互**：点击直接调用 `handleSend(suggestion.text)`，正常走 Agent 完整流程（含 Thinking 块）

---

### 3.6 Prompt 统一收口

**目标结构**：`src/renderer/services/agent/prompts.ts`

```typescript
export const PROMPT_VERSION = 'v3.0.0'

// System Prompts
export const buildSystemPrompt = (memory?: UserMemory): string => { ... }

// Intent Classification Prompts
export const buildIntentPrompt = (): string => { ... }

// Tool Extraction Prompts
export const MARKET_QUERY_EXTRACTION_PROMPT = `...`
export const NEWS_SEARCH_EXTRACTION_PROMPT = `...`
export const STRATEGY_BACKTEST_EXTRACTION_PROMPT = `...`
export const STOCK_PROFILE_EXTRACTION_PROMPT = `...`

// Prompt 变更日志
// v3.0.0: 从 intentClassifier.ts 和 agentEngine.ts 迁移 inline prompt 到此处
```

**迁移清单**：

| 原位置 | 内容 | 迁移到 |
|--------|------|--------|
| `intentClassifier.ts:70-85` | `classifyIntentLLM` inline prompt | `prompts.ts: buildIntentPrompt()` |
| `agentEngine.ts:108-117` | `extractToolArgs` promptMap | `prompts.ts: MARKET_QUERY_... 等常量` |

**验收标准**：
- `run-intent-eval.ts` 基线通过率 ≥ 94.3%
- 无 TypeScript 编译错误

---

## 四、数据流图

### 4.1 Thinking 块数据流

```
用户发送消息
  ↓
ChatInput.handleSend()
  ↓
useThinkingStore.startTurn(turnId)
  ↓
AgentEngine.runAgentTurn()
  ├── intent.recognizing → addStep() → completeStep()
  ├── intent.resolved → addStep()
  ├── tool.extracting → addStep() → completeStep()
  ├── tool.calling → addStep() → completeStep()
  ├── tool.result → addStep()
  ├── llm.generating → addStep() → completeStep()
  └── llm.streaming → addStep()
  ↓
useThinkingStore.clearTurn()
```

### 4.2 DevTool 面板数据流

```
Agent 引擎 / LLM 服务 / 工具注册表
  ↓ logEvent()
logger.ts（内存数组 + localStorage 持久化）
  ↓ 事件回调
AgentLogPanel（实时更新 UI）
  ↓ 用户点击"导出"
JSON 文件下载
```

---

## 五、文件变更清单

### 新增文件

| 文件路径 | 说明 |
|---------|------|
| `src/renderer/features/chat/ThinkingBlock.tsx` | Thinking 块组件 |
| `src/renderer/stores/useThinkingStore.ts` | Thinking 状态管理 |
| `src/renderer/features/devtools/AgentLogPanel.tsx` | DevTool 日志面板 |
| `src/renderer/features/chat/QuickTools.tsx` | 快捷工具按钮 |
| `src/renderer/features/chat/SuggestionCards.tsx` | 推荐问话卡片 |
| `src/shared/constants/quickTools.ts` | 快捷工具配置 |
| `src/shared/constants/suggestions.ts` | 推荐问题配置 |
| `test/eval/run-intent-llm-eval.ts` | LLM 层评测脚本 |

### 修改文件

| 文件路径 | 变更内容 |
|---------|---------|
| `src/renderer/features/chat/MessageItem.tsx` | 集成 Thinking 块 |
| `src/renderer/features/chat/ChatInput.tsx` | 添加快捷工具、推荐卡片 |
| `src/renderer/features/chat/ChatPanel.tsx` | 布局调整 |
| `src/renderer/features/session/SessionSidebar.tsx` | 自动命名触发 |
| `src/renderer/stores/useSessionStore.ts` | 扩展 `isCustomNamed`、自动命名逻辑 |
| `src/renderer/services/agent/prompts.ts` | 统一收口 prompt |
| `src/renderer/services/agent/intentClassifier.ts` | 移除 inline prompt，引用 prompts.ts |
| `src/renderer/services/agent/agentEngine.ts` | 移除 inline promptMap，引用 prompts.ts；集成 Thinking 回调 |
| `src/renderer/services/logger/logger.ts` | 增加敏感字段过滤 |
| `src/renderer/features/layout/MainLayout.tsx` | 集成 DevTool 面板快捷键 |

---

## 六、安全规范

### 6.1 DevTool 面板

- **生产环境禁用**：通过 `import.meta.env.DEV` 判断，生产环境不注册快捷键、不渲染面板
- **敏感字段过滤**：`logger.ts` 中 `SENSITIVE_KEYS` 列表，命中时替换为 `[REDACTED]`
- **导出安全**：导出的 JSON 经过同样过滤逻辑

### 6.2 Thinking 块

- 仅展示本地处理状态，不暴露 API Key、请求头等敏感信息
- 工具参数摘要需脱敏（如只展示字段名，不展示具体值）

---

## 七、性能规范

| 指标 | 阈值 | 说明 |
|------|------|------|
| Thinking 块出现延迟 | < 200ms | 从用户发送消息到 Thinking 块渲染 |
| 步骤更新延迟 | < 100ms | 从事件触发到 UI 更新 |
| DevTool 面板唤起延迟 | < 100ms | 从快捷键到面板可见 |
| 自动命名处理延迟 | < 50ms | 纯本地字符串操作 |
| 快捷工具填充延迟 | < 50ms | 本地状态更新 |

---

## 八、风险与应对

| 风险 | 等级 | 应对 |
|------|------|------|
| Thinking 块状态管理不当导致全列表重渲染 | 中 | 独立 Store + React.memo |
| DevTool 快捷键系统冲突 | 中 | 备选方案 `Ctrl+Shift+D` |
| logger.ts 敏感字段过滤遗漏 | 中 | SENSITIVE_KEYS 列表 + Code Review |
| Prompt 迁移引入 regression | 低 | 迁移前后跑 `run-intent-eval.ts` 对比 |
| 自动命名混排文本截断异常 | 低 | 按字符截取 + 边界 case 测试 |

---

## 九、验收标准

- [ ] 意图识别评测集通过率 ≥ 94.3%（无 regression）
- [ ] E2E 评测集通过率 ≥ 86.7%（无 regression）
- [ ] TypeScript 编译零报错
- [ ] DevTool 面板生产环境不可访问
- [ ] logger.ts 敏感字段过滤生效（人工验证）

---

*文档版本：v3.0*
*最后更新：2026-06-06*
