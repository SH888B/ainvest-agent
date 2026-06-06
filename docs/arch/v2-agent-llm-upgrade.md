# v2 Agent LLM 升级架构文档

> 本文档描述 AInvest CLI Agent 从 v1（Mock Agent）升级到 v2（大模型驱动 Agent）的完整技术方案。
> 基于团队讨论，以下 5 个关键决策已确认。

---

## 决策汇总

| # | 决策项 | 选择 | 理由 |
|---|--------|------|------|
| 1 | LLM API 调用位置 | **A：渲染进程直接调用** | Demo 阶段最快，流式响应直接通过 `fetch` 处理，无需 IPC 中转 |
| 2 | 工具调用模式 | **A：类 Function Calling** | 与 OpenAI/Kimi 官方规范对齐，后续迁移成本低 |
| 3 | 长期记忆存储 | **A：独立 JSON 文件** | 结构化数据便于后续迁移到数据库或向量检索 |
| 4 | 意图识别 Fallback | **A：LLM + 正则兜底** | 保证 LLM 不可用或超时时的基础功能可用 |
| 5 | 记忆提炼时机 | **每日定时 + Mock 手动按钮** | 显式可控，用户可感知，粒度为"天" |

---

## 一、Electron 进程模型与 LLM 调用位置

### 1.1 Electron 进程模型回顾

```
┌─────────────────────────────────────────────────────────────┐
│                      Electron 应用                           │
│                                                              │
│   ┌─────────────────┐                                       │
│   │   主进程 (Main)  │  ← Node.js 环境                        │
│   │  • fs / os 访问  │  • 文件读写、系统级操作                 │
│   │  • 创建窗口      │  • API Key 存内存更安全（但调试麻烦）    │
│   │  • 不能直接 DOM  │  • 做流式代理需要 IPC 逐 chunk 转发     │
│   └────────┬────────┘                                       │
│            │ IPC (electron.contextBridge)                   │
│            ▼                                                 │
│   ┌─────────────────┐                                       │
│   │  Preload 脚本    │  ← 安全桥梁                            │
│   │  • 暴露有限 API  │  • 渲染进程通过 window.electronAPI 调用 │
│   └────────┬────────┘                                       │
│            ▼                                                 │
│   ┌─────────────────┐                                       │
│   │ 渲染进程 (Renderer)│ ← Chromium 浏览器环境                  │
│   │  • React 代码    │  • 可直接 fetch() 到外部 API           │
│   │  • DevTools 可见 │  • localStorage / IndexedDB 可直接访问 │
│   │  • 不能直接 fs   │  • 流式响应直接驱动 UI                  │
│   └─────────────────┘                                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 决策：渲染进程直接调用（方案 A）

```
用户输入 → ChatStore → LLMService（渲染进程）→ fetch(api.moonshot.cn)
                                              ↑
                                              流式 SSE 直接返回 React
```

**为什么选 A**：
- **流式处理极简单**：`fetch` 的 `ReadableStream` 直接驱动 React 逐字渲染
- **零 IPC 开销**：不需要设计 IPC 流式通道，代码量减少 50%+
- **调试友好**：DevTools Network 面板直接看到请求/响应
- **与 v1 架构一致**：Mock 服务也在渲染进程，替换为真实 LLM 调用成本最低

**风险与应对**：
- API Key 存在 `localStorage`，DevTools 可见 → **接受**。桌面应用用户即 Key 所有者，Kimi Key 可设权限限额，风险可控。v3 再考虑加密存储。

**何时必须切到主进程代理（方案 B）**：
- 接统一后端/数据库时（主进程做网关）
- 平台统一出 API Key 时（防止用户盗刷）
- 需要离线缓存、统一限流时

---

## 二、工具调用模式：类 Function Calling（方案 A）

### 2.1 两种模式对比

| 维度 | 方案 A：类 Function Calling | 方案 B：单轮指令标记 |
|------|---------------------------|-------------------|
| **流程** | LLM 先输出 JSON 指令 → 前端执行 → 结果回传 → LLM 生成最终回复 | LLM 一次输出中同时包含指令和文本（靠 Prompt 约束） |
| **可靠性** | 高：结构化 JSON，解析稳定 | 低：靠文本格式约束，容易出错 |
| **与官方对齐** | 与 OpenAI/Kimi Function Calling 规范一致 | 自定义格式，迁移成本高 |
| **代码复杂度** | 中等（需解析 JSON + 回传结果） | 低（但 Prompt 工程复杂） |
| **扩展性** | 高：新增工具只需改 JSON Schema | 低：每增工具需改 Prompt |

### 2.2 完整工具调用流程

```
用户输入："茅台今天怎么样"
  │
  ▼
