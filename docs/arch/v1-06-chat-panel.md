# 06. 聊天面板、Session 管理与快捷指令模块

> **目标**：读完本文档，你能知道聊天消息怎么流转、Session 怎么管理、快捷指令怎么工作。

---

## 一、聊天面板（Chat Panel）

### 1.1 模块定位

聊天面板位于主界面**中央 40%**，是用户与 Agent 交互的核心区域。

**核心职责**：
1. 展示消息列表（用户消息 + Agent 消息 + 工具结果）
2. 接收用户输入并发送给 Agent 引擎
3. 渲染个股链接并支持点击联动
4. 展示 Agent 思考过程和工具调用状态

### 1.2 组件架构

```
ChatPanel (index.tsx)
│
├── ChatHeader                 # 顶部：当前 Session 标题
├── ChatMessageList            # 消息列表（可滚动）
│   ├── UserMessageBubble      # 用户消息（右对齐）
│   └── AgentMessageBubble     # Agent 消息（左对齐）
│       ├── ThinkingBlock      # 思考过程折叠区
│       ├── MessageContent     # 消息正文（含 StockLink）
│       ├── ToolCallCard       # 工具调用展示
│       ├── MarketResultCard   # 行情结果卡片
│       ├── NewsResultList     # 新闻结果列表
│       └── BacktestResultCard # 回测结果卡片
│
├── CommandBar                 # 快捷指令栏（输入框上方）
│   └── CommandButton × N      # 单个指令按钮
│
└── ChatInputArea              # 输入区域
    ├── Input                  # 文本输入框
    └── SendButton             # 发送按钮
```

### 1.3 核心组件接口

#### ChatPanel（根组件）

```typescript
// src/renderer/features/chat-panel/index.tsx

import { useEffect } from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useChatStore } from '@/stores/useChatStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { ChatMessageList } from './components/ChatMessageList';
import { CommandBar } from '../command-bar';
import { ChatInputArea } from './components/ChatInputArea';
import { ChatHeader } from './components/ChatHeader';
import { processUserInput } from '@/services/agent/agentEngine';
import { ipcFileService } from '@/services/persistence/ipcFileService';

export function ChatPanel(): JSX.Element {
  const { currentSessionId, sessions } = useSessionStore();
  const { messages, loadMessages, clearMessages } = useChatStore();

  const currentSession = sessions.find((s) => s.id === currentSessionId);

  // Session 切换时加载聊天记录
  useEffect(() => {
    if (!currentSessionId) {
      clearMessages();
      return;
    }

    async function loadSessionMessages() {
      const result = await ipcFileService.loadSessionMessages(currentSessionId!);
      if (result.success && result.data) {
        loadMessages(result.data);
      } else {
        clearMessages();
      }
    }

    loadSessionMessages();
  }, [currentSessionId, loadMessages, clearMessages]);

  // 消息变化时自动保存
  useEffect(() => {
    if (!currentSessionId || messages.length === 0) return;

    const timeoutId = setTimeout(() => {
      ipcFileService.saveSessionMessages(currentSessionId, messages);
    }, 1000); // 防抖 1 秒

    return () => clearTimeout(timeoutId);
  }, [messages, currentSessionId]);

  const handleSend = async (text: string) => {
    if (!text.trim()) return;
    await processUserInput(text.trim());
  };

  return (
    <div className="flex flex-col h-full bg-gray-950">
      <ChatHeader title={currentSession?.name ?? '未选择会话'} />
      <ChatMessageList />
      <CommandBar onCommandClick={(cmd) => handleSend(cmd)} />
      <ChatInputArea onSend={handleSend} />
    </div>
  );
}
```

#### ChatMessageList（消息列表）

```typescript
// src/renderer/features/chat-panel/components/ChatMessageList.tsx

import { useEffect, useRef } from 'react';
import { useChatStore } from '@/stores/useChatStore';
import { UserMessageBubble } from './UserMessageBubble';
import { AgentMessageBubble } from './AgentMessageBubble';

export function ChatMessageList(): JSX.Element {
  const messages = useChatStore((state) => state.messages);
  const isTyping = useChatStore((state) => state.isTyping);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {messages.length === 0 && (
        <div className="flex items-center justify-center h-full text-gray-500 text-sm">
          开始你的投研对话吧...
        </div>
      )}

      {messages.map((message) =>
        message.role === 'user' ? (
          <UserMessageBubble key={message.id} message={message} />
        ) : (
          <AgentMessageBubble key={message.id} message={message} />
        )
      )}

      {isTyping && (
        <div className="flex items-center gap-1 text-gray-500 text-sm">
          <span className="animate-pulse">Agent 正在思考</span>
          <span className="animate-bounce">.</span>
          <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>.</span>
          <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>.</span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
```

