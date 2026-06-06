# AInvest v3.0.0 开发 - 审核 - 测试流程

> 版本：v3.0.0
> 日期：2026-06-06
> 状态：已完成
> 依据：`docs/prd/v3-prd.md` + `docs/arch/v3-ux-observability.md`

---

## 一、总体策略

### 1.1 分阶段串行开发

v3 功能存在明确的依赖链，采用 **Phase 串行 + Module 内串行** 策略。每个 Phase 完成后必须经过 Reviewer 审核和回归测试，方可进入下一阶段。

```
Phase 1 基础设施层
    ↓ [Reviewer 审核 + 回归测试通过]
Phase 2 核心功能层
    ↓ [Reviewer 审核 + 回归测试通过]
Phase 3 交互增强层
    ↓ [Reviewer 审核 + 回归测试通过]
Phase 4 评测与收尾
    ↓ [最终验收]
v3.0.0 发布
```

### 1.2 人员分工

| 角色 | 职责 | 介入时机 |
|------|------|---------|
| **Developer** | 按 Module 实现代码，自测通过后提交 Review | 每个 Module 开始时 |
| **Reviewer** | 执行 Code Review，输出 Review 报告，标记 BLOCKER | Developer 提交后 |
| **Team Lead** | 协调资源、确认流程节点、最终验收 | 每个 Phase 结束、项目收尾 |

---

## 二、Phase 划分与依赖关系

### Phase 1：基础设施层（底层依赖）

**目标**：为上层功能打好数据基础，确保无 regression。

| Module | 说明 | 依赖 | 预估工时 |
|--------|------|------|---------|
| M1.1 Prompt 统一收口 | 将 inline prompt 迁移到 `prompts.ts` | 无 | 2h |
| M1.2 Logger 增强 | 敏感字段过滤 + 事件订阅机制 | 无 | 2h |

**关键交付物**：
- `src/renderer/services/agent/prompts.ts`（统一收口）
- `src/renderer/services/logger/logger.ts`（事件订阅 + 脱敏）

**验收标准**：
- [ ] `run-intent-eval.ts` 通过率 ≥ 94.3%（无 regression）
- [ ] `run-e2e-eval.ts` 通过率 ≥ 86.7%（无 regression）
- [ ] TypeScript 编译零报错
- [ ] logger 事件订阅可正常注册回调

---

### Phase 2：核心功能层（P0 功能）

**目标**：实现 v3 最核心的三个功能。

| Module | 说明 | 依赖 | 预估工时 |
|--------|------|------|---------|
| M2.1 Thinking 块 | useThinkingStore + ThinkingBlock + agentEngine 集成 | M1.1, M1.2 | 4h |
| M2.2 DevTool 面板 | AgentLogPanel + 快捷键 + logger 事件消费 | M1.2 | 3h |
| M2.3 自动命名 | SessionStore 扩展 + generateSessionName + ChatInput 触发 | 无 | 2h |

**串行顺序**：M2.1 → M2.2 → M2.3
- M2.1 优先：agentEngine 的回调注入点一旦确定，DevTool 的日志来源也明确
- M2.2 次之：依赖 logger 事件订阅机制
- M2.3 最后：相对独立，但放在核心层末尾

**关键交付物**：
- `src/renderer/stores/useThinkingStore.ts`
- `src/renderer/features/chat/ThinkingBlock.tsx`
- `src/renderer/features/devtools/AgentLogPanel.tsx`
- `src/renderer/stores/useSessionStore.ts`（扩展）

**验收标准**：
- [ ] Thinking 块出现延迟 < 200ms
- [ ] Thinking 步骤更新延迟 < 100ms
- [ ] DevTool 面板唤起延迟 < 100ms
- [ ] 自动命名处理延迟 < 50ms
- [ ] DevTool 仅 `import.meta.env.DEV` 环境可用
- [ ] logger 敏感字段过滤生效（人工验证 API Key 被替换为 `[REDACTED]`）

---

### Phase 3：交互增强层（P1 功能）

**目标**：提升新用户体验和输入效率。

| Module | 说明 | 依赖 | 预估工时 |
|--------|------|------|---------|
| M3.1 快捷工具按钮 | quickTools.ts + QuickTools.tsx + ChatInput 占位符定位 | 无 | 2h |
| M3.2 推荐问话卡片 | suggestions.ts + SuggestionCards.tsx | 无 | 2h |

**串行顺序**：M3.1 → M3.2（或并行，如资源允许）

**关键交付物**：
- `src/shared/constants/quickTools.ts`
- `src/renderer/features/chat/QuickTools.tsx`
- `src/shared/constants/suggestions.ts`
- `src/renderer/features/chat/SuggestionCards.tsx`

**验收标准**：
- [ ] 4 个快捷工具按钮正常展示和填充
- [ ] 占位符被自动选中（光标定位）
- [ ] 空 Session 时展示推荐卡片（4 个）
- [ ] 点击推荐卡片直接发送，发送后卡片消失

---

### Phase 4：评测与收尾

**目标**：评测脚本完善 + 前端优化 + 最终验收。

| Module | 说明 | 依赖 | 预估工时 |
|--------|------|------|---------|
| M4.1 LLM 意图评测脚本 | `test/eval/run-intent-llm-eval.ts` | M1.1 | 2h |
| M4.2 背景优化 | tailwind.config.js 色值调整（等设计） | 无 | 待定 |
| M4.3 智能助手头像 | MessageItem.tsx 头像接入（等设计） | 无 | 待定 |

**注意**：M4.2 和 M4.3 为 P2，设计资源到位后再实施。M4.1 可在 Phase 2 结束后并行启动。

---

## 三、审核流程（Reviewer）

