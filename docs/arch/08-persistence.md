# 08. 持久化层设计

> **目标**：读完本文档，你能知道应用的数据存在哪里、怎么存、怎么读，以及不同数据的持久化策略。

---

## 一、持久化分层总览

v1 采用**两层持久化**策略：

| 数据类型 | 存储位置 | 存储格式 | 读写方式 | 理由 |
|---------|---------|---------|---------|------|
| 用户偏好 | localStorage | JSON 字符串 | 渲染进程直接读写 | 轻量、高频读取、不需要复杂查询 |
| Session 元数据 | localStorage | JSON 字符串 | 渲染进程直接读写（通过 Zustand persist） | 列表较小，不需要文件操作 |
| Session 聊天记录 | 本地 JSON 文件 | JSON 文件 | IPC → 主进程读写 | 可能较大，分文件避免膨胀 |
| 自选股列表 | localStorage | JSON 字符串 | 渲染进程直接读写（通过 Zustand persist） | 列表较小，用户期望记住 |

**文件存储路径**：
```
Windows: C:\Users\<用户名>\AppData\Roaming\ainvest\sessions\
macOS:   ~/Library/Application Support/ainvest/sessions/
Linux:   ~/.config/ainvest/sessions/
```

---

## 二、目录结构（磁盘上）

```
<userData>/ainvest/
├── sessions/
│   ├── meta.json              # Session 元数据索引（所有 Session 的基本信息）
│   ├── <uuid-1>.json          # Session 1 的完整聊天记录
│   ├── <uuid-2>.json          # Session 2 的完整聊天记录
│   └── ...
└── settings.json              # 用户偏好设置（备用，主存 localStorage）
```

### 2.1 meta.json 格式

```json
{
  "version": 1,
  "lastUpdated": 1717651200000,
  "sessions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "白酒研究",
      "createdAt": 1717564800000,
      "updatedAt": 1717651200000,
      "associatedSymbols": ["600519.SH", "000858.SZ"]
    }
  ]
}
```

### 2.2 <uuid>.json 格式（单个 Session 聊天记录）

```json
{
  "version": 1,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "messages": [
    {
      "id": "msg-1",
      "role": "user",
      "content": "查询贵州茅台行情",
      "timestamp": 1717651200000
    },
    {
      "id": "msg-2",
      "role": "agent",
      "content": "贵州茅台当前价格 1688.00 元...",
      "timestamp": 1717651201000,
      "status": "completed",
      "thinking": "识别到意图：market_query...",
      "toolCalls": [
        {
          "toolId": "market.query",
          "toolName": "行情查询",
          "params": { "symbol": "600519.SH" },
          "status": "success",
          "result": { "symbol": "600519.SH", "price": 1688.00 }
        }
      ]
    }
  ]
}
```

---

## 三、持久化服务接口

### 3.1 localStorage 封装

```typescript
// src/renderer/services/persistence/localStorageService.ts

const PREFIX = 'ainvest:';

/**
 * localStorage 读写封装
 * 提供类型安全和错误处理
 */
export const localStorageService = {
  /**
   * 写入数据
   * @param key 键名（不需要加前缀）
   * @param value 任意可 JSON 序列化的数据
   */
  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value));
    } catch (e) {
      console.error(`localStorage 写入失败 [${key}]:`, e);
      // localStorage 满了时的降级处理
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        console.warn('localStorage 空间不足，请清理数据');
      }
    }
  },

  /**
   * 读取数据
   * @param key 键名
   * @returns 解析后的数据，不存在或解析失败返回 null
   */
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(`${PREFIX}${key}`);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch (e) {
      console.error(`localStorage 读取失败 [${key}]:`, e);
      return null;
    }
  },

  /**
   * 删除数据
   */
  remove(key: string): void {
    localStorage.removeItem(`${PREFIX}${key}`);
  },

  /**
   * 清空所有本应用的数据
   */
  clear(): void {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  },
};
```

### 3.2 IPC 文件服务（渲染进程侧）

