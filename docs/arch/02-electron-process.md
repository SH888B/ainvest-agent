# 02. Electron 进程分工与 IPC 通信

> **目标**：读完本文档，你能清楚回答三个问题：
> 1. 主进程、渲染进程、Preload 脚本各是干什么的？
> 2. 渲染进程为什么不能直接调用 Node.js API？
> 3. 主进程和渲染进程怎么安全地通信？

---

## 一、Electron 三进程模型（极简版）

Electron 应用有三个"运行环境"，它们之间有明确的分工：

```
┌─────────────────────────────────────────────────────────────────┐
│                         主进程 (Main Process)                     │
│  • 运行环境：Node.js                                             │
│  • 职责：创建窗口、管理应用生命周期、操作文件系统、调用系统 API      │
│  • 数量：整个应用只有一个主进程                                    │
│  • 能做什么：fs.readFile、os.platform、创建 BrowserWindow        │
│  • 不能做什么：渲染 UI（没有 DOM）                                │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               │ 创建窗口时加载 Preload 脚本
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Preload 脚本 (Preload Script)                │
│  • 运行环境：特殊的渲染进程（有 DOM，也有有限的 Node.js API）        │
│  • 职责：作为"翻译官"，安全地把主进程的能力暴露给渲染进程            │
│  • 关键点：这是主进程和渲染进程之间的唯一桥梁                        │
│  • 安全要求：contextIsolation: true（隔离上下文，防止恶意代码注入）  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               │ 通过 contextBridge.exposeInMainWorld
                               │ 把 API 挂载到 window 对象上
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                       渲染进程 (Renderer Process)                  │
│  • 运行环境：Chromium 浏览器（和你用 Chrome 一样）                  │
│  • 职责：渲染 UI、响应用户交互、执行业务逻辑                         │
│  • 数量：每个窗口一个渲染进程                                       │
│  • 能做什么：React 渲染、DOM 操作、fetch 请求                      │
│  • 不能做什么：直接访问 fs、path、os 等 Node.js 模块                │
│  • 访问主进程能力的唯一方式：通过 Preload 暴露的 window.electronAPI  │
└─────────────────────────────────────────────────────────────────┘
```

### 为什么要这样设计？

**安全原因**。渲染进程运行的是网页代码（包括用户可能加载的第三方内容），如果它能直接访问 `fs.writeFile`，一个恶意网页就能删掉你的硬盘文件。所以 Electron 用 `contextIsolation` 把渲染进程和 Node.js 隔离开，只允许通过 Preload 脚本"审批通过"的 API 通信。

---

## 二、三进程代码对应关系

| 进程 | 入口文件 | 代码位置 | 配置位置 |
|------|---------|---------|---------|
| 主进程 | `electron/main.ts` | `src/main/` | `package.json` 的 `main` 字段 |
| Preload | `electron/preload.ts` | `electron/preload.ts` | `BrowserWindow.webPreferences.preload` |
| 渲染进程 | `src/renderer/main.tsx` | `src/renderer/` | Vite 的 `build.rollupOptions.input` |

---

## 三、主进程（Main Process）

### 3.1 最小可运行代码