#### ChatInputArea（输入区域）

```typescript
// src/renderer/features/chat-panel/components/ChatInputArea.tsx

import { useState, useCallback, KeyboardEvent } from 'react';

interface ChatInputAreaProps {
  onSend: (text: string) => void;
}

export function ChatInputArea({ onSend }: ChatInputAreaProps): JSX.Element {
  const [text, setText] = useState('');

  const handleSend = useCallback(() => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
  }, [text, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-800">
      <input
        type="text"
        className="flex-1 bg-gray-800 text-white text-sm px-3 py-2 rounded-md
                   border border-gray-700 outline-none
                   focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30
                   placeholder-gray-500"
        placeholder="输入指令，如：查询贵州茅台行情..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <button
        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md
                   hover:bg-blue-500 active:bg-blue-700
                   disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={handleSend}
        disabled={!text.trim()}
      >
        发送
      </button>
    </div>
  );
}
```

---

## 二、快捷指令栏（Command Bar）

### 2.1 模块定位

快捷指令栏位于**聊天输入框上方**，是一排可点击的快捷按钮。

**核心职责**：
1. 展示常用指令按钮（/行情、/新闻、/策略 等）
2. 点击后自动填充到输入框或执行对应操作
3. Session 管理类指令（/新建会话、/切换会话）

### 2.2 指令定义

```typescript
// src/renderer/features/command-bar/constants.ts

export type CommandType = 'fill' | 'action';

export interface CommandDefinition {
  id: string;
  label: string;           // 按钮上显示的文字，如 "/行情"
  description: string;     // 悬停提示
  type: CommandType;
  value: string;           // type='fill' 时填充到输入框的文本
  action?: () => void;     // type='action' 时执行的操作
}

/**
 * 投研类指令：点击后填充到输入框
 */
export const RESEARCH_COMMANDS: CommandDefinition[] = [
  {
    id: 'cmd-market',
    label: '/行情',
    description: '查询股票行情',
    type: 'fill',
    value: '/行情 ',
  },
  {
    id: 'cmd-news',
    label: '/新闻',
    description: '搜索相关新闻',
    type: 'fill',
    value: '/新闻 ',
  },
  {
    id: 'cmd-strategy',
    label: '/策略',
    description: '策略回测',
    type: 'fill',
    value: '/策略 ',
  },
  {
    id: 'cmd-profile',
    label: '/档案',
    description: '股票基本面档案',
    type: 'fill',
    value: '/档案 ',
  },
];

/**
 * Session 管理类指令：点击后直接执行操作
 */
export const SESSION_COMMANDS: CommandDefinition[] = [
  {
    id: 'cmd-new-session',
    label: '/新建会话',
    description: '创建新的研究会话',
    type: 'action',
    value: '',
    action: () => {
      // 通过 Store 创建新 Session
      const { createSession, setCurrentSession } = useSessionStore.getState();
      const session = createSession('新会话');
      setCurrentSession(session.id);
    },
  },
];

export const ALL_COMMANDS = [...RESEARCH_COMMANDS, ...SESSION_COMMANDS];
```

### 2.3 CommandBar 组件

```typescript
// src/renderer/features/command-bar/index.tsx

import { ALL_COMMANDS } from './constants';

interface CommandBarProps {
  onCommandClick: (text: string) => void;
}

export function CommandBar({ onCommandClick }: CommandBarProps): JSX.Element {
  return (
    <div className="flex items-center gap-1 px-4 py-2 border-t border-gray-800 overflow-x-auto">
      <span className="text-xs text-gray-500 mr-2 shrink-0">快捷指令：</span>
      {ALL_COMMANDS.map((cmd) => (
        <button
          key={cmd.id}
          className="px-2 py-1 text-xs rounded bg-gray-800 text-gray-300
                     hover:bg-gray-700 hover:text-white transition-colors shrink-0"
          title={cmd.description}
          onClick={() => {
            if (cmd.type === 'fill') {
              onCommandClick(cmd.value);
            } else if (cmd.action) {
              cmd.action();
            }
          }}
        >
          {cmd.label}
        </button>
      ))}
    </div>
  );
}
```

