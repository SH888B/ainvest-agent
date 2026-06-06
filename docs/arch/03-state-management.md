# 03. Zustand 状态管理与 Store 接口定义

> **目标**：读完本文档，你能知道每个 Store 管什么数据、提供什么操作、怎么和组件配合使用。
> 
> **前置知识**：Zustand 是一个轻量级的 React 状态管理库。你可以把它想象成一个"全局的 useState"，任何组件都可以读写它，而且修改后所有订阅的组件都会自动重新渲染。

---

## 一、为什么选 Zustand？

| 特性 | Redux | Zustand | 本项目选择 |
|------|-------|---------|-----------|
| 样板代码 | 多（Action、Reducer、Selector） | 几乎没有 | ✅ Zustand 赢 |
| TypeScript 支持 | 需要额外配置 | 原生完美支持 | ✅ Zustand 赢 |
| 学习成本 | 高 | 低（5 分钟上手） | ✅ Zustand 赢 |
| 中间件 | 丰富 | 够用（persist、immer） | 平手 |
| 性能 | 优秀 | 优秀（默认按引用比较） | 平手 |

**结论**：本项目状态相对集中，不需要 Redux 的复杂中间件生态，Zustand 的简洁性更适合快速迭代。

---

## 二、Store 设计总览

v1 共 **5 个 Store**，每个 Store 负责一个独立的数据域：

```
┌─────────────────────────────────────────────────────────────────┐
│                         Zustand Store 全景图                      │
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐ │
│  │ useSessionStore │    │  useChatStore   │    │useMarketStore│ │
│  │  Session 元数据  │    │  聊天消息列表    │    │ 行情看板状态 │ │
│  │  - 当前 Session │    │  - 消息列表     │    │ - 当前视图  │ │
│  │  - Session 列表 │    │  - 发送消息     │    │ - 活跃个股  │ │
│  │  - 增删改查     │    │  - 追加消息     │    │ - 个股数据  │ │
│  └────────┬────────┘    └────────┬────────┘    └──────┬──────┘ │
│           │                      │                    │        │
│           └──────────────────────┼────────────────────┘        │
│                                  │                             │
│                    ┌─────────────┴─────────────┐              │
│                    │      useToolStore         │              │
│                    │    工具调用状态            │              │
│                    │    - 当前调用中           │              │
│                    │    - 结果缓存             │              │
│                    └─────────────┬─────────────┘              │
│                                  │                             │
│                    ┌─────────────┴─────────────┐              │
│                    │   usePreferenceStore      │              │
│                    │    用户偏好设置            │              │
│                    │    - 主题/市场/语言       │              │
│                    └───────────────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

### Store 依赖关系

**规则**：Store 之间尽量避免相互 import，如果必须通信，通过订阅模式：

```typescript
// ❌ 错误：Store A 直接调用 Store B 的方法
const useStoreA = create((set) => ({
  doSomething: () => {
    useStoreB.getState().doSomethingElse(); // 耦合！
  }
}));

// ✅ 正确：通过组件层或事件层协调
function SomeComponent() {
  const { actionA } = useStoreA();
  const { actionB } = useStoreB();
  
  const handleClick = () => {
    actionA();
    actionB(); // 在组件层组合多个 Store 操作
  };
}
```

---

## 三、Store 详细接口定义

### 3.1 useSessionStore —— Session 管理

**职责**：管理 Session 列表和当前激活的 Session。

```typescript
// src/renderer/stores/useSessionStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================
// 类型定义
// ============================================================

export interface SessionMeta {
  id: string;           // UUID，唯一标识
  name: string;         // 用户可见的名称，如"白酒研究"
  createdAt: number;    // 创建时间戳（毫秒）
  updatedAt: number;    // 最后活动时间戳
  associatedSymbols: string[]; // 关联的股票代码列表（如 ['600519.SH', '000858.SZ']）
}

export interface SessionState {
  // ─── State ───
  sessions: SessionMeta[];      // 所有 Session 的元数据列表
  currentSessionId: string | null; // 当前激活的 Session ID

