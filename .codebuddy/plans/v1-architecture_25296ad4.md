---
name: v1-architecture
overview: 基于 PRD v1 设计完整技术架构文档，细化到模块接口定义，面向初级开发者。
todos:
  - id: design-directory
    content: 设计项目目录结构与模块边界，编写全局架构总览和 Electron 进程分工文档
    status: completed
  - id: ipc-preload
    content: 编写 IPC 通道定义、Preload 脚本 API 暴露规范与安全约束文档
    status: completed
    dependencies:
      - design-directory
  - id: state-persistence
    content: 编写 Zustand Store 接口定义与持久化层读写接口文档
    status: completed
    dependencies:
      - design-directory
  - id: mock-services
    content: 编写 Mock 服务层接口定义与工具调用框架文档
    status: completed
    dependencies:
      - design-directory
  - id: market-panel
    content: 编写行情看板模块技术文档（组件架构、视图切换、个股联动机制）
    status: completed
    dependencies:
      - state-persistence
      - mock-services
  - id: chat-session
    content: 编写聊天面板、Session 管理、快捷指令模块技术文档
    status: completed
    dependencies:
      - state-persistence
      - mock-services
  - id: sequencing-decisions
    content: 编写关键交互时序图，汇总多方案对比分析与待决策事项清单
    status: completed
    dependencies:
      - ipc-preload
      - state-persistence
      - mock-services
      - market-panel
      - chat-session
---

## 产品概述

基于已完成的 PRD v1，将现有 `docs/tech-architecture.md` 草稿升级为**详细的技术架构文档**。目标读者是初级开发人员，需要把架构讲明白、接口定义写清楚，让大家拿到文档就能开工。

## 核心要求

- 细化到每个功能模块的接口定义（IPC、Zustand Store、Mock 服务、React 组件 Props、持久化层）
- 包含完整的项目目录结构、Electron 进程分工、模块边界
- 包含关键交互时序图（个股联动、Session 切换、工具调用等）
- **多方案比对**：对关键架构决策点提供 2+ 方案，给出优劣分析，交由用户最终决策
- 保持与 PRD 的一致性，不引入 PRD 未要求的技术

## 技术栈（PRD 已确定）

| 层级 | 技术选型 | 说明 |
| --- | --- | --- |
| 桌面框架 | Electron (v42+) | 主进程 + 渲染进程 + Preload 脚本 |
| 前端框架 | React 18 + TypeScript | 函数式组件 + Hooks |
| 构建工具 | Vite | 快速开发与构建 |
| 状态管理 | Zustand | PRD 已确定，轻量、无样板代码 |
| 样式方案 | Tailwind CSS | 推荐（需用户确认）或 CSS Modules |
| 代码规范 | ESLint + Prettier | 已有草稿规划 |


## 实现策略

1. **文档组织**：保留 `docs/tech-architecture.md` 作为总览目录，按模块拆分为 `docs/arch/*.md` 子文档，避免单文件过大
2. **接口定义风格**：所有接口使用 TypeScript 风格描述（interface、type、函数签名），配以中文注释
3. **渐进式细化**：先写全局架构与目录结构，再逐个模块深入接口定义
4. **Mock 优先**：v1 全部使用 Mock，架构需预留真实 API 替换的扩展点

## 关键架构决策点（多方案比对）

### 决策点 1：Mock 工具层执行位置

- **方案 A（渲染进程直接调用）**：Mock 函数放在 `src/renderer/services/mock/` 中，组件直接 import 调用。优势：简单直接、无 IPC 开销、调试方便。劣势：不符合真实 Electron 架构，后续接入真实 API 需大面积重构。
- **方案 B（主进程代理）**：Mock 逻辑放在 `src/main/services/mock/` 中，通过 IPC 调用。优势：与真实架构一致，后续替换为真实 API 只需改主进程实现。劣势：Mock 阶段增加 IPC 开销，调试链路变长。

### 决策点 2：行情看板 ↔ 聊天面板联动通信方式