### 2.4 与输入框的联动

CommandBar 的 `onCommandClick` 回调由 ChatPanel 传入，ChatPanel 需要把填充的文本传递给 ChatInputArea：

```typescript
// ChatPanel 中的状态提升
function ChatPanel() {
  const [pendingInput, setPendingInput] = useState('');
  const inputRef = useRef<{ setValue: (v: string) => void }>(null);

  const handleCommandClick = (text: string) => {
    // 这里需要一种方式让 ChatInputArea 接收到 text
    // 方案 A：通过 ref（推荐，因为不是频繁变化的状态）
    inputRef.current?.setValue(text);
  };

  return (
    <>
      <CommandBar onCommandClick={handleCommandClick} />
      <ChatInputArea ref={inputRef} onSend={handleSend} />
    </>
  );
}
```

---

## 三、Session 管理模块（Session Sidebar）

### 3.1 模块定位

Session 侧边栏位于主界面**右侧 20%**，展示所有 Session 列表，支持增删改查。

### 3.2 组件架构

```
SessionSidebar (index.tsx)
│
├── SidebarHeader              # 顶部标题 + 新建按钮
├── SessionList                # Session 列表
│   └── SessionItem × N        # 单个 Session 项
│       ├── SessionName        # 名称（可点击切换）
│       ├── LastActiveTime     # 最后活动时间
│       └── ContextMenu        # 右键菜单（重命名/删除）
└── SidebarFooter              # 底部设置入口
```

### 3.3 核心组件接口

#### SessionSidebar

```typescript
// src/renderer/features/session-sidebar/index.tsx

import { useState } from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import { SessionItem } from './components/SessionItem';
import { switchSession } from '@/services/session/sessionManager';

export function SessionSidebar(): JSX.Element {
  const { sessions, currentSessionId, createSession } = useSessionStore();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sessionId: string } | null>(null);

  // 按最后活动时间倒序排列
  const sortedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  const handleCreateSession = () => {
    const session = createSession('新会话');
    // 创建后自动切换，但不清空（因为是新会话）
    useChatStore.getState().clearMessages();
  };

  const handleSessionClick = (sessionId: string) => {
    if (sessionId === currentSessionId) return;
    switchSession(sessionId);
  };

  return (
    <div className="flex flex-col h-full w-full bg-gray-900 border-l border-gray-800">
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <span className="text-sm font-medium text-gray-300">会话列表</span>
        <button
          className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-500"
          onClick={handleCreateSession}
        >
          + 新建
        </button>
      </div>

      {/* Session 列表 */}
      <div className="flex-1 overflow-y-auto">
        {sortedSessions.map((session) => (
          <SessionItem
            key={session.id}
            session={session}
            isActive={session.id === currentSessionId}
            onClick={() => handleSessionClick(session.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, sessionId: session.id });
            }}
          />
        ))}
      </div>

      {/* 底部 */}
      <div className="px-3 py-2 border-t border-gray-800">
        <button className="text-xs text-gray-500 hover:text-gray-300">
          ⚙ 设置
        </button>
      </div>
    </div>
  );
}
```

#### SessionItem

```typescript
// src/renderer/features/session-sidebar/components/SessionItem.tsx

import type { SessionMeta } from '@/stores/useSessionStore';
import { formatRelativeTime } from '@/utils/formatters';

interface SessionItemProps {
  session: SessionMeta;
  isActive: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function SessionItem({ session, isActive, onClick, onContextMenu }: SessionItemProps): JSX.Element {
  return (
    <div
      className={`px-3 py-2 cursor-pointer transition-colors
        ${isActive ? 'bg-gray-800 border-l-2 border-blue-500' : 'hover:bg-gray-800/50 border-l-2 border-transparent'}
      `}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <div className="text-sm text-white truncate">{session.name}</div>
      <div className="text-xs text-gray-500 mt-0.5">
        {formatRelativeTime(session.updatedAt)}
      </div>
      {session.associatedSymbols.length > 0 && (
        <div className="flex gap-1 mt-1">
          {session.associatedSymbols.slice(0, 3).map((sym) => (
            <span key={sym} className="text-[10px] px-1 py-0.5 bg-gray-700 text-gray-400 rounded">
              {sym}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 3.4 Session 切换管理器

```typescript
// src/renderer/services/session/sessionManager.ts