```typescript
// electron/main.ts
import { app, BrowserWindow } from 'electron';
import path from 'path';

// 保持全局引用，防止垃圾回收导致窗口消失
let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    // 无边框窗口（我们自己用 React 画标题栏）
    frame: false,
    webPreferences: {
      // 【安全】启用上下文隔离，渲染进程无法直接访问 Node.js
      contextIsolation: true,
      // 【安全】禁用 nodeIntegration，渲染进程不能用 require('fs')
      nodeIntegration: false,
      // 【关键】指定 Preload 脚本路径
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // 加载渲染进程页面（Vite 开发服务器或打包后的文件）
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

// Electron 初始化完成时创建窗口
app.whenReady().then(() => {
  createWindow();
  // 注册 IPC 处理器（见下文 3.3 节）
  registerIpcHandlers();
});

// macOS：点击 Dock 图标时重新创建窗口
app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

// 所有窗口关闭时退出应用（Windows/Linux）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

### 3.2 主进程职责清单（v1 版本）

| 职责 | 说明 | 对应代码 |
|------|------|---------|
| 创建窗口 | 配置窗口尺寸、标题栏、Preload 脚本 | `createWindow()` |
| 注册 IPC 处理器 | 接收渲染进程的请求，执行后返回结果 | `registerIpcHandlers()` |
| 文件系统读写 | Session 数据、用户设置的持久化 | `src/main/services/fileService.ts` |
| 路径管理 | 返回应用数据目录路径给渲染进程 | `app.getPath('userData')` |

### 3.3 IPC 处理器注册

```typescript
// src/main/ipc/register.ts
import { ipcMain } from 'electron';
import { handleSessionCreate, handleSessionSave } from './handlers/session.handlers';
import { handleFileRead, handleFileWrite } from './handlers/file.handlers';

export function registerIpcHandlers(): void {
  // Session 相关
  ipcMain.handle('session:create', handleSessionCreate);
  ipcMain.handle('session:save', handleSessionSave);

  // 文件相关
  ipcMain.handle('file:read', handleFileRead);
  ipcMain.handle('file:write', handleFileWrite);
}
```

### 3.4 文件服务（主进程核心）

```typescript
// src/main/services/fileService.ts
import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';

// 应用数据目录：
// Windows: C:\Users\<用户名>\AppData\Roaming\ainvest\sessions\
// macOS: ~/Library/Application Support/ainvest/sessions/
// Linux: ~/.config/ainvest/sessions/
const USER_DATA_DIR = path.join(app.getPath('userData'), 'ainvest');
const SESSIONS_DIR = path.join(USER_DATA_DIR, 'sessions');

/**
 * 确保目录存在，不存在则创建
 */
async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

/**
 * 读取 JSON 文件
 * @param relativePath 相对于 USER_DATA_DIR 的路径
 * @returns 解析后的 JSON 数据
 */