### 3.1 触发条件

Reviewer 在以下时机被调用：
1. Developer 完成一个 Module 的开发并自测通过
2. Developer 向 Reviewer 提交 Review 请求（附带变更说明和自测结果）

### 3.2 审核步骤

```
Developer 提交 Review 请求
    ↓
Reviewer 执行：
  1. 读取对应 Module 的 PRD 章节，确认需求覆盖度
  2. 读取架构文档，确认技术规范符合度
  3. 逐文件审查变更（git diff）
  4. 运行 TypeScript 编译检查
  5. 运行 ESLint 检查
  6. 检查关键逻辑分支和边界 case
    ↓
Reviewer 输出 Review 报告（docs/reviews/）
  - [BLOCKER] 必须修复
  - [WARNING] 建议修复
  - [SUGGESTION] 可选优化
    ↓
Developer 修复所有 [BLOCKER]
    ↓
Reviewer 确认修复，标记 "Review 通过"
    ↓
进入下一 Module / Phase
```

### 3.3 每个 Module 的 Reviewer 重点

| Module | Reviewer 重点检查项 |
|--------|-------------------|
| M1.1 Prompt 收口 | prompt 迁移后内容一字未改；`intentClassifier.ts` 和 `agentEngine.ts` 无 inline prompt；评测集通过率无 regression |
| M1.2 Logger 增强 | `SENSITIVE_KEYS` 覆盖 `apiKey`、`authorization`；事件订阅机制无内存泄漏；导出 JSON 同样经过过滤 |
| M2.1 Thinking 块 | Store 独立不与消息列表耦合；`React.memo` 使用；步骤更新粒度按 step 而非全数组重设；非工具意图跳过工具步骤 |
| M2.2 DevTool 面板 | `import.meta.env.DEV` 判断正确；快捷键事件监听正确清理；面板非模态不影响左侧交互；实时同步用事件订阅而非轮询 |
| M2.3 自动命名 | 按字符（`Array.from`）截取而非 byte；`isCustomNamed` 正确标记；仅触发一次逻辑正确 |
| M3.1 快捷工具 | 常量文件配置；不直接发送；占位符定位逻辑边界 case（无占位符时行为） |
| M3.2 推荐问话 | `messages.length === 0` 判断正确；点击后卡片消失；非空 Session 不展示 |

---

## 四、测试流程

### 4.1 三级测试

| 级别 | 执行者 | 时机 | 内容 |
|------|--------|------|------|
| **单元自测** | Developer | 每个 Module 完成后 | TypeScript 编译 + ESLint + 功能自测 |
| **回归测试** | Reviewer | 每个 Phase 结束后 | `run-intent-eval.ts` + `run-e2e-eval.ts` |
| **集成验收** | Team Lead | 全部 Phase 完成后 | 完整功能走查 + 性能指标验证 |

### 4.2 回归测试基线

| 指标 | 基线值 | 允许波动 |
|------|--------|---------|
| 意图识别评测集通过率 | ≥ 94.3% | 下降 > 5% 阻断合并 |
| E2E 评测集通过率 | ≥ 86.7% | 下降 > 5% 阻断合并 |
| TypeScript 编译 | 零报错 | 不允许警告 |
| ESLint | 零错误 | 警告需评估 |

### 4.3 性能指标验证

| 指标 | 阈值 | 验证方式 |
|------|------|---------|
| Thinking 块出现延迟 | < 200ms | 人工计时 / 浏览器 Performance |
| 步骤更新延迟 | < 100ms | 肉眼观察 + 代码审查 |
| DevTool 面板唤起延迟 | < 100ms | 人工计时 |
| 自动命名处理延迟 | < 50ms | 纯本地操作，肉眼无感知即可 |
| 快捷工具填充延迟 | < 50ms | 纯本地操作，肉眼无感知即可 |

---

## 五、风险与应对

| 风险 | 阶段 | 等级 | 应对 |
|------|------|------|------|
| Prompt 迁移引入 regression | Phase 1 | 中 | 迁移前后跑评测集对比，Reviewer 重点审核 |
| Thinking 块状态管理导致全列表重渲染 | Phase 2 | 中 | 独立 Store + React.memo，Reviewer 性能专项 |
| DevTool 快捷键系统冲突 | Phase 2 | 中 | 备选方案 `Ctrl+Shift+D` |
| logger 敏感字段过滤遗漏 | Phase 2 | 中 | Reviewer 安全专项 + 人工验证 |
| 自动命名混排文本截断异常 | Phase 2 | 低 | 按字符截取 + 边界 case 测试 |
| 设计资源未到位 | Phase 4 | 低 | M4.2/M4.3 延后到 v3.1.0 |

---

## 六、执行 Checklist

### Phase 1 启动前
- [ ] PRD 已评审通过
- [ ] 技术文档已确认
- [ ] developer.md 和 reviewer.md 已更新
- [ ] 基线评测集已跑通（记录当前通过率）

### 每个 Module 启动前
- [ ] 前置 Module 已完成并通过 Review
- [ ] Developer 已阅读对应 PRD 章节和架构文档章节

### 每个 Module 完成后
- [ ] Developer 自测通过（TypeScript + ESLint + 功能）
- [ ] Developer 提交 Review 请求
- [ ] Reviewer 输出初版报告（24h 内）
- [ ] Developer 修复所有 BLOCKER
- [ ] Reviewer 确认修复并标记通过

### Phase 完成后
- [ ] 运行回归测试（intent-eval + e2e-eval）
- [ ] 记录通过率并与基线对比
- [ ] Team Lead 确认进入下一阶段

---

*文档版本：v1.0*
*最后更新：2026-06-06*