import { useSessionStore } from '@/stores/useSessionStore';
import { useChatStore } from '@/stores/useChatStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { ipcFileService } from '@/services/persistence/ipcFileService';

/**
 * 切换 Session 的完整流程
 *
 * 1. 保存当前 Session 的聊天记录到磁盘
 * 2. 更新 Store 中的当前 Session
 * 3. 加载新 Session 的聊天记录
 * 4. 重置行情看板到总览
 */
export async function switchSession(targetSessionId: string): Promise<void> {
  const sessionStore = useSessionStore.getState();
  const chatStore = useChatStore.getState();
  const marketStore = useMarketStore.getState();

  const currentId = sessionStore.currentSessionId;

  // 1. 保存当前 Session（如果有）
  if (currentId && chatStore.messages.length > 0) {
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

  // 4. 重置行情看板
  marketStore.switchToOverview();
}

/**
 * 删除 Session
 * 1. 从磁盘删除文件
 * 2. 从 Store 移除
 * 3. 如果删除的是当前 Session，自动切换到其他 Session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const sessionStore = useSessionStore.getState();
  const chatStore = useChatStore.getState();

  // 1. 删除磁盘文件
  await ipcFileService.deleteSessionFile(sessionId);

  // 2. 如果删除的是当前 Session，先清空消息
  if (sessionStore.currentSessionId === sessionId) {
    chatStore.clearMessages();
  }

  // 3. 从 Store 移除
  sessionStore.deleteSession(sessionId);
}
```

---

## 四、消息渲染规范

### 4.1 用户消息气泡

```typescript
// src/renderer/features/chat-panel/components/UserMessageBubble.tsx

import type { ChatMessage } from '@/stores/useChatStore';

interface UserMessageBubbleProps {
  message: ChatMessage;
}

export function UserMessageBubble({ message }: UserMessageBubbleProps): JSX.Element {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] bg-blue-600 text-white text-sm px-4 py-2 rounded-2xl rounded-tr-sm">
        {message.content}
      </div>
    </div>
  );
}
```

### 4.2 Agent 消息气泡（完整版）

```typescript
// src/renderer/features/chat-panel/components/AgentMessageBubble.tsx

import { useState } from 'react';
import { useMessageParser } from '../hooks/useMessageParser';
import { StockLink } from './StockLink';
import { ToolCallCard } from './ToolCallCard';
import type { ChatMessage } from '@/stores/useChatStore';

interface AgentMessageBubbleProps {
  message: ChatMessage;
}

export function AgentMessageBubble({ message }: AgentMessageBubbleProps): JSX.Element {
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);
  const parsedParts = useMessageParser(message.content);

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] flex flex-col gap-2">
        {/* 思考过程（可折叠） */}
        {message.thinking && (
          <div className="bg-gray-800/50 rounded-md overflow-hidden">
            <button
              className="w-full px-3 py-1.5 text-xs text-gray-500 text-left hover:text-gray-400 flex items-center gap-1"
              onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
            >
              <span>{isThinkingExpanded ? '▼' : '▶'}</span>
              <span>Agent 思考过程</span>
            </button>
            {isThinkingExpanded && (
              <pre className="px-3 pb-2 text-xs text-gray-500 font-mono whitespace-pre-wrap">
                {message.thinking}
              </pre>
            )}
          </div>
        )}

        {/* 消息正文 */}
        <div className="bg-gray-800 text-gray-100 text-sm px-4 py-3 rounded-2xl rounded-tl-sm leading-relaxed">
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

        {/* 状态标签 */}
        {message.status === 'error' && (
          <span className="text-xs text-red-400">查询失败</span>
        )}
      </div>
    </div>
  );
}
```

---

> **下一步**：阅读 `07-persistence.md`，理解数据如何持久化到硬盘。
