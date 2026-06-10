# AInvest Agent v5 技术架构文档

> 版本：v5.0.0
> 日期：2026-06-10
> 对应 PRD：`docs/prd/v5-prd.md`

---

## 一、架构总览

v5 在 v4 基础上新增两个核心模块：

```
渲染进程 (Renderer)
  ├─ UI 层（不变）
  ├─ Zustand Stores
  │   ├─ useChatStore
  │   ├─ useSessionStore
  │   ├─ usePreferenceStore
  │   ├─ useMemoryStore（重构：新增向量检索接口）
  │   └─ useVectorMemoryStore（NEW：向量记忆状态）
  ├─ 服务层
  │   ├─ llm/（不变）
  │   ├─ agent/
  │   │   ├─ agentEngine.ts（改：集成记忆检索）
  │   │   ├─ intentClassifier.ts（改：新增 shell.execute 意图）
  │   │   ├─ prompts.ts（改：System Prompt 注入相关记忆）
  │   │   └─ memoryExtractor.ts（NEW：对话 → 记忆片段）
  │   ├─ tools/
  │   │   ├─ registry.ts（不变）
  │   │   ├─ shell.ts（NEW：Shell 执行工具）
  │   │   └─ ...（其他工具不变）
  │   └─ memory/
  │       ├─ vectorStore.ts（NEW：向量数据库封装）
  │       ├─ embeddingService.ts（NEW：文本 → 向量）
  │       └─ memoryArchive.ts（NEW：归档/去重/清理）
  └─ features/
      └─ settings/
          └─ MemoryManager.tsx（NEW：记忆管理页面）

主进程 (Main)
  ├─ ipcHandlers/
  │   ├─ persistence.ts（不变）
  │   └─ shell.ts（NEW：shell.execute IPC）
  └─ services/
      └─ shellExecutor.ts（NEW：child_process 封装）

Preload
  └─ 新增 shellAPI 暴露
```

---

## 二、模块技术选型

### 2.1 Shell 执行模块

#### 方案对比

| 维度 | 方案 A：child_process.spawn（推荐） | 方案 B：Node-pty | 方案 C：WASM Shell |
|------|-----------------------------------|-----------------|-----------------|
| **实现复杂度** | 低 | 中 | 高 |
| **交互能力** | 一次性执行，非交互式 | 支持交互式（如 vim） | 有限 |
| **安全风险** | 可控（白名单 + 超时） | 较高（伪终端权限大） | 低（沙箱） |
| **跨平台** | 好（spawn 原生支持） | 需平台适配 | 好 |
| **体积影响** | 0（Node.js 内置） | +~2MB | +~5MB |

**推荐：方案 A** — `child_process.spawn`。我们的场景不需要交互式 shell（如 vim、repl），一次性执行命令 + 捕获 stdout/stderr 足够覆盖 95% 的投研场景。

#### IPC 设计

```typescript
// Preload 暴露
interface ShellAPI {
  execute: (options: {
    command: string
    args: string[]
    cwd?: string
    timeout?: number
  }) => Promise<{
    stdout: string
    stderr: string
    exitCode: number
    killed: boolean
  }>
}

// 主进程 IPC handler
ipcMain.handle('shell:execute', async (_event, options) => {
  // 1. 白名单校验
  // 2. 危险命令检测
  // 3. spawn 执行
  // 4. 超时处理
  // 5. 输出截断
})
```

#### 安全规范

```typescript
// 命令白名单
const ALLOWED_COMMANDS = new Set([
  'python', 'python3', 'node', 'npm',
  'curl', 'git',
  'ls', 'dir', 'cat', 'type', 'find', 'grep',
])

// 危险模式检测（正则）
const DANGEROUS_PATTERNS = [
  /rm\s+-rf/i,
  />\s*\//,        // 重定向到根目录
  /sudo/i,
  /format/i,
  /del\s+\//i,
  /rd\s+\//i,
]

// 执行约束
const CONSTRAINTS = {
  maxOutputLength: 5000,    // 单输出上限
  maxExecutionTime: 30000,  // 30 秒超时
  allowedCwdPrefix: '/ainvest/workspace/', // 工作目录限制
}
```

---

### 2.2 语义记忆系统

#### 2.2.1 向量数据库选型

| 维度 | 方案 A：Vectra（推荐） | 方案 B：SQLite + sqlite-vss | 方案 C：纯内存 HNSW |
|------|----------------------|---------------------------|------------------|
| **实现复杂度** | 低（纯 TS，零原生依赖） | 中（需原生模块编译） | 低（自研或轻量库） |
| **持久化** | 自动序列化到 JSON | SQLite 原生持久化 | 需手动实现 |
| **检索性能** | 好（HNSW 索引） | 好（VSS 索引） | 中等 |
| **体积影响** | +~50KB | +~5MB（含 SQLite） | +~20KB |
| **Electron 兼容性** | 完美 | 需处理原生模块打包 | 完美 |