export async function readJsonFile<T>(relativePath: string): Promise<T | null> {
  const fullPath = path.join(USER_DATA_DIR, relativePath);
  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * 写入 JSON 文件
 * @param relativePath 相对于 USER_DATA_DIR 的路径
 * @param data 要写入的数据
 */
export async function writeJsonFile(relativePath: string, data: unknown): Promise<void> {
  const fullPath = path.join(USER_DATA_DIR, relativePath);
  await ensureDir(path.dirname(fullPath));
  await fs.writeFile(fullPath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 列出目录下的所有文件名
 */
export async function listFiles(dir: string): Promise<string[]> {
  const fullPath = path.join(USER_DATA_DIR, dir);
  await ensureDir(fullPath);
  return fs.readdir(fullPath);
}
```

---

## 四、Preload 脚本（Preload Script）

### 4.1 核心概念

Preload 脚本是**唯一一个能同时访问 DOM 和 Node.js API 的文件**。它的任务就是：

1. 用 `contextBridge.exposeInMainWorld` 把主进程的能力"翻译"成渲染进程能安全调用的 API
2. 只暴露**最小必要**的 API，遵循最小权限原则
3. 所有暴露的函数都应该是**类型安全的**

### 4.2 最小可运行代码

```typescript
// electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

// ============================================================
// 定义暴露给渲染进程的 API 接口（TypeScript 类型安全）
// ============================================================

export interface ElectronAPI {
  // Session 相关 IPC
  createSession: (name: string) => Promise<{ success: boolean; data?: SessionMeta; error?: string }>;
  saveSessionMessages: (sessionId: string, messages: ChatMessage[]) => Promise<{ success: boolean; error?: string }>;
  loadSessionMessages: (sessionId: string) => Promise<{ success: boolean; data?: ChatMessage[]; error?: string }>;
  listSessions: () => Promise<{ success: boolean; data?: SessionMeta[]; error?: string }>;

  // 偏好设置 IPC（localStorage 不够用的时候用）
  getPreference: () => Promise<{ success: boolean; data?: UserPreference; error?: string }>;
  setPreference: (prefs: UserPreference) => Promise<{ success: boolean; error?: string }>;

  // 窗口控制（无边框窗口需要）
  windowControl: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
  };
}

// ============================================================
// 通过 contextBridge 暴露 API
// 注意：第一个参数 'electronAPI' 是挂载到 window 上的属性名
// 渲染进程通过 window.electronAPI 访问这些函数
// ============================================================

contextBridge.exposeInMainWorld('electronAPI', {
  // Session IPC
  createSession: (name: string) =>
    ipcRenderer.invoke('session:create', { name }),

  saveSessionMessages: (sessionId: string, messages: ChatMessage[]) =>
    ipcRenderer.invoke('session:save', { sessionId, messages }),

  loadSessionMessages: (sessionId: string) =>
    ipcRenderer.invoke('session:load', { sessionId }),

  listSessions: () =>
    ipcRenderer.invoke('session:list'),

  // 偏好设置 IPC
  getPreference: () =>
    ipcRenderer.invoke('preference:get'),

  setPreference: (prefs: UserPreference) =>
    ipcRenderer.invoke('preference:set', prefs),

  // 窗口控制
  windowControl: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
} as ElectronAPI);
```

### 4.3 渲染进程中如何声明类型

```typescript
// src/renderer/types/electron.d.ts
// 这个文件告诉 TypeScript：window 对象上有一个 electronAPI 属性

declare global {
  interface Window {
    electronAPI: import('../../../electron/preload').ElectronAPI;
  }
}

export {};
```

然后在渲染进程代码中就可以安全使用了：

```typescript
// src/renderer/services/persistence/ipcFileService.ts
async function saveSessionToDisk(sessionId: string, messages: ChatMessage[]): Promise<void> {
  // TypeScript 知道 window.electronAPI 的类型，会有代码提示和类型检查
  const result = await window.electronAPI.saveSessionMessages(sessionId, messages);
  if (!result.success) {
    throw new Error(result.error || '保存失败');
  }
}
```

---

## 五、IPC 通信规范

### 5.1 两种 IPC 模式

Electron 提供两种 IPC 通信模式，v1 统一使用 **invoke/handle** 模式：

| 模式 | 发送方 | 接收方 | 是否有返回值 | 适用场景 |
|------|--------|--------|-------------|---------|
| `invoke` / `handle` | 渲染进程 | 主进程 | ✅ 有 | 请求-响应模式（如读取文件） |
| `send` / `on` | 双向 | 双向 | ❌ 无 | 单向通知（如窗口控制命令） |

**为什么不用 `send`/`on` 做请求响应？**

因为 `send`/`on` 没有内置的 Promise 机制，需要自己维护回调 ID，容易出错。`invoke`/`handle` 返回 Promise，更符合现代异步编程习惯。

### 5.2 IPC 通道命名规范

所有通道名必须遵循 `domain:action` 格式：

```
session:create      # Session 领域：创建
session:save        # Session 领域：保存消息
session:load        # Session 领域：加载消息
session:list        # Session 领域：列出所有 Session
session:delete      # Session 领域：删除
file:read           # 文件领域：读取
file:write          # 文件领域：写入
file:delete         # 文件领域：删除
preference:get      # 偏好设置领域：获取
preference:set      # 偏好设置领域：设置
window:minimize     # 窗口领域：最小化
window:maximize     # 窗口领域：最大化
window:close        # 窗口领域：关闭
```

### 5.3 IPC 返回值规范

所有 IPC 调用必须返回统一格式的结果对象：

```typescript
// shared/types/ipc.ts

/**
 * IPC 调用的标准响应格式
 * 主进程的所有 handle 函数都必须返回这个结构
 */
export interface IpcResponse<T = unknown> {
  success: boolean;   // true = 成功，false = 失败
  data?: T;           // 成功时的返回数据
  error?: string;     // 失败时的错误信息（给用户看的）
}
```

**示例**：

```typescript
// 主进程处理器
async function handleSessionCreate(
  _event: Electron.IpcMainInvokeEvent,
  { name }: { name: string }
): Promise<IpcResponse<SessionMeta>> {
  try {
    const session = await createSessionFile(name);
    return { success: true, data: session };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// 渲染进程调用
const result = await window.electronAPI.createSession('白酒研究');
if (result.success) {
  console.log('创建成功:', result.data);
} else {
  console.error('创建失败:', result.error);
}
```

### 5.4 完整的 IPC 通道定义（v1 版本）

```typescript
// shared/types/ipc.ts

import type { SessionMeta, ChatMessage, UserPreference } from './index';

// ============================================================
// IPC 通道定义表
// 这个文件是"契约"：主进程和渲染进程都要遵守
// 新增 IPC 时，必须在这里先定义，再实现
// ============================================================

export interface IpcChannelMap {
  // ─── Session 管理 ───
  'session:create': {
    request: { name: string };
    response: IpcResponse<SessionMeta>;
  };
  'session:list': {
    request: Record<string, never>; // 空对象，表示无参数
    response: IpcResponse<SessionMeta[]>;
  };
  'session:load': {
    request: { sessionId: string };
    response: IpcResponse<ChatMessage[]>;
  };
  'session:save': {
    request: { sessionId: string; messages: ChatMessage[] };
    response: IpcResponse<null>;
  };
  'session:delete': {
    request: { sessionId: string };
    response: IpcResponse<null>;
  };
  'session:rename': {
    request: { sessionId: string; newName: string };
    response: IpcResponse<null>;
  };

  // ─── 偏好设置 ───
  'preference:get': {
    request: Record<string, never>;
    response: IpcResponse<UserPreference>;
  };
  'preference:set': {
    request: UserPreference;
    response: IpcResponse<null>;
  };

  // ─── 窗口控制（单向，无返回值）───
  'window:minimize': {
    request: void;
    response: void;
  };
  'window:maximize': {
    request: void;
    response: void;
  };
  'window:close': {
    request: void;
    response: void;
  };
}

/**
 * IPC 响应包装类型
 */
export interface IpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
```

---

## 六、TypeScript 类型安全工具

为了确保 IPC 调用在编译期就有类型检查，我们提供一个类型安全的包装函数：

```typescript
// src/renderer/utils/ipcClient.ts

import type { IpcChannelMap } from '@shared/types/ipc';

/**
 * 类型安全的 IPC 调用函数
 * @param channel IPC 通道名
 * @param payload 请求参数
 * @returns Promise<响应数据>
 *
 * 使用示例：
 * const result = await ipcInvoke('session:create', { name: '白酒研究' });
 */
export async function ipcInvoke<K extends keyof IpcChannelMap>(
  channel: K,
  ...payload: IpcChannelMap[K]['request'] extends Record<string, never>
    ? []
    : [IpcChannelMap[K]['request']]
): Promise<IpcChannelMap[K]['response']> {
  // @ts-expect-error Electron API 是运行时注入的
  return window.electronAPI[channel](...payload);
}
```

---

## 七、安全 checklist

开发过程中，每次修改 IPC 相关代码时，检查以下事项：

- [ ] Preload 脚本只暴露最小必要的 API
- [ ] 所有 `ipcMain.handle` 都有 try-catch，不会崩溃主进程
- [ ] 所有 IPC 返回值都符合 `IpcResponse<T>` 格式
- [ ] 通道名符合 `domain:action` 命名规范
- [ ] 主进程不直接操作渲染进程的 DOM
- [ ] 渲染进程不直接调用 `require('fs')` 等 Node.js 模块

---

> **下一步**：阅读 `03-state-management.md`，理解 Zustand Store 的设计和接口定义。