  // ─── Actions ───
  /** 创建新 Session */
  createSession: (name: string) => SessionMeta;
  /** 删除 Session */
  deleteSession: (sessionId: string) => void;
  /** 重命名 Session */
  renameSession: (sessionId: string, newName: string) => void;
  /** 切换当前 Session */
  setCurrentSession: (sessionId: string) => void;
  /** 更新 Session 的最后活动时间 */
  touchSession: (sessionId: string) => void;
  /** 添加关联股票代码 */
  addAssociatedSymbol: (sessionId: string, symbol: string) => void;
  /** 加载 Session 列表（从 IPC 读取后调用） */
  loadSessions: (sessions: SessionMeta[]) => void;
}

// ============================================================
// Store 实现
// ============================================================

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      // 初始状态
      sessions: [],
      currentSessionId: null,

      // 创建新 Session
      createSession: (name: string) => {
        const newSession: SessionMeta = {
          id: crypto.randomUUID(),
          name,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          associatedSymbols: [],
        };
        set((state) => ({
          sessions: [newSession, ...state.sessions],
          currentSessionId: newSession.id,
        }));
        return newSession;
      },

      // 删除 Session
      deleteSession: (sessionId: string) => {
        set((state) => {
          const filtered = state.sessions.filter((s) => s.id !== sessionId);
          return {
            sessions: filtered,
            currentSessionId:
              state.currentSessionId === sessionId
                ? filtered[0]?.id ?? null
                : state.currentSessionId,
          };
        });
      },

      // 重命名 Session
      renameSession: (sessionId: string, newName: string) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, name: newName } : s
          ),
        }));
      },

      // 切换当前 Session
      setCurrentSession: (sessionId: string) => {
        set({ currentSessionId: sessionId });
        get().touchSession(sessionId);
      },

      // 更新最后活动时间
      touchSession: (sessionId: string) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, updatedAt: Date.now() } : s
          ),
        }));
      },

      // 添加关联股票
      addAssociatedSymbol: (sessionId: string, symbol: string) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId && !s.associatedSymbols.includes(symbol)
              ? { ...s, associatedSymbols: [...s.associatedSymbols, symbol] }
              : s
          ),
        }));
      },

      // 批量加载（从磁盘恢复时）
      loadSessions: (sessions: SessionMeta[]) => {
        set({ sessions, currentSessionId: sessions[0]?.id ?? null });
      },
    }),
    {
      name: 'ainvest-session-store', // localStorage 的 key
      partialize: (state) => ({ sessions: state.sessions }), // 只持久化 sessions，不持久化 currentSessionId
    }
  )
);
```

**使用示例**：

```typescript
// 在组件中读取
function SessionSidebar() {
  const { sessions, currentSessionId, setCurrentSession, createSession } = useSessionStore();
  
  return (
    <div>
      {sessions.map((session) => (
        <SessionItem
          key={session.id}
          name={session.name}
          isActive={session.id === currentSessionId}
          onClick={() => setCurrentSession(session.id)}
        />
      ))}
      <button onClick={() => createSession('新会话')}>+ 新建</button>
    </div>
  );
}

// 在组件外读取（如 service 中）
function someServiceFunction() {
  const currentId = useSessionStore.getState().currentSessionId;
  // ...
}
```

---

### 3.2 useChatStore —— 聊天消息

**职责**：管理当前 Session 的消息列表。

```typescript
// src/renderer/stores/useChatStore.ts

import { create } from 'zustand';

// ============================================================
// 类型定义
// ============================================================

export type MessageRole = 'user' | 'agent';
export type MessageStatus = 'sending' | 'thinking' | 'tool_calling' | 'completed' | 'error';

export interface ToolCallInfo {
  toolId: string;
  toolName: string;
  params: Record<string, unknown>;
  result?: unknown;
  status: 'pending' | 'success' | 'error';
  errorMessage?: string;
}