```typescript
// src/renderer/services/persistence/ipcFileService.ts

import type { ChatMessage } from '@/stores/useChatStore';
import type { SessionMeta } from '@/stores/useSessionStore';
import type { UserPreference } from '@/stores/usePreferenceStore';
import type { IpcResponse } from '@shared/types/ipc';

/**
 * IPC 文件服务
 * 渲染进程通过 window.electronAPI 调用主进程的文件操作
 */
export const ipcFileService = {
  // ─── Session 操作 ───

  /**
   * 创建新 Session（在主进程中创建文件）
   */
  async createSessionFile(name: string): Promise<IpcResponse<SessionMeta>> {
    return window.electronAPI.createSession(name);
  },

  /**
   * 保存 Session 聊天记录到磁盘
   */
  async saveSessionMessages(
    sessionId: string,
    messages: ChatMessage[]
  ): Promise<IpcResponse<null>> {
    return window.electronAPI.saveSessionMessages(sessionId, messages);
  },

  /**
   * 从磁盘加载 Session 聊天记录
   */
  async loadSessionMessages(
    sessionId: string
  ): Promise<IpcResponse<ChatMessage[]>> {
    return window.electronAPI.loadSessionMessages(sessionId);
  },

  /**
   * 列出所有 Session 文件
   */
  async listAllSessions(): Promise<IpcResponse<SessionMeta[]>> {
    return window.electronAPI.listSessions();
  },

  /**
   * 删除 Session 文件
   */
  async deleteSessionFile(sessionId: string): Promise<IpcResponse<null>> {
    return window.electronAPI.deleteSession(sessionId);
  },

  /**
   * 重命名 Session
   */
  async renameSessionFile(
    sessionId: string,
    newName: string
  ): Promise<IpcResponse<null>> {
    return window.electronAPI.renameSession(sessionId, newName);
  },

  // ─── 偏好设置操作 ───

  /**
   * 从磁盘加载偏好设置（备用，主要用 localStorage）
   */
  async loadPreference(): Promise<IpcResponse<UserPreference>> {
    return window.electronAPI.getPreference();
  },

  /**
   * 保存偏好设置到磁盘（备用）
   */
  async savePreference(prefs: UserPreference): Promise<IpcResponse<null>> {
    return window.electronAPI.setPreference(prefs);
  },
};
```

### 3.3 主进程 IPC 处理器

```typescript
// src/main/ipc/handlers/session.handlers.ts

import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { readJsonFile, writeJsonFile, listFiles } from '../../services/fileService';
import type { IpcResponse } from '@shared/types/ipc';
import type { SessionMeta, ChatMessage } from '@shared/types';
import path from 'path';

const META_FILE = 'sessions/meta.json';

/**
 * 创建新 Session
 * 1. 生成元数据
 * 2. 创建空的消息文件
 * 3. 更新 meta.json
 */
export async function handleSessionCreate(
  _event: IpcMainInvokeEvent,
  { name }: { name: string }
): Promise<IpcResponse<SessionMeta>> {
  try {
    const session: SessionMeta = {
      id: crypto.randomUUID(),
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      associatedSymbols: [],
    };

    // 创建空消息文件
    await writeJsonFile(`sessions/${session.id}.json`, {
      version: 1,
      sessionId: session.id,
      messages: [],
    });

    // 更新 meta.json
    const meta = await readJsonFile<{ sessions: SessionMeta[] }>(META_FILE);
    const sessions = meta?.sessions ?? [];
    sessions.push(session);
    await writeJsonFile(META_FILE, { version: 1, lastUpdated: Date.now(), sessions });

    return { success: true, data: session };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * 保存 Session 消息
 */
export async function handleSessionSave(
  _event: IpcMainInvokeEvent,
  { sessionId, messages }: { sessionId: string; messages: ChatMessage[] }
): Promise<IpcResponse<null>> {
  try {
    await writeJsonFile(`sessions/${sessionId}.json`, {
      version: 1,
      sessionId,
      messages,
    });

    // 同时更新 meta.json 的 updatedAt
    const meta = await readJsonFile<{ sessions: SessionMeta[] }>(META_FILE);
    if (meta) {
      const session = meta.sessions.find((s) => s.id === sessionId);
      if (session) {
        session.updatedAt = Date.now();
        await writeJsonFile(META_FILE, { ...meta, lastUpdated: Date.now() });
      }
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * 加载 Session 消息
 */
export async function handleSessionLoad(
  _event: IpcMainInvokeEvent,
  { sessionId }: { sessionId: string }
): Promise<IpcResponse<ChatMessage[]>> {
  try {
    const data = await readJsonFile<{ messages: ChatMessage[] }>(
      `sessions/${sessionId}.json`
    );
    return { success: true, data: data?.messages ?? [] };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * 列出所有 Session
 */
export async function handleSessionList(
  _event: IpcMainInvokeEvent
): Promise<IpcResponse<SessionMeta[]>> {
  try {
    const meta = await readJsonFile<{ sessions: SessionMeta[] }>(META_FILE);
    return { success: true, data: meta?.sessions ?? [] };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * 删除 Session
 */
export async function handleSessionDelete(
  _event: IpcMainInvokeEvent,
  { sessionId }: { sessionId: string }
): Promise<IpcResponse<null>> {
  try {
    const fs = await import('fs/promises');
    const { app } = await import('electron');
    const filePath = path.join(app.getPath('userData'), 'ainvest', 'sessions', `${sessionId}.json`);
    await fs.unlink(filePath);

    // 更新 meta.json
    const meta = await readJsonFile<{ sessions: SessionMeta[] }>(META_FILE);
    if (meta) {
      meta.sessions = meta.sessions.filter((s) => s.id !== sessionId);
      await writeJsonFile(META_FILE, { ...meta, lastUpdated: Date.now() });
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * 重命名 Session
 */
export async function handleSessionRename(
  _event: IpcMainInvokeEvent,
  { sessionId, newName }: { sessionId: string; newName: string }
): Promise<IpcResponse<null>> {
  try {
    const meta = await readJsonFile<{ sessions: SessionMeta[] }>(META_FILE);
    if (meta) {
      const session = meta.sessions.find((s) => s.id === sessionId);
      if (session) {
        session.name = newName;
        session.updatedAt = Date.now();
        await writeJsonFile(META_FILE, { ...meta, lastUpdated: Date.now() });
      }
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
```

