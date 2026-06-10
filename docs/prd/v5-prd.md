# AInvest Agent v5 PRD

> 版本：v5.0.0
> 日期：2026-06-10
> 状态：需求评审中
> 目标：从"聊天机器人"升级为"能执行命令、有语义记忆的 Agent"

---

## 一、产品概述

v5 在 v4 行情看板 + 视觉优化的基础上，聚焦**Agent 核心能力补全**：
1. **Shell 执行**：让 Agent 能跑本地脚本、执行系统命令，体现"CLI"定位
2. **语义记忆系统**：从"手动配置偏好"升级为"自动归档 + 向量语义检索"，让 Agent 真正"记得"用户

v5 不改 UI 布局，所有能力通过聊天面板自然语言驱动。

---

## 二、版本目标

**"Agent 能干活、有记性"**

---

## 三、用户故事

### US-501：我想让 Agent 帮我跑本地脚本
> 作为用户，当我输入"帮我用 Python 计算一下茅台过去 30 天的收益率"时，Agent 应该能在本地执行我写的 Python 脚本，并返回结果。

### US-502：我想让 Agent 执行简单的系统命令
> 作为用户，当我输入"查看一下当前目录下有哪些 CSV 文件"时，Agent 应该能执行 `ls *.csv`（或 Windows `dir *.csv`）并返回结果。

### US-503：Agent 执行命令前应该让我确认
> 作为用户，当 Agent 准备执行可能危险的命令（如删除文件、修改系统配置）时，应该弹出确认框让我审核，避免误操作。

### US-504：Agent 应该自动记住我们的对话内容
> 作为用户，当我和 Agent 聊了 20 轮关于半导体行业的分析后，3 天后我打开新 Session 问"之前那家电池公司怎么样"，Agent 应该能回忆起宁德时代，并关联之前的讨论。

### US-505：我想看到 Agent 记住了什么
> 作为用户，我希望能打开一个"记忆管理"页面，查看 Agent 自动归档的所有记忆片段，并可以手动删除不准确的记忆。

### US-506：Agent 的记忆应该能过期清理
> 作为用户，我不希望 Agent 永远记住 3 个月前的一次闲聊。系统应该自动清理 30 天未激活的低重要性记忆。

---

## 四、功能列表

### 4.1 Shell 执行工具（P0）

#### 4.1.1 Shell 命令执行
- **功能描述**：Agent 识别 `shell.execute` 意图，通过 IPC 调用主进程执行 shell 命令
- **支持命令白名单**：`python`、`node`、`curl`、`git`、`ls`/`dir`、`cat`/`type`、`find`、`grep`
- **参数**：
  - `command`: 主命令（如 `python`）
  - `args`: 参数数组（如 `['script.py', '600519']`）
  - `cwd`: 可选，工作目录（默认用户数据目录下的 `workspace/`）
- **返回**：stdout + stderr + exit code

#### 4.1.2 命令安全确认
- **自动触发条件**：命令包含敏感关键字（`rm`、`del`、`format`、`sudo`、`>` 重定向到系统路径）
- **交互方式**：渲染进程弹出确认对话框，用户点击"允许执行"后才继续
- **超时机制**：命令执行超过 30 秒自动终止
- **输出限制**：stdout/stderr 各限制 5000 字符，超出截断

#### 4.1.3 Workspace 目录管理
- **功能描述**：为 Shell 执行提供隔离的工作空间
- **路径**：`userData/ainvest/workspace/`
- **行为**：Agent 执行命令前确保目录存在；用户可通过设置页打开该目录

### 4.2 语义记忆系统（P1）

#### 4.2.0 "归档当前会话"按钮（原"总结今日偏好"改造）
- **位置**：Session 侧边栏底部
- **功能**：手动触发当前 Session 的完整归档流程（显式偏好 + 向量记忆）
- **状态展示**：
  - 有未归档消息时："归档当前会话（还有 N 条新消息）"
  - 全部已归档时："当前会话已归档 ✓"
- **Mock 价值**：让用户随时"模拟 Session 结束"，测试归档效果和记忆质量