export interface ChatMessage {
  id: string;           // 消息唯一 ID
  role: MessageRole;    // 'user' | 'agent'
  content: string;      // 消息文本内容
  timestamp: number;    // 发送时间戳
  status?: MessageStatus; // Agent 消息的处理状态
  thinking?: string;    // Agent 思考过程文本（可折叠）
  toolCalls?: ToolCallInfo[]; // 本次消息关联的工具调用
}

export interface ChatState {
  // ─── State ───
  messages: ChatMessage[];    // 当前 Session 的消息列表
  isTyping: boolean;          // Agent 是否正在输入

  // ─── Actions ───
  /** 添加用户消息 */
  addUserMessage: (content: string) => ChatMessage;
  /** 添加 Agent 消息（初始状态） */
  addAgentMessage: (content?: string) => ChatMessage;
  /** 更新消息内容 */
  updateMessage: (messageId: string, updates: Partial<ChatMessage>) => void;
  /** 设置 Agent 思考过程 */
  setMessageThinking: (messageId: string, thinking: string) => void;
  /** 添加工具调用记录 */
  addToolCall: (messageId: string, toolCall: ToolCallInfo) => void;
  /** 更新工具调用结果 */
  updateToolCallResult: (messageId: string, toolId: string, result: unknown, error?: string) => void;
  /** 设置输入状态 */
  setIsTyping: (typing: boolean) => void;
  /** 加载历史消息（切换 Session 时） */
  loadMessages: (messages: ChatMessage[]) => void;
  /** 清空消息 */
  clearMessages: () => void;
}

// ============================================================
// Store 实现
// ============================================================

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isTyping: false,

  addUserMessage: (content: string) => {
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    set((state) => ({ messages: [...state.messages, message] }));
    return message;
  },

  addAgentMessage: (content = '') => {
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'agent',
      content,
      timestamp: Date.now(),
      status: 'thinking',
    };
    set((state) => ({ messages: [...state.messages, message], isTyping: true }));
    return message;
  },

  updateMessage: (messageId: string, updates: Partial<ChatMessage>) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, ...updates } : m
      ),
    }));
  },

  setMessageThinking: (messageId: string, thinking: string) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, thinking } : m
      ),
    }));
  },

  addToolCall: (messageId: string, toolCall: ToolCallInfo) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId
          ? { ...m, toolCalls: [...(m.toolCalls ?? []), toolCall] }
          : m
      ),
    }));
  },

  updateToolCallResult: (messageId: string, toolId: string, result: unknown, error?: string) => {
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== messageId) return m;
        return {
          ...m,
          toolCalls: m.toolCalls?.map((tc) =>
            tc.toolId === toolId
              ? {
                  ...tc,
                  result,
                  status: error ? 'error' : 'success',
                  errorMessage: error,
                }
              : tc
          ),
        };
      }),
    }));
  },

  setIsTyping: (typing: boolean) => set({ isTyping: typing }),

  loadMessages: (messages: ChatMessage[]) => set({ messages, isTyping: false }),

  clearMessages: () => set({ messages: [], isTyping: false }),
}));
```

**使用示例**：

```typescript
function ChatMessageList() {
  const { messages, isTyping } = useChatStore();

  return (
    <div className="flex-1 overflow-y-auto">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {isTyping && <TypingIndicator />}
    </div>
  );
}
```

---

### 3.3 useMarketStore —— 【新增】行情看板状态

**职责**：管理行情看板的视图状态和当前查看的个股。

```typescript
// src/renderer/stores/useMarketStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================
// 类型定义
// ============================================================

export type MarketView = 'overview' | 'stockDetail';

export interface MarketState {
  // ─── State ───
  currentView: MarketView;      // 当前视图：'overview' | 'stockDetail'
  activeSymbol: string | null;  // 当前查看的个股代码（如 '600519.SH'）
  watchlist: string[];          // 自选股代码列表

  // ─── Actions ───
  /** 切换到行情总览 */
  switchToOverview: () => void;
  /** 切换到个股详情 */
  switchToStockDetail: (symbol: string) => void;
  /** 设置活跃个股（不切换视图，仅更新数据） */
  setActiveSymbol: (symbol: string) => void;
  /** 添加到自选股 */
  addToWatchlist: (symbol: string) => void;
  /** 从自选股移除 */
  removeFromWatchlist: (symbol: string) => void;
  /** 加载自选股（从持久化恢复） */
  loadWatchlist: (symbols: string[]) => void;
}