构建消息（System + Memory + History + User Input）
  │
  ▼
LLM 返回（第一轮）：
  {
    "tool_calls": [{
      "id": "call_abc123",
      "type": "function",
      "function": {
        "name": "market.query",
        "arguments": "{\"symbol\":\"600519.SH\"}"
      }
    }]
  }
  │
  ▼
前端解析 → 执行 market.query("600519.SH")
  │
  ▼
拿到结果：{ price: 1688.00, change: 2.5, volume: "10万手" }
  │
  ▼
构建第二轮消息（原消息 + assistant tool_calls + tool 结果）：
  [
    ...原上下文,
    { role: 'assistant', content: '', tool_calls: [...] },
    { role: 'tool', content: JSON.stringify(result), tool_call_id: 'call_abc123' }
  ]
  │
  ▼
LLM 返回（第二轮）流式文本：
  "贵州茅台今日报价 1688.00 元，上涨 2.5%，成交量 10万手..."
  │
  ▼
逐字渲染到聊天面板
```

### 2.3 核心类型定义

```typescript
// 统一消息格式（兼容 OpenAI/Kimi）
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];      // assistant 决定调用工具时填充
  tool_call_id?: string;        // tool 响应时带上对应 id
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;       // 对应 toolId，如 'market.query'
    arguments: string;  // JSON 字符串，需 parse
  };
}

// 工具定义（注册给 LLM 的 Schema）
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}
```

---

## 三、长期记忆存储：独立 JSON 文件（方案 A）

### 3.1 两种方案对比

| 维度 | 方案 A：独立 JSON 文件 | 方案 B：localStorage |
|------|---------------------|-------------------|
| **存储位置** | `userData/ainvest/memory.json` | `localStorage` |
| **容量限制** | 无（取决于磁盘） | ~5MB |
| **数据结构** | 结构化 JSON，便于扩展 | 字符串序列化 |
| **跨 Session** | 是（文件级共享） | 是（同域名） |
| **备份/迁移** | 直接复制文件 | 需导出导入 |
| **后续扩展** | 易于迁移到 SQLite/向量库 | 需重构 |

### 3.2 memory.json 数据结构

```json
{
  "version": 1,
  "lastSummaryDate": "2026-06-06",
  "dailySummaries": [
    {
      "date": "2026-06-06",
      "summary": "用户今日主要关注白酒板块，询问了茅台和五粮液的行情..."
    }
  ],
  "aggregatedMemory": {
    "riskPreference": "moderate",
    "watchedSectors": ["白酒", "新能源"],
    "frequentQuestions": ["行情查询", "板块对比"],
    "updatedAt": 1717670400000
  }
}
```

### 3.3 读写流程

```
应用启动
  → 主进程读取 userData/ainvest/memory.json
  → 通过 IPC 发送到渲染进程
  → useMemoryStore 初始化

Session 开始
  → useMemoryStore.memory 注入 System Prompt

每日总结触发
  → 收集当天所有 Session 对话
  → 调用 LLM 提炼偏好（非流式）
  → 解析 JSON → 合并到 aggregatedMemory
  → 主进程写入 memory.json
```

---

## 四、意图识别 Fallback：LLM + 正则兜底（方案 A）

### 4.1 完整 Fallback 流程

```
用户输入
  │
  ├─→ 本地正则快速匹配 ──→ 置信度 > 0.9? ──→ 是 → 直接返回结果
  │                         │
  │                         否
  │                         ▼
  │              调用 LLM 分类（带最近 3 轮上下文）
  │                         │
  │              LLM 超时/失败/返回异常? ──→ 是 → 正则兜底返回
  │                         │
  │                         否
  │                         ▼
  │              解析 LLM 返回的 JSON → 返回分类结果
  │
  └─→ 永不阻塞，总有结果