**推荐：方案 A — Vectra**
- 理由：纯 TypeScript 实现，零原生依赖，与 Electron 打包完美兼容
- 存储：自动序列化为 JSON 文件到 `userData/ainvest/vector-memory/`
- 索引：内置 HNSW，支持 cosine similarity

#### 2.2.2 Embedding 模型选型

| 维度 | 方案 A：transformers.js + all-MiniLM（推荐） | 方案 B：调用 Kimi Embedding API | 方案 C：本地 ollama embedding |
|------|------------------------------------------|-------------------------------|----------------------------|
| **网络依赖** | 无（首次下载后本地运行） | 有（必须联网） | 无（需本地 ollama 服务） |
| **成本** | 0 | 按 token 计费 | 0 |
| **延迟** | ~100-300ms（CPU） | ~200-500ms（网络往返） | ~50-200ms |
| **体积** | +~20MB（模型文件） | 0 | 0（外部依赖） |
| **隐私** | 完全本地 | 文本上传至第三方 | 完全本地 |

**推荐：方案 A — transformers.js**
- 理由：完全离线，保护隐私，适合桌面应用
- 模型：`Xenova/all-MiniLM-L6-v2`（384 维向量，轻量，中文可用）
- 首次使用自动下载模型到 `userData/.cache/transformers/`
- 备选：如果打包体积敏感，可降级为方案 B（Kimi API）

#### 2.2.3 记忆提取策略

```typescript
// 归档 Prompt 设计
const MEMORY_EXTRACTION_PROMPT = `你是记忆提取专家。请从以下对话中提取关键记忆片段。

要求：
1. 每条记忆必须包含：content（内容）、category（stock/market/strategy/preference/general）、importance（1-5）
2. importance 判断标准：
   - 5：用户明确的投资决策、仓位信息、重大观点
   - 4：用户关注的股票/板块、明确的投资偏好
   - 3：用户询问过的具体数据、分析结论
   - 2：一般的行业讨论、市场观点
   - 1：寒暄、闲聊、无关内容（不应提取）
3. 去重：如果同一主题已出现，只保留最重要的一条
4. 语言：保持与用户对话相同的语言

返回 JSON 数组格式：
[{"content": "...", "category": "stock", "importance": 4}]`
```

#### 2.2.4 记忆注入 Prompt 设计

```typescript
// System Prompt 中相关记忆字段
interface SystemPromptContext {
  userPreferences: UserMemory      // 原有显式偏好
  relatedMemories: string[]        // NEW：语义检索得到的 Top-K 记忆
}

// Prompt 模板片段
const MEMORY_SECTION = (memories: string[]) =>
  memories.length > 0
    ? `\n[相关历史记忆]\n${memories.map((m, i) => `${i + 1}. ${m}`).join('\n')}\n`
    : ''
```

---

## 三、数据模型

### 3.1 新增类型定义

```typescript
// src/shared/types/memory.ts

/** 记忆片段 */
export interface MemoryFragment {
  id: string
  content: string
  category: 'stock' | 'market' | 'strategy' | 'preference' | 'general'
  importance: 1 | 2 | 3 | 4 | 5
  sourceSessionId: string
  createdAt: string
  lastAccessedAt: string
  accessCount: number
}

/** 向量存储条目 */
export interface VectorRecord {
  id: string
  vector: number[]
  metadata: Omit<MemoryFragment, 'id'>
}

/** Shell 执行选项 */
export interface ShellExecuteOptions {
  command: string
  args: string[]
  cwd?: string
  timeout?: number
}

/** Shell 执行结果 */
export interface ShellExecuteResult {
  stdout: string
  stderr: string
  exitCode: number
  killed: boolean
  executionTimeMs: number
}

/** Shell 执行确认请求 */
export interface ShellConfirmRequest {
  command: string
  args: string[]
  reason: string  // 为什么需要确认（匹配到的危险模式）
}
```

### 3.2 存储文件组织

```
userData/ainvest/
  ├─ memory.json              # 原有显式偏好（不变）
  ├─ sessions/                # Session 数据（不变）
  ├─ workspace/               # NEW：Shell 执行工作目录
  └─ vector-memory/
      ├─ index.json           # Vectra 索引文件
      └─ data/                # 向量数据分片
```

---

## 四、IPC 通信规范（新增）