// ============================================================
// Store 实现
// ============================================================

export const useMarketStore = create<MarketState>()(
  persist(
    (set) => ({
      currentView: 'overview',
      activeSymbol: null,
      watchlist: ['600519.SH', '000858.SZ', '300750.SZ', '002594.SZ', '000333.SZ'],

      switchToOverview: () =>
        set({ currentView: 'overview', activeSymbol: null }),

      switchToStockDetail: (symbol: string) =>
        set({ currentView: 'stockDetail', activeSymbol: symbol }),

      setActiveSymbol: (symbol: string) =>
        set({ activeSymbol: symbol }),

      addToWatchlist: (symbol: string) =>
        set((state) => ({
          watchlist: state.watchlist.includes(symbol)
            ? state.watchlist
            : [...state.watchlist, symbol],
        })),

      removeFromWatchlist: (symbol: string) =>
        set((state) => ({
          watchlist: state.watchlist.filter((s) => s !== symbol),
        })),

      loadWatchlist: (symbols: string[]) => set({ watchlist: symbols }),
    }),
    {
      name: 'ainvest-market-store',
      partialize: (state) => ({
        watchlist: state.watchlist,
        // 不持久化 currentView 和 activeSymbol，每次启动回到总览
      }),
    }
  )
);
```

**使用示例**：

```typescript
// 在行情看板组件中
function MarketPanel() {
  const { currentView, activeSymbol } = useMarketStore();

  return (
    <div className="w-full h-full">
      {currentView === 'overview' && <MarketOverview />}
      {currentView === 'stockDetail' && activeSymbol && <StockDetail symbol={activeSymbol} />}
    </div>
  );
}

// 在聊天面板中点击个股链接
function StockLink({ symbol, name }: { symbol: string; name: string }) {
  const { switchToStockDetail } = useMarketStore();

  return (
    <button
      className="text-blue-400 underline hover:text-blue-300"
      onClick={() => switchToStockDetail(symbol)}
    >
      【{name}】
    </button>
  );
}
```

---

### 3.4 usePreferenceStore —— 用户偏好

**职责**：管理用户偏好设置。

```typescript
// src/renderer/stores/usePreferenceStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'dark' | 'light';
export type Market = 'A股' | '港股' | '美股';
export type Language = 'zh-CN' | 'en-US';

export interface PreferenceState {
  // ─── State ───
  theme: Theme;
  defaultMarket: Market;
  language: Language;
  refreshInterval: number; // 秒，v1 仅展示

  // ─── Actions ───
  setTheme: (theme: Theme) => void;
  setDefaultMarket: (market: Market) => void;
  setLanguage: (lang: Language) => void;
  setRefreshInterval: (interval: number) => void;
  resetToDefaults: () => void;
}

const DEFAULT_PREFERENCES = {
  theme: 'dark' as Theme,
  defaultMarket: 'A股' as Market,
  language: 'zh-CN' as Language,
  refreshInterval: 30,
};

export const usePreferenceStore = create<PreferenceState>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFERENCES,

      setTheme: (theme: Theme) => {
        set({ theme });
        // 同步到 HTML 标签，让 Tailwind dark: 类生效
        document.documentElement.classList.toggle('dark', theme === 'dark');
      },

      setDefaultMarket: (market: Market) => set({ defaultMarket: market }),
      setLanguage: (lang: Language) => set({ language: lang }),
      setRefreshInterval: (interval: number) => set({ refreshInterval: interval }),
      resetToDefaults: () => set(DEFAULT_PREFERENCES),
    }),
    {
      name: 'ainvest-preference-store',
    }
  )
);
```

---

### 3.5 useToolStore —— 工具调用状态

**职责**：管理工具调用的全局状态（谁在调用、调用结果缓存）。

```typescript
// src/renderer/stores/useToolStore.ts

import { create } from 'zustand';