```

### 4.2 兜底规则（v1 正则保留）

```typescript
const FALLBACK_RULES = [
  { pattern: /行情|查.*股|股价|涨跌/, intent: 'market.query' },
  { pattern: /新闻|公告|资讯/, intent: 'news.search' },
  { pattern: /回测|策略|MA|均线/, intent: 'strategy.backtest' },
  { pattern: /档案|基本面|公司简介/, intent: 'stock.profile' },
];
```

### 4.3 LLM 分类 Prompt

```
你是 AInvest 的意图分类器。请分析用户输入，判断其意图。

可选意图类型：
- market.query：查询股票/指数行情
- news.search：搜索新闻/公告
- strategy.backtest：策略回测/技术分析
- stock.profile：查看个股档案/基本面
- general.chat：通用闲聊（不需要工具）
- session.manage：管理会话（新建、切换、重命名、删除）
- preference.update：更新用户偏好设置
- unknown：无法识别

请严格按以下 JSON 格式返回（不要有多余文字）：
{
  "intent": "market.query",
  "confidence": 0.95,
  "extractedParams": { "symbol": "600519.SH" }
}
```

---

## 五、记忆提炼：每日定时 + Mock 手动按钮（方案 5）

### 5.1 方案对比

| 维度 | 原方案（Session 切换触发） | 新方案（每日 + Mock 按钮） |
|------|------------------------|------------------------|
| **触发时机** | 用户切换/关闭 Session | 每晚 23:59 + 用户手动点击 |
| **总结粒度** | 单 Session | 当天所有 Session |
| **用户体验** | 无感知，静默提炼 | 显式看到"今日复盘" |
| **实现复杂度** | 低 | 略高（需按日期聚合） |

### 5.2 提炼 Prompt

```
请从以下对话中提炼用户的投资偏好，以 JSON 格式返回：

{
  "riskPreference": "moderate",  // conservative / moderate / aggressive
  "watchedSectors": ["白酒", "新能源"],
  "frequentQuestions": ["行情查询", "板块对比"]
}

注意：
- 如果某字段无法从对话中推断，可省略
- 与已有偏好冲突时，以最新对话为准
- 只返回 JSON，不要多余解释
```

### 5.3 Mock 按钮位置

- **位置**：Session 侧边栏底部 或 设置页
- **文案**："📝 总结今日偏好"
- **交互**：点击 → loading → Toast"今日偏好已更新" → 设置页可查看结果

---

## 六、新增/升级模块详细设计

### 6.1 LLM 服务层

**路径**：`src/renderer/services/llm/`

```typescript
// llmService.ts
export interface LLMConfig {
  apiKey: string;
  baseUrl: string;      // 默认 https://api.moonshot.cn/v1
  model: string;        // 默认 moonshot-v1-8k
  temperature: number;  // 默认 0.7
}

export class LLMService {
  constructor(config: LLMConfig);

  /** 流式对话 */
  async *streamChat(
    messages: ChatMessage[],
    tools?: ToolDefinition[]
  ): AsyncGenerator<string, void, unknown>;

  /** 非流式对话（用于意图识别、偏好提炼） */
  async chat(messages: ChatMessage[]): Promise<string>;

  /** 验证 API Key 有效性 */
  async validateKey(): Promise<boolean>;
}
```

**流式处理**：使用 SSE（Server-Sent Events）解析 Kimi 的流式响应。

### 6.2 意图识别器

**路径**：`src/renderer/services/agent/intentClassifier.ts`

```typescript
export type UserIntent =
  | 'market.query'
  | 'news.search'
  | 'strategy.backtest'
  | 'stock.profile'
  | 'general.chat'
  | 'session.manage'
  | 'preference.update'
  | 'unknown';

export interface IntentResult {
  intent: UserIntent;
  confidence: number;
  extractedParams?: Record<string, unknown>;
}