- **方案 A（Zustand 全局状态）**：新增 `useMarketStore` 或扩展现有 Store，聊天面板点击个股链接时更新全局状态，行情看板订阅该状态自动切换。优势：与现有状态管理一致、可追踪、可持久化。劣势：两个本可独立的模块产生 Store 耦合。
- **方案 B（EventEmitter 事件总线）**：渲染进程内维护一个轻量 EventBus，聊天面板 emit，行情看板 on。优势：完全解耦、代码清晰。劣势：事件流难以追踪调试，与 Zustand 数据流割裂。

### 决策点 3：行情看板状态管理归属

- **方案 A（独立 useMarketStore）**：行情视图状态（当前是总览/个股、当前个股代码）由独立 Store 管理。优势：职责清晰、与 Session 解耦。劣势：Session 切换时需额外同步行情状态。
- **方案 B（并入 useSessionStore）**：每个 Session 记录其对应的行情看板状态。优势：切换 Session 时状态自然恢复。劣势：Session Store 膨胀，行情看板与 Session 强耦合。

### 决策点 4：持久化文件组织方式

- **方案 A（每 Session 独立 JSON 文件）**：PRD 草稿方案，`sessions/{sessionId}.json`。优势：单文件不会膨胀、便于手动备份单个 Session。劣势：文件数量多、批量操作（如列出所有 Session）需读取多个文件。
- **方案 B（单文件 + 索引）**：所有 Session 元数据存在一个 `index.json`，聊天记录仍分文件。优势：批量操作快、结构清晰。劣势：index.json 需额外维护一致性。

### 决策点 5：个股链接识别与渲染方案

- **方案 A（前端正则解析）**：Agent 返回纯文本，聊天组件用正则 `【(.+?)】` 匹配股票名称/代码，渲染为可点击链接。优势：实现简单、Agent 无需改动。劣势：识别准确率有限、难以支持复杂格式。
- **方案 B（Agent 返回结构化标记）**：Agent 返回 Markdown 或自定义 JSON 标记（如 `<stock symbol="600519.SH">贵州茅台</stock>`），聊天组件按结构化数据渲染。优势：准确可靠、可扩展性强。劣势：需修改 Agent 输出格式、组件渲染逻辑变复杂。

## 目录结构规划（新建/更新文件）

```
docs/
├── tech-architecture.md          # [MODIFY] 全局架构总览目录
├── arch/
│   ├── 01-overview.md            # [NEW] 项目目录结构与模块边界
│   ├── 02-electron-process.md    # [NEW] Electron 主/渲染/Preload 分工 + IPC 定义
│   ├── 03-state-management.md    # [NEW] Zustand Store 接口定义
│   ├── 04-mock-services.md       # [NEW] Mock 服务层与工具调用框架
│   ├── 05-market-panel.md        # [NEW] 行情看板模块（组件 + 联动机制）
│   ├── 06-chat-panel.md          # [NEW] 聊天面板模块（消息渲染 + 快捷指令）
│   ├── 07-session-management.md  # [NEW] Session 管理模块
│   ├── 08-persistence.md         # [NEW] 持久化层接口定义
│   └── 09-sequencing.md          # [NEW] 关键交互时序图 + 决策汇总
src/                              # [NEW] 项目源码骨架目录（按架构文档创建）
```

## 关键代码结构预览（示意）

### IPC 通道定义

```typescript
// shared/types/ipc.ts
interface IpcChannels {
  'session:create': { name: string } => SessionMeta;
  'session:list': {} => SessionMeta[];
  'session:loadMessages': { sessionId: string } => ChatMessage[];
  'session:saveMessages': { sessionId: string; messages: ChatMessage[] } => void;
  'preference:get': {} => UserPreference;
  'preference:set': { key: string; value: unknown } => void;
}
```

### Zustand Store 接口

```typescript
// stores/useSessionStore.ts
interface SessionState {
  sessions: SessionMeta[];
  currentSessionId: string | null;
  actions: {
    createSession: (name: string) => void;
    switchSession: (id: string) => void;
    renameSession: (id: string, name: string) => void;
    deleteSession: (id: string) => void;
  };
}
```