export interface ToolExecution {
  id: string;           // 执行实例 ID
  toolId: string;       // 工具 ID
  status: 'idle' | 'running' | 'success' | 'error';
  params: Record<string, unknown>;
  result?: unknown;
  error?: string;
  startTime: number;
  endTime?: number;
}

export interface ToolState {
  // ─── State ───
  executions: Record<string, ToolExecution>; // key = executionId
  isAnyToolRunning: boolean;

  // ─── Actions ───
  startExecution: (toolId: string, params: Record<string, unknown>) => string;
  completeExecution: (executionId: string, result: unknown) => void;
  failExecution: (executionId: string, error: string) => void;
  clearExecution: (executionId: string) => void;
  clearAllExecutions: () => void;
}

export const useToolStore = create<ToolState>((set, get) => ({
  executions: {},
  isAnyToolRunning: false,

  startExecution: (toolId: string, params: Record<string, unknown>) => {
    const id = crypto.randomUUID();
    const execution: ToolExecution = {
      id,
      toolId,
      status: 'running',
      params,
      startTime: Date.now(),
    };
    set((state) => ({
      executions: { ...state.executions, [id]: execution },
      isAnyToolRunning: true,
    }));
    return id;
  },

  completeExecution: (executionId: string, result: unknown) => {
    set((state) => ({
      executions: {
        ...state.executions,
        [executionId]: {
          ...state.executions[executionId],
          status: 'success',
          result,
          endTime: Date.now(),
        },
      },
      isAnyToolRunning: Object.values(state.executions).some(
        (e) => e.id !== executionId && e.status === 'running'
      ),
    }));
  },

  failExecution: (executionId: string, error: string) => {
    set((state) => ({
      executions: {
        ...state.executions,
        [executionId]: {
          ...state.executions[executionId],
          status: 'error',
          error,
          endTime: Date.now(),
        },
      },
      isAnyToolRunning: Object.values(state.executions).some(
        (e) => e.id !== executionId && e.status === 'running'
      ),
    }));
  },

  clearExecution: (executionId: string) => {
    set((state) => {
      const { [executionId]: _, ...rest } = state.executions;
      return { executions: rest };
    });
  },

  clearAllExecutions: () => set({ executions: {}, isAnyToolRunning: false }),
}));
```

---

## 四、Store 组合使用模式

### 4.1 Session 切换时的数据联动

当用户切换 Session 时，需要同时更新多个 Store：

```typescript
// src/renderer/services/session/sessionManager.ts

import { useSessionStore } from '@/stores/useSessionStore';
import { useChatStore } from '@/stores/useChatStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { ipcFileService } from '@/services/persistence/ipcFileService';

/**
 * 切换 Session 的完整流程
 * 1. 保存当前 Session 的聊天记录到磁盘
 * 2. 加载新 Session 的聊天记录
 * 3. 恢复行情看板视图状态
 */
export async function switchSession(targetSessionId: string): Promise<void> {
  const sessionStore = useSessionStore.getState();
  const chatStore = useChatStore.getState();
  const marketStore = useMarketStore.getState();

  const currentId = sessionStore.currentSessionId;

  // 1. 保存当前 Session 消息（如果有）
  if (currentId) {
    await ipcFileService.saveSessionMessages(currentId, chatStore.messages);
  }

  // 2. 切换 Session
  sessionStore.setCurrentSession(targetSessionId);

  // 3. 加载新 Session 的消息
  const result = await ipcFileService.loadSessionMessages(targetSessionId);
  if (result.success && result.data) {
    chatStore.loadMessages(result.data);
  } else {
    chatStore.clearMessages();
  }

  // 4. 恢复行情看板到总览（Session 切换时重置）
  marketStore.switchToOverview();
}
```

### 4.2 用户发送消息后的完整状态流转

```typescript
// src/renderer/services/agent/agentEngine.ts（简化版）

import { useChatStore } from '@/stores/useChatStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useToolStore } from '@/stores/useToolStore';
import { intentRecognizer } from './intentRecognizer';
import { mockToolRegistry } from '@/services/mock';

