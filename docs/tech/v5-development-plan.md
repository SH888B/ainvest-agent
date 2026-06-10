# AInvest Agent v5 开发计划

> 版本：v5.0.0
> 日期：2026-06-10
> 对应 PRD：`docs/prd/v5-prd.md`
> 对应架构：`docs/tech/v5-agent-core-upgrade.md`

---

## 开发原则

1. **小步快跑**：每个迭代 2-3 天，必须有可演示的产出
2. **端到端优先**：每个迭代交付完整链路，不只做底层不做 UI
3. **质量门**：每个迭代结束前必须 `tsc --noEmit` + `eslint` 零错误
4. **主干开发**：所有迭代在 `main` 分支直接开发，通过 feature flag 控制未完成的特性

---

## 迭代总览

```
Week 1
  ├─ Iteration 1 (2天): Shell 执行底座 + IPC
  ├─ Iteration 2 (2天): Shell 执行 UI 集成 + 安全弹窗
  └─ Iteration 3 (2天): 向量记忆底座（Vectra + transformers.js）

Week 2
  ├─ Iteration 4 (2天): 自动归档（增量归档 + 双轨提取）
  ├─ Iteration 5 (2天): 语义检索集成（AgentEngine + Prompt 注入）
  └─ Iteration 6 (2天): 记忆管理页面 + 过期清理

Week 3
  └─ Iteration 7 (1-2天): 集成测试 + Bug 修复 + 打包验证
```

---

## Iteration 1：Shell 执行底座（2 天）

### 目标
Agent 能执行本地命令，主进程侧能力全部就绪。

### 任务清单
- [ ] 安装依赖：`vectra`（提前安装，为 Iteration 3 做准备）
- [ ] 主进程 `src/main/services/shellExecutor.ts`
  - `child_process.spawn` 封装
  - stdout/stderr 流式拼接 + 截断（5000 字符）
  - 超时终止（30 秒）
- [ ] 主进程 `src/main/ipcHandlers/shell.ts`
  - `shell:execute` IPC handler
  - 命令白名单校验
  - 危险模式正则检测
- [ ] Preload `src/preload/index.ts`
  - 暴露 `window.shell.execute(options)`
- [ ] Workspace 目录管理
  - 应用启动时确保 `userData/ainvest/workspace/` 存在

### 验收标准
```bash
# 开发调试命令（在 Renderer DevTools 控制台执行）
await window.shell.execute({ command: 'node', args: ['-e', 'console.log(1+1)'] })
# 预期返回：{ stdout: '2\n', stderr: '', exitCode: 0, killed: false }
```

### 质量门
- [ ] `tsc --noEmit` 零错误
- [ ] `eslint src/` 零错误

---

## Iteration 2：Shell 执行 UI 集成（2 天）

### 目标
用户能在聊天面板中自然语言驱动 Shell 执行，看到结果卡片，危险命令有确认弹窗。

### 任务清单
- [ ] `src/renderer/services/tools/shell.ts`
  - 调用 `window.shell.execute`
  - 结果格式化（stdout/stderr 展示）
- [ ] `src/renderer/services/agent/intentClassifier.ts`
  - 新增 `shell.execute` 意图识别
  - 本地正则兜底
- [ ] `src/renderer/services/tools/registry.ts`
  - 注册 `shell.execute` 工具
- [ ] `src/renderer/features/chat/ChatPanel.tsx` 或 `MessageItem.tsx`
  - Shell 结果卡片组件（展示 stdout/stderr，代码块样式）
- [ ] `src/main/ipcHandlers/shell.ts`
  - 危险命令确认：`dialog.showMessageBoxSync`
- [ ] 工具调用流程打通
  - AgentEngine → intentClassifier 识别 shell.execute → extractToolArgs 提取参数 → executeTool 执行 → 结果回传 LLM → 生成回复

### 验收标准
| 场景 | 用户输入 | 预期行为 |
|------|---------|---------|
| 正常执行 | "运行 node -e console.log(1+1)" | Agent 执行，返回结果卡片显示 `2` |
| 危险拦截 | "删除所有文件" | 弹出确认对话框，不点确认不执行 |
| 超时终止 | "运行一个死循环脚本" | 30 秒后返回"命令执行超时" |
| 意图识别 | "帮我跑 workspace/test.py" | 正确识别 `shell.execute` 意图 |

### 质量门
- [ ] `tsc --noEmit` 零错误
- [ ] `eslint src/` 零错误
- [ ] 手动验收表全部通过

---

## Iteration 3：向量记忆底座（2 天）

### 目标
Embedding 模型能本地运行，Vectra 能存能查，向量记忆底座就绪。

### 任务清单
- [ ] 安装依赖：`@xenova/transformers`（embedding 模型）
- [ ] `src/renderer/services/memory/embeddingService.ts`
  - 封装 `pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')`
  - `generate(text: string): Promise<number[]>` → 384 维向量
  - 首次加载模型时 UI 显示"正在初始化语义模型..."