#### 4.2.1 对话自动归档
- **触发时机**（三轨制）：
  1. **新建 Session**（主力，~90% 场景）：用户点击"+"新建对话时，自动归档当前 Session 的未归档消息
  2. **关闭应用**（兜底）：`app.before-quit` 时自动归档当前 Session
  3. **手动按钮**（辅助）：Session 侧边栏的"归档当前会话"按钮，用户可随时手动触发
- **增量归档机制**：
  - Session 元数据增加 `archivedMessageCount` 字段，记录已归档到第几条消息
  - 每次归档只处理**新增消息**（`messages.slice(archivedMessageCount)`）
  - 用户返回老 Session 继续聊后，下次归档仅处理增量部分
- **双轨提取策略**：
  - **显式偏好**（`UserMemory`）：用 Session **全部消息**重新提取，覆盖更新 `memory.json`。整段对话一起看，LLM 判断更准确
  - **向量记忆片段**（`MemoryFragment`）：只用**增量消息**提取，避免重复存储。每条包含：`content`、`category`（stock/market/strategy/preference/general）、`importance`（1-5）、`sourceSessionId`、`createdAt`
- **去重**：同一 Session 内向量相似度 > 0.95 的记忆自动跳过，0.8-0.95 的合并更新

#### 4.2.2 向量语义检索
- **触发时机**：每次用户输入后、Agent 生成回复前
- **检索流程**：
  1. 将用户输入转为向量（embedding）
  2. 在向量数据库中检索 Top-5 最相关记忆
  3. 将相关记忆注入 System Prompt 的 `related_memories` 字段
- **相关性阈值**：cosine similarity >= 0.7 才注入，避免无关记忆干扰

#### 4.2.3 记忆管理页面
- **入口**：设置页新增"记忆管理"标签
- **功能**：
  - 列表展示所有记忆片段（支持按 category / time / importance 筛选）
  - 单条删除
  - 批量清理（按时间范围、按 category）
  - 显示记忆总数量和占用存储

#### 4.2.4 记忆过期清理
- **自动策略**：
  - `importance <= 2` 的记忆：30 天无访问自动删除
  - `importance = 3` 的记忆：90 天无访问自动删除
  - `importance >= 4` 的记忆：永久保留（需用户手动删除）
- **清理时机**：应用启动时异步执行

---

## 五、验收标准

### 5.1 Shell 执行

| # | 验收项 | 通过标准 |
|---|--------|---------|
| 501 | 执行 Python 脚本 | 输入"帮我运行 workspace/test.py"，Agent 正确执行并返回脚本输出 |
| 502 | 执行系统命令 | 输入"查看 workspace 目录"，Agent 正确执行 `ls`/`dir` 并返回文件列表 |
| 503 | 危险命令拦截 | 输入"删除所有文件"，Agent 弹出确认对话框，不点确认则不执行 |
| 504 | 超时终止 | 输入一个死循环脚本，30 秒后 Agent 返回"命令执行超时" |
| 505 | 跨平台兼容 | Windows 和 macOS 都能正常执行对应平台的命令 |

### 5.2 语义记忆

| # | 验收项 | 通过标准 |
|---|--------|---------|
| 506 | 自动归档 | 结束一个关于"宁德时代财报"的 Session 后，记忆库中出现相关记忆片段 |
| 506a | 增量归档 | 返回老 Session 继续聊 5 轮后新建 Session，只新增 5 条记忆的向量，不重复归档旧记忆 |
| 506b | 手动归档按钮 | 点击"归档当前会话"按钮，正确归档并显示"已归档 N 条记忆" |
| 507 | 语义检索 | 新建 Session 输入"之前那家电池公司"，Agent 回复中提及宁德时代 |
| 508 | 记忆管理 | 用户能在设置页看到已归档记忆，并删除指定条目 |
| 509 | 过期清理 | 设置一条 importance=1 的记忆，30 天后自动消失 |
| 510 | 去重合并 | 同一 Session 内多次提及同一股票，只生成一条记忆 |

### 5.3 通用

- [ ] TypeScript 编译零错误
- [ ] ESLint src/ 零错误
- [ ] `npm run build` 成功
- [ ] 无新增依赖冲突

---

## 六、非功能需求

- **性能**：语义检索延迟 < 500ms（本地 embedding + 向量检索）
- **存储**：向量数据库 + 记忆文本，单用户上限 50MB
- **安全**：Shell 命令严格白名单 + 危险操作确认 + 超时终止
- **隐私**：所有记忆数据本地存储，不上传云端；Embedding 模型本地运行