| Channel | 方向 | 参数 | 返回 | 说明 |
|---------|------|------|------|------|
| `shell:execute` | Renderer → Main | `ShellExecuteOptions` | `ShellExecuteResult` | 执行 shell 命令 |
| `shell:confirm` | Main → Renderer | `ShellConfirmRequest` | `boolean` | 危险命令确认（同步弹窗） |

---

## 五、关键流程时序

### 5.1 Shell 执行流程

```
用户输入"运行 test.py"
  ↓
AgentEngine 识别意图 → shell.execute
  ↓
extractToolArgs → { command: "python", args: ["test.py"] }
  ↓
tools/shell.ts 调用 window.shell.execute(options)
  ↓
Preload IPC → main:shell:execute
  ↓
主进程 shellExecutor.ts
  ├─ 白名单检查（python ✅）
  ├─ 危险模式检查（无）
  ├─ spawn('python', ['test.py'], { cwd: '.../workspace' })
  ├─ 30 秒超时监听
  └─ 输出截断（5000 字符）
  ↓
结果回传 → AgentEngine → LLM 生成回复
```

### 5.2 记忆归档流程

```
Session 结束（用户新建 Session / 关闭应用）
  ↓
useSessionStore 监听到 currentSessionId 变化
  ↓
触发 memoryArchive.archiveSession(sessionId)
  ↓
1. 获取该 Session 完整对话历史
2. 调用 LLM（memoryExtractor.ts）提取记忆片段
3. 每条记忆调用 embeddingService.generate(content) → vector
4. 存入 vectra.add({ id, vector, metadata })
5. Vectra 自动持久化到 disk
```

### 5.3 记忆检索流程

```
用户输入"之前那家电池公司"
  ↓
AgentEngine 准备 System Prompt 时
  ↓
调用 useVectorMemoryStore.search(userInput, { topK: 5, minScore: 0.7 })
  ↓
1. embeddingService.generate("之前那家电池公司") → queryVector
2. vectra.query(queryVector, { topK: 5, minScore: 0.7 })
3. 返回 [{ content: "用户关注宁德时代 Q2 财报...", score: 0.89 }, ...]
  ↓
将相关记忆注入 System Prompt
  ↓
LLM 生成回复（自然关联到宁德时代）
```

---

## 六、安全规范

### 6.1 Shell 执行安全

1. **命令白名单**：只允许预定义的安全命令，未知命令直接拒绝
2. **路径限制**：`cwd` 必须落在 `userData/ainvest/workspace/` 内，禁止访问系统目录
3. **危险命令确认**：匹配危险正则的命令必须弹出用户确认对话框
4. **超时终止**：所有命令强制 30 秒超时
5. **输出截断**：防止内存溢出，stdout/stderr 各限制 5000 字符
6. **禁止后台进程**：命令执行完成后必须清理所有子进程

### 6.2 记忆系统安全

1. **数据不出境**：Embedding 模型本地运行，不向外部 API 发送用户对话
2. **存储加密**：向量数据库文件仅本地存储，不上传云端
3. **敏感信息过滤**：归档前通过正则检测并替换敏感信息（API Key、密码等）

---

## 七、风险与回退方案

| 风险 | 影响 | 回退方案 |
|------|------|---------|
| transformers.js 模型下载失败 | Embedding 无法生成 | 降级为调用 Kimi Embedding API（需用户配置） |
| Vectra 索引损坏 | 语义检索失效 | 重建索引（从 memory.json 重新 embedding） |
| Shell 执行超时频繁 | 用户体验差 | 调整超时时间或引导用户优化脚本 |
| LLM 提取记忆质量差 | 记忆不准确 | 提供用户手动审核归档内容的入口 |
| 打包体积膨胀 (+20MB) | 安装包变大 | 将 embedding 模型改为按需下载，不打入安装包 |

---

## 八、开发顺序建议

```
Phase 1：Shell 执行（~1 周）
  ├─ 主进程 shellExecutor + IPC
  ├─ Preload shellAPI
  ├─ tools/shell.ts
  ├─ 安全机制（白名单 + 确认 + 超时）
  └─ workspace 目录管理

Phase 2：向量记忆底座（~1 周）
  ├─ 集成 Vectra
  ��─ 集成 transformers.js
  ├─ embeddingService.ts
  └─ vectorStore.ts

Phase 3：自动归档（~1 周）
  ├─ memoryExtractor.ts（LLM 提取）
  ├─ memoryArchive.ts（去重 + 存储）
  └─ Session 结束触发归档

Phase 4：语义检索集成（~1 周）
  ├─ AgentEngine 集成记忆检索
  ├─ System Prompt 注入相关记忆
  ├─ MemoryManager UI 页面
  └─ 过期清理策略
```