export async function processUserInput(inputText: string): Promise<void> {
  const chatStore = useChatStore.getState();
  const sessionStore = useSessionStore.getState();
  const toolStore = useToolStore.getState();

  // 1. 添加用户消息
  chatStore.addUserMessage(inputText);

  // 2. 创建 Agent 消息（初始状态：thinking）
  const agentMessage = chatStore.addAgentMessage();

  // 3. 意图识别
  const intent = intentRecognizer.recognize(inputText);
  chatStore.setMessageThinking(agentMessage.id, `识别到意图：${intent.type}`);

  // 4. 如果需要工具调用
  if (intent.requiresTool && intent.toolId) {
    chatStore.updateMessage(agentMessage.id, { status: 'tool_calling' });

    // 4a. 记录工具调用
    const executionId = toolStore.startExecution(intent.toolId, intent.params);
    chatStore.addToolCall(agentMessage.id, {
      toolId: intent.toolId,
      toolName: intent.toolName,
      params: intent.params,
      status: 'pending',
    });

    // 4b. 执行 Mock 工具
    try {
      const toolFn = mockToolRegistry.getTool(intent.toolId);
      const result = await toolFn(intent.params);

      // 4c. 更新工具状态
      toolStore.completeExecution(executionId, result);
      chatStore.updateToolCallResult(agentMessage.id, intent.toolId, result);

      // 4d. 更新 Agent 消息为完成状态
      const summaryText = buildSummaryText(intent.toolId, result);
      chatStore.updateMessage(agentMessage.id, {
        content: summaryText,
        status: 'completed',
      });
    } catch (error) {
      const errorMsg = (error as Error).message;
      toolStore.failExecution(executionId, errorMsg);
      chatStore.updateToolCallResult(agentMessage.id, intent.toolId, null, errorMsg);
      chatStore.updateMessage(agentMessage.id, {
        content: `抱歉，查询失败：${errorMsg}`,
        status: 'error',
      });
    }
  } else {
    // 5. 不需要工具，直接回复
    const replyText = generateReplyText(intent);
    chatStore.updateMessage(agentMessage.id, {
      content: replyText,
      status: 'completed',
    });
  }

  // 6. 更新 Session 时间
  const currentId = sessionStore.currentSessionId;
  if (currentId) {
    sessionStore.touchSession(currentId);
  }

  chatStore.setIsTyping(false);
}
```

---

## 五、Store 持久化策略

| Store | 持久化方式 | 持久化内容 | 理由 |
|-------|-----------|-----------|------|
| `useSessionStore` | localStorage（Zustand persist） | `sessions` 数组 | 轻量、读取频繁 |
| `useChatStore` | ❌ 不持久化 | — | 聊天记录通过 IPC 存到 JSON 文件 |
| `useMarketStore` | localStorage（Zustand persist） | `watchlist` | 自选股需要记住 |
| `usePreferenceStore` | localStorage（Zustand persist） | 全部 | 偏好设置必须记住 |
| `useToolStore` | ❌ 不持久化 | — | 运行时状态，重启清空 |

**聊天记录的持久化流程**：

```
用户发送消息 ──→ ChatStore 更新 ──→ 触发副作用（useEffect）──→ IPC 调用 ──→ 主进程写入 JSON 文件
```

---

## 六、性能注意事项

1. **避免在 Store 中存储派生状态**：如"已完成的工具数量"应该通过 Selector 计算，而不是存储
2. **使用浅比较**：Zustand 默认用 `Object.is` 比较，确保更新时创建新对象
3. **细粒度订阅**：组件只订阅需要的状态片段，避免不必要的重渲染

```typescript
// ❌ 错误：整个 Store 变化都会重渲染
const state = useChatStore();

// ✅ 正确：只订阅 messages
const messages = useChatStore((state) => state.messages);

// ✅ 正确：使用 Selector 获取派生状态
const messageCount = useChatStore((state) => state.messages.length);
```

---

> **下一步**：阅读 `04-mock-services.md`，理解工具调用框架和 Mock 服务的接口定义。