- [ ] `src/renderer/services/memory/vectorStore.ts`
  - 封装 Vectra
  - `add(record: VectorRecord)`
  - `query(vector: number[], options): Promise<QueryResult[]>`
  - 自动 JSON 持久化到 `userData/ainvest/vector-memory/`
- [ ] `src/shared/types/memory.ts`
  - `MemoryFragment`、`VectorRecord` 类型定义
- [ ] 独立调试页面（临时，迭代后移除或隐藏）
  - 输入文本 → 生成向量 → 存入 Vectra → 相似度检索

### 验收标准
```typescript
// 在 Renderer DevTools 中验证
const vector = await embeddingService.generate('宁德时代 Q2 财报超预期')
// vector.length === 384
// vector[0] 是 -1 到 1 之间的浮点数

await vectorStore.add({
  id: 'test-1',
  vector,
  metadata: { content: '宁德时代 Q2 财报超预期', category: 'stock', importance: 4, sourceSessionId: 's1', createdAt: '...' }
})

const results = await vectorStore.query(
  await embeddingService.generate('那家电池公司'),
  { topK: 5, minScore: 0.7 }
)
// results[0].metadata.content 包含 '宁德时代'
```

### 质量门
- [ ] `tsc --noEmit` 零错误
- [ ] `eslint src/` 零错误
- [ ] 向量维度 = 384
- [ ] 相似度检索能召回相关记忆

---

## Iteration 4：自动归档（2 天）

### 目标
Session 结束时自动提取记忆并存储，增量归档机制工作正常。

### 任务清单
- [ ] `src/renderer/services/agent/memoryExtractor.ts`
  - LLM Prompt：从对话中提取 `MemoryFragment[]`
  - `extractMemoryFragments(messages, config): Promise<MemoryFragment[]>`
- [ ] `src/renderer/services/memory/memoryArchive.ts`
  - `archiveSession(sessionId): Promise<void>`
  - 双轨提取：
    - 显式偏好：全量提取 → 合并到 `memory.json`
    - 向量记忆：增量提取 → embedding → Vectra 存储
  - 去重逻辑：similarity > 0.95 跳过，0.8-0.95 合并
- [ ] `src/renderer/stores/useSessionStore.ts`
  - `Session` 类型增加 `archivedMessageCount?: number`
  - 归档状态持久化到 `archive-state.json`
- [ ] 触发点实现
  - 新建 Session 时自动归档上一个 Session
  - 主进程 `app.before-quit` 归档当前 Session
- [ ] `src/renderer/features/session/SessionSidebar.tsx`
  - "总结今日偏好"按钮 → 改造为"归档当前会话"
  - 状态展示：未归档消息数 / 已归档状态

### 验收标准
| 场景 | 操作 | 预期结果 |
|------|------|---------|
| 自动归档 | 聊 10 轮后新建 Session | `vector-memory/index.json` 出现新记录 |
| 增量归档 | 返回老 Session 再聊 3 轮后新建 Session | 只新增 3 轮的记忆向量，不重复 |
| 手动归档 | 点击"归档当前会话" | 按钮变为"已归档 ✓"，toast 提示成功 |
| 去重 | 同一 Session 多次提到"茅台" | 只生成一条记忆 |
| 显式偏好 | 对话中提到"我比较激进" | `memory.json` 中 `riskPreference` 更新 |

### 质量门
- [ ] `tsc --noEmit` 零错误
- [ ] `eslint src/` 零错误
- [ ] 手动验收表全部通过

---

## Iteration 5：语义检索集成（2 天）

### 目标
新 Session 能自动检索历史记忆并注入 Prompt，Agent 回复能关联过去对话。

### 任务清单
- [ ] `src/renderer/services/memory/memoryArchive.ts`
  - `searchMemories(query: string): Promise<MemoryFragment[]>`
  - 用户输入 → embedding → Vectra 检索 → 返回 Top 5
- [ ] `src/renderer/services/agent/prompts.ts`
  - `buildSystemPrompt` 改造：注入 `relatedMemories`
  - 记忆 Section 模板：
    ```
    [相关历史记忆]
    1. 用户关注宁德时代 Q2 财报...
    2. 用户比较激进，偏好高风险...
    ```
- [ ] `src/renderer/services/agent/agentEngine.ts`
  - `runAgentTurn` 改造：
    - 准备 System Prompt 前，调用 `searchMemories(userInput)`
    - 将相关记忆注入 System Prompt
- [ ] `src/renderer/services/agent/intentClassifier.ts`
  - 可选：意图识别时也检索记忆（辅助理解指代）