---

## 四、数据一致性策略

### 4.1 Session 元数据的两处存储

Session 元数据同时存在两个地方：
1. **Zustand Store**（内存中，通过 localStorage 恢复）
2. **meta.json**（磁盘上，通过 IPC 读写）

**同步策略**：
- **写入时双写**：修改 Session 信息后，同时更新 Store 和 meta.json
- **读取时以 Store 为准**：因为 Store 有 localStorage 备份，启动更快
- **启动时校验**：如果 meta.json 比 Store 新，用 meta.json 覆盖 Store

```typescript
// 启动时同步逻辑（在 App.tsx 或初始化 Hook 中）
async function syncSessionMetaOnStartup() {
  const store = useSessionStore.getState();
  const diskResult = await ipcFileService.listAllSessions();

  if (diskResult.success && diskResult.data) {
    const diskSessions = diskResult.data;
    const storeSessions = store.sessions;

    // 简单策略：磁盘数据优先（因为 IPC 操作是"事实来源"）
    if (diskSessions.length !== storeSessions.length) {
      store.loadSessions(diskSessions);
    }
  }
}
```

### 4.2 消息自动保存策略

聊天消息不需要每条都保存到磁盘（太频繁），采用**防抖保存**：

```typescript
// ChatPanel 中的自动保存（已在 06-chat-panel.md 中展示）
useEffect(() => {
  if (!currentSessionId || messages.length === 0) return;

  const timeoutId = setTimeout(() => {
    ipcFileService.saveSessionMessages(currentSessionId, messages);
  }, 1000); // 消息变化后 1 秒再保存

  return () => clearTimeout(timeoutId);
}, [messages, currentSessionId]);
```

### 4.3 版本兼容性

每个 JSON 文件都有 `version` 字段，v2 升级数据结构时可以据此迁移：

```typescript
// 读取时检查版本
const data = await readJsonFile<{ version: number; messages: ChatMessage[] }>(filePath);
if (data?.version === 1) {
  // 当前版本，直接使用
  return data.messages;
}
// v2 迁移逻辑...
```

---

## 五、错误处理与降级

| 场景 | 处理策略 |
|------|---------|
| localStorage 不可用（隐私模式） | 降级为内存存储，提示用户 |
| localStorage 空间不足 | 清理旧数据，保留最近 10 个 Session |
| IPC 调用失败 | Toast 提示用户，数据保留在内存中 |
| 文件读写失败 | 返回错误信息，不崩溃，允许用户重试 |
| JSON 解析失败 | 返回空数组，记录错误日志 |
| meta.json 损坏 | 从 .json 文件列表重建索引 |

---

> **下一步**：阅读 `09-sequencing.md`，理解关键交互的完整流程时序。