export async function classifyIntent(
  userInput: string,
  sessionContext: ChatMessage[]
): Promise<IntentResult> {
  // 1. 本地快速匹配
  const local = regexClassify(userInput);
  if (local.confidence > 0.9) return local;

  // 2. LLM 分类
  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: INTENT_SYSTEM_PROMPT },
      ...sessionContext.slice(-3),
      { role: 'user', content: userInput },
    ];
    const llmResult = await llmService.chat(messages);
    return parseIntentFromJSON(llmResult);
  } catch {
    // 3. 兜底
    return local;
  }
}
```

### 6.3 短期记忆（Session 上下文）

**扩展 `useChatStore`**：

```typescript
export interface ChatStoreState {
  // ... v1 原有字段

  /** 获取当前 Session 的 LLM 消息格式 */
  getLLMContext: (systemPrompt: string) => ChatMessage[];
}
```

**转换规则**：
- `user` 消息 → `{ role: 'user', content }`
- `agent` 文本回复 → `{ role: 'assistant', content }`
- `tool` 调用结果 → `{ role: 'tool', content: JSON.stringify(result), tool_call_id }`

### 6.4 长期记忆（useMemoryStore）

**路径**：`src/renderer/stores/useMemoryStore.ts`

```typescript
export interface UserMemory {
  riskPreference?: 'conservative' | 'moderate' | 'aggressive';
  watchedSectors?: string[];
  frequentQuestions?: string[];
  updatedAt: number;
}