### 验收标准
| 场景 | 用户输入 | 预期行为 |
|------|---------|---------|
| 语义关联 | 新 Session 问"之前那家电池公司" | Agent 回复提及宁德时代，关联之前讨论 |
| 偏好记忆 | 新 Session 问"推荐几只股票" | Agent 考虑用户激进风险偏好 |
| 阈值过滤 | 问"今天天气如何" | 不注入无关记忆，避免干扰 |

### 质量门
- [ ] `tsc --noEmit` 零错误
- [ ] `eslint src/` 零错误
- [ ] 语义检索延迟 < 500ms
- [ ] 手动验收表全部通过

---

## Iteration 6：记忆管理页面 + 过期清理（2 天）

### 目标
用户能在设置页查看、管理记忆，系统自动清理过期低重要性记忆。

### 任务清单
- [ ] `src/renderer/features/settings/MemoryManager.tsx`
  - 记忆列表（content、category、importance、createdAt）
  - 按 category / time / importance 筛选
  - 单条删除
  - 批量清理（按时间范围、按 category）
  - 显示记忆总数和存储占用
- [ ] `src/renderer/services/memory/memoryArchive.ts`
  - `deleteMemory(id)`
  - `cleanupExpired()`：按过期策略清理
    - importance <= 2：30 天未访问删除
    - importance = 3：90 天未访问删除
    - importance >= 4：永久保留
- [ ] `src/main/index.ts`
  - 应用启动时异步触发 `cleanupExpired`
- [ ] `src/renderer/features/settings/SettingsPage.tsx`
  - 新增"记忆管理"标签页入口

### 验收标准
| 场景 | 操作 | 预期结果 |
|------|------|---------|
| 查看记忆 | 打开设置 → 记忆管理 | 列表展示所有记忆片段 |
| 删除记忆 | 点击某条记忆的删除按钮 | 该记忆从列表和 Vectra 中移除 |
| 过期清理 | 手动创建一条 importance=1 的记忆，修改时间为 31 天前 | 应用重启后该记忆自动消失 |

### 质量门
- [ ] `tsc --noEmit` 零错误
- [ ] `eslint src/` 零错误
- [ ] UI 无卡顿（记忆列表 1000 条内流畅）

---

## Iteration 7：集成测试与收尾（1-2 天）

### 目标
全链路稳定，无回归问题，打包验证通过。

### 任务清单
- [ ] 全链路端到端测试
  - 新建 Session → 聊天 → 归档 → 新建 Session → 语义检索 → 关联回复
  - Shell 执行 → 结果展示 → 危险命令拦截
- [ ] 回归测试
  - v4 功能不受影响（行情看板、聊天、Session 管理）
- [ ] 性能测试
  - 语义检索延迟 < 500ms
  - 应用启动时间无明显增加
- [ ] 打包验证
  - `npm run build` 成功
  - `npm run dist` 成功（Windows nsis）
  - 安装包能正常运行，模型文件正确打包
- [ ] Bug 修复
- [ ] 代码清理
  - 移除 Iteration 3 的临时调试页面
  - 删除未使用的 import 和变量

### 验收标准
- [ ] PRD 验收表 5.1 + 5.2 全部通过
- [ ] `tsc --noEmit` 零错误
- [ ] `eslint src/` 零错误
- [ ] `npm run build` 成功
- [ ] 安装包可正常安装运行

---

## 风险与缓冲

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| transformers.js 在 Electron 渲染进程加载失败 | 中 | 高 | Iteration 3 预留 0.5 天调试；实在不行降级到 Kimi API |
| Vectra 大数据量时性能下降 | 低 | 中 | 监控检索延迟，>500ms 时考虑优化或迁移 |
| LLM 提取记忆质量不稳定 | 中 | 中 | 提供手动归档按钮让用户兜底；迭代优化 Prompt |
| Shell 执行跨平台差异 | 中 | 低 | Windows 优先，macOS 在 Iteration 7 验证 |

---

## 版本号规划

| 版本 | 对应迭代 | 说明 |
|------|---------|------|
| v5.0.0-alpha1 | Iteration 1 | Shell 执行底座 |
| v5.0.0-alpha2 | Iteration 2 | Shell 执行 UI 集成 |
| v5.0.0-beta1 | Iteration 3 | 向量记忆底座 |
| v5.0.0-beta2 | Iteration 4 | 自动归档 |
| v5.0.0-beta3 | Iteration 5 | 语义检索集成 |
| v5.0.0-rc1 | Iteration 6 | 记忆管理页面 |
| v5.0.0-rc2 | Iteration 7 | 集成测试与收尾 |
| **v5.0.0** | — | 正式发布 |

---

## 每日站会 Checklist（自管理）

每个 Iteration 内，每天结束时检查：
- [ ] 今天完成了什么？
- [ ] 遇到了什么阻塞？
- [ ] 明天计划做什么？
- [ ] 当前 Iteration 的验收标准还能按时达成吗？