---

## 七、MVP 范围

**v5.0 必须包含**：
- Shell 执行（白名单命令 + 安全确认 + 超时）
- 对话自动归档（LLM 提取记忆片段）
- 向量语义检索（embedding + Top-K 检索 + Prompt 注入）
- 记忆管理页面（查看 + 删除）

**v5.x 后续可补充**：
- 浏览器自动化（Puppeteer/CDP）
- 记忆过期清理的精细化策略
- 多模态记忆（截图、文件关联）

---

## 附录 A：v5.1 修订记录（2026-06-10）

> 本次修订记录 v5.1 对 v5.0 PRD 的变更点。v5.1 是一次**技术方案降级**（从本地模型降级为云端 API），产品功能不变，非功能需求有调整。

### A.1 变更背景

v5.0 原计划使用 `transformers.js` + ONNX Runtime WASM 在 Electron 渲染进程中本地运行 `Xenova/all-MiniLM-L6-v2` embedding 模型。实际开发中发现 ONNX Runtime WASM 在 Electron 环境下存在不可修复的 `protobuf parsing failed` 底层兼容性问题。经架构评审，决定复用已接入的智谱（BigModel）LLM API，改用其 `embedding-3` 云端服务。

### A.2 功能需求变更（无变更）

v5.1 **不修改任何产品功能需求**：
- Shell 执行（US-501 ~ US-503）：完全不变
- 语义记忆系统（US-504 ~ US-506）：完全不变
- 自动归档、语义检索、记忆管理、过期清理：行为不变

### A.3 非功能需求变更

| 条款 | v5.0 原文 | v5.1 修订后 |
|------|----------|------------|
| **性能** | 语义检索延迟 < 500ms（本地 embedding + 向量检索） | 语义检索延迟 < 800ms（HTTP API RTT + 向量检索） |
| **存储** | 向量数据库 + 记忆文本，单用户上限 50MB | 向量数据库 + 记忆文本，单用户上限 30MB（移除 40MB 模型文件） |
| **隐私** | 所有记忆数据本地存储，不上传云端；**Embedding 模型本地运行** | 记忆文本和向量数据仍本地存储；**Embedding 文本通过 HTTPS 上传至智谱 API**，但不上传对话上下文 |
| **成本** | 无 | 月均 < 1 元（0.5 元/百万 Tokens） |

### A.4 技术实现变更

| 模块 | v5.0 方案 | v5.1 方案 |
|------|----------|----------|
| Embedding 模型 | `Xenova/all-MiniLM-L6-v2`（本地 WASM） | `embedding-3`（智谱云端 API） |
| 向量维度 | 固定 384 维 | 可配置 256/512/1024/2048，**默认 512 维** |
| 依赖 | `@xenova/transformers` (~40MB) | 无新增依赖，复用 LLM 的 apiKey/baseUrl |
| 首响延迟 | 2-5s（WASM 编译+模型加载） | ~100-300ms（HTTP RTT） |
| 离线可用 | 是 | 否（但 LLM 已要求联网） |
| 多语言 | 英文为主 | **中英双语优化** |

### A.5 验收标准修订

**5.2 语义记忆 — 修订项：**

| # | 原验收项 | 修订内容 |
|---|---------|---------|
| 506 | 结束 Session 后记忆库出现片段 | **不变** |
| 506a | 增量归档 | **不变** |
| 506b | 手动归档按钮 | **不变** |
| 507 | 语义检索关联回复 | **不变** |
| 508 | 记忆管理 | **不变** |
| 509 | 过期清理 | **不变** |
| 510 | 去重合并 | **不变** |
| — | **新增 511** | **维度配置**：设置页可切换 256/512/1024/2048 维，切换后向量索引重建 |
| — | **新增 512** | **API 降级**：断开网络或填写错误 API Key，对话不中断，自动使用 fallback 伪向量 |

### A.6 开发计划修订

**Iteration 3（向量记忆底座）修订：**