export interface MemoryState {
  memory: UserMemory;
  isLoading: boolean;
  loadMemory: () => Promise<void>;
  extractAndUpdate: (sessionMessages: Message[]) => Promise<void>;
  updateMemory: (partial: Partial<UserMemory>) => void;
}
```

**System Prompt 构建**：

```typescript
function buildSystemPrompt(memory: UserMemory): string {
  return `你是 AInvest 投研助手。

用户偏好：
- 风险偏好：${memory.riskPreference ?? '未明确'}
- 关注板块：${memory.watchedSectors?.join(', ') ?? '未明确'}
- 常问问题：${memory.frequentQuestions?.join(', ') ?? '无'}

请根据用户偏好调整回答风格和内容重点。
当用户询问投资机会时，优先推荐其关注板块。
当用户询问风险时，参考其风险偏好等级给出建议。`;
}
```

### 6.5 Agent 引擎升级

**路径**：`src/renderer/services/agent/agentEngine.ts`

```typescript
export async function processUserInputV2(
  input: string,
  sessionId: string
): Promise<void> {
  const chatStore = useChatStore.getState();
  const memoryStore = useMemoryStore.getState();

  // 1. 添加用户消息到 UI
  chatStore.addUserMessage(input);

  // 2. 构建上下文
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(memoryStore.memory) },
    ...chatStore.getLLMContext(),
    { role: 'user', content: input },
  ];

  // 3. 调用 LLM 流式生成
  const stream = llmService.streamChat(messages, TOOL_DEFINITIONS);

  // 4. 处理流式响应
  let fullResponse = '';
  let pendingToolCall: ToolCall | null = null;

  for await (const chunk of stream) {
    const parsed = tryParseToolCall(chunk);
    if (parsed) {
      pendingToolCall = parsed;
      chatStore.showToolCallCard(parsed);

      // 执行工具
      const result = await executeTool(parsed);
      chatStore.showToolResult(result);

      // 回传结果，继续生成
      const toolMessages: ChatMessage[] = [
        ...messages,
        { role: 'assistant', content: '', tool_calls: [parsed] },
        { role: 'tool', content: JSON.stringify(result), tool_call_id: parsed.id },
      ];

      const finalStream = llmService.streamChat(toolMessages);
      for await (const finalChunk of finalStream) {
        fullResponse += finalChunk;
        chatStore.appendAgentMessage(finalChunk);
      }
    } else {
      fullResponse += chunk;
      chatStore.appendAgentMessage(chunk);
    }
  }

  // 5. 保存完整消息
  chatStore.finalizeAgentMessage(fullResponse);
}
```

---

## 七、数据流图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         v2 Agent 对话完整数据流                           │
│                                                                          │
│  用户输入 "查询茅台行情"                                                   │
│       │                                                                  │
│       ▼                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│  │  ChatStore  │───→│  构建上下文  │───→│  LLMService │                  │
│  │  添加用户消息 │    │  System+记忆 │    │  streamChat │                  │
│  └─────────────┘    │  +历史对话   │    └──────┬──────┘                  │
│                     └─────────────┘           │                          │
│                                               ▼                          │
│                                          Kimi API                        │
│                                               │                          │
│                                               ▼                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│  │  展示结果卡片 │←───│  ToolResult │←───│ executeTool │←── "market.query" │
│  │  + 自然语言  │    │  回传 LLM   │    │  (Mock/真实)│                  │
│  └─────────────┘    └─────────────┘    └─────────────┘                  │
│       ▲                                                                  │
│       │ 流式文本                                                          │
│  ┌─────────────┐                                                         │
│  │  ChatPanel  │                                                         │
│  │  逐字显示   │                                                         │
│  └─────────────┘                                                         │
│                                                                          │
│  【每日总结触发】                                                          │
│       │                                                                  │
│       ▼                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│  │ 收集当天对话 │───→│ LLM 提炼偏好 │───→│ memory.json │                  │
│  │             │    │ (risk/sector)│    │  长期记忆   │                  │
│  └─────────────┘    └─────────────┘    └─────────────┘                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 八、新增界面

| 界面 | 位置 | 功能 |
|------|------|------|
| 大模型设置页 | `features/settings/LLMSettings.tsx` | 配置 API Key、Base URL、模型、Temperature |
| 个人偏好展示 | `features/settings/PreferenceSettings.tsx` | 查看/手动修改风险偏好、关注板块、常问问题 |
| API Key 引导横幅 | `features/chat/ChatPanel.tsx` 顶部 | 未配置时提示用户配置 |
| 总结今日偏好按钮 | `features/session/SessionSidebar.tsx` 底部 | Mock 入口，手动触发偏好提炼 |

---

## 九、文件变更清单

### 新增文件

| 文件路径 | 说明 |
|---------|------|
| `src/renderer/services/llm/llmService.ts` | LLM API 统一封装 |
| `src/renderer/services/llm/types.ts` | LLM 相关类型定义 |
| `src/renderer/services/agent/intentClassifier.ts` | 意图识别器 |
| `src/renderer/stores/useMemoryStore.ts` | 长期记忆状态管理 |
| `src/renderer/features/settings/LLMSettings.tsx` | 大模型配置 UI |
| `src/renderer/features/settings/PreferenceSettings.tsx` | 个人偏好 UI |

### 修改文件

| 文件路径 | 变更内容 |
|---------|---------|
| `src/renderer/services/agent/agentEngine.ts` | 重写为 v2 LLM 驱动流程 |
| `src/renderer/stores/useChatStore.ts` | 扩展 `getLLMContext()` |
| `src/renderer/stores/usePreferenceStore.ts` | 扩展大模型配置字段 |
| `src/renderer/features/chat/ChatPanel.tsx` | 增加 API Key 引导横幅 |
| `src/renderer/features/session/SessionSidebar.tsx` | 增加"总结今日偏好"按钮 |
| `src/main/services/persistence.ts` | 增加 memory.json 读写 |

---

## 十、风险与应对

| 风险 | 影响 | 应对 |
|-----|------|------|
| Kimi API 不稳定/限流 | Agent 无法回复 | 本地正则兜底 + 降级提示 |
| API Key 泄露 | 费用风险 | v2 接受风险，v3 加密存储 |
| 上下文过长导致费用高 | 成本问题 | 限制 10 轮，v3 做摘要压缩 |
| 意图识别不准确 | 工具调用错误 | Fallback 策略 + 用户可手动纠正 |
| 偏好提炼不准确 | 长期记忆失真 | 用户可手动修改，提炼 Prompt 持续优化 |

---

*文档版本：v2.0*
*最后更新：2026-06-06*