- [x] ~~安装依赖：`@xenova/transformers`~~ → **移除**，不再安装
- [x] ~~`embeddingService.ts` 封装 `pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')`~~ → 改为封装智谱 `POST /embeddings` HTTP API
- [x] ~~向量维度 = 384~~ → 向量维度 = 512（可配置）
- [x] ~~首次加载模型时 UI 显示"正在初始化语义模型..."~~ → 移除，云端模型无需加载

**Iteration 7（集成测试）新增：**
- [ ] v5.1 数据迁移验证：旧 384 维索引自动重建为 512 维
- [ ] 设置页 Embedding 维度切换验证
- [ ] API 降级 fallback 验证

### A.7 风险表更新

| 风险 | v5.0 评估 | v5.1 评估 |
|------|----------|----------|
| transformers.js 在 Electron 渲染进程加载失败 | **中/高**（已发生） | **已解决**：移除 transformers.js，改用智谱 API |
| Embedding API 网络不稳定 | 无 | **中/高**：fallback 伪向量兜底 |
| 向量维度变更导致旧索引失效 | 无 | **高**：启动时自动检测并重建索引 |
| 成本超支 | 无 | **极低**：月均 < 1 元 |

---

## 附录 B：v5.1.1 修订记录（2026-06-11）

> v5.1.1 是一次**架构修复**：将 Vectra 向量数据库从渲染进程迁移到主进程，解决 `fs.promises.rm` 兼容性问题。产品功能不变。

### B.1 变更背景

v5.1 将 embedding 从本地 WASM 迁移到智谱云端 API 后，Vectra 向量数据库仍运行在 Electron 渲染进程中。Vite 对 Node.js `fs` 的 browser polyfill 缺失 `fs.promises.rm` 方法，导致 Vectra 初始化时报 `promises_1.default.rm is not a function`，向量记忆功能完全不可用。

### B.2 功能需求变更（无变更）

v5.1.1 **不修改任何产品功能需求**。所有用户可见行为与 v5.1 一致。

### B.3 技术实现变更

| 模块 | v5.1 方案 | v5.1.1 方案 |
|------|----------|------------|
| 向量存储进程 | 渲染进程（直接 `import { LocalIndex } from 'vectra'`） | **主进程**（直接使用 Node.js `fs`） |
| 渲染进程 vectorStore.ts | 直接操作 Vectra LocalIndex | **IPC 代理**（`window.memoryAPI.*`） |
| IPC 通道 | 无 memory 通道 | 新增 8 个 `memory:*` IPC 通道 |
| Preload 暴露 | `persistence`, `appAPI`, `shell` | 新增 `memoryAPI` |
| 互斥锁 | 渲染进程 Mutex | 主进程 Mutex（逻辑相同，进程不同） |
| 依赖 | `vectra` 在渲染进程 | `vectra` 仅在主进程 |

### B.4 新增文件

| 文件 | 说明 |
|------|------|
| `src/main/services/vectorStore.ts` | 主进程 Vectra 封装（含 Mutex） |
| `src/main/ipcHandlers/memory.ts` | 8 个 memory IPC handler（含参数校验） |
| `docs/tech/v5.1.1-vectra-main-process-migration.md` | v5.1.1 技术方案 |

### B.5 修改文件

| 文件 | 变更 |
|------|------|
| `src/main/index.ts` | 注册 `registerMemoryIPC()` |
| `src/preload/index.ts` | 新增 `MemoryAPI` 接口和 `memoryAPI` 对象 |
| `src/renderer/services/memory/vectorStore.ts` | 重写为 IPC 代理，移除 `import { LocalIndex } from 'vectra'` |
| `src/renderer/services/memory/memoryArchive.ts` | `getIndex()` 改为 `getVectorItem()` / `upsertVector()` |

### B.6 验收标准修订

无新增验收项。v5.1 的验收项 511（维度配置）和 512（API 降级）在 v5.1.1 下行为不变，但向量存储的可靠性显著提升。

### B.7 风险表更新

| 风险 | v5.1 评估 | v5.1.1 评估 |
|------|----------|------------|
| Vectra 渲染进程 `fs.promises.rm` 缺失 | **高**（已发生） | **已解决**：Vectra 迁移到主进程 |
| IPC 通信延迟 | 无 | **极低**：~5ms/次，用户无感知 |
| IPC 参数序列化失败 | 无 | **极低**：8 个 handler 均有参数校验 |

