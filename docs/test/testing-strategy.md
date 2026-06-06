# AInvest Agent 测试策略方案

> 基于 Harness AI 方法论 + 产品实际测试需求
> 版本：v1.0
> 日期：2026-06-06

---

## 一、Harness AI 核心原则

1. **模型无关性**：测试框架应能切换不同 LLM（GLM / Kimi / GPT），结果可对比
2. **确定性评估**：每个测试用例有明确 Expected / Actual，可自动判 Pass/Fail
3. **分层测试**：单元测试 → 集成测试 → E2E 测试 → 人工验收
4. **可观测性**：每个 Agent 决策节点必须有日志可追溯
5. **回归测试**：prompt 变更后自动跑全量评测集，防止 regression

---

## 二、测试维度矩阵

| 维度 | 测试内容 | 自动化 | 工具 |
|------|---------|--------|------|
| **意图识别** | 用户输入 → 意图分类准确率 | 是 | 评测集 + 脚本 |
| **工具调用** | 意图 → 参数提取 → 工具执行 | 是 | 评测集 + 脚本 |
| **Prompt 效果** | 不同 prompt 版本的回复质量对比 | 半自动 | LLM-as-judge |
| **数据流** | 输入 → 意图 → 工具 → LLM → 输出的全链路 | 是 | 日志 + 回放 |
| **UI 交互** | 三栏布局、Session 管理、设置页 | 是 | Playwright |
| **性能** | 首 token 延迟、流式渲染帧率 | 是 | 性能测试脚本 |
| **鲁棒性** | 异常输入、网络断开、API 失败 | 是 | 混沌测试 |

---

## 三、需求 1：运行时日志系统（Observability）

### 3.1 日志分级

```
LOG_LEVEL=debug | info | warn | error
```

### 3.2 日志事件类型

| Event ID | 事件名称 | 字段 | 用途 |
|----------|---------|------|------|
| `agent.turn.start` | 对话回合开始 | sessionId, userInput, timestamp | 追踪完整对话流 |
| `intent.classify` | 意图识别 | method(local/llm), intent, confidence, latency_ms | 评估意图准确率 |
| `tool.extract_args` | 参数提取 | intent, rawInput, extractedArgs, success | 评估参数提取 |
| `tool.execute` | 工具执行 | toolName, args, result, latency_ms | 追踪工具调用 |
| `llm.request` | LLM 请求 | model, messages_count, temperature, token_estimate | 成本追踪 |
| `llm.chunk` | 流式 chunk | chunk_index, content_length, latency_ms | 性能追踪 |
| `llm.response` | LLM 完整响应 | total_tokens, finish_reason, latency_ms | 成本/性能 |
| `agent.turn.end` | 对话回合结束 | sessionId, finalResponse, error | 回合总结 |

### 3.3 日志输出方式

- **开发环境**：Console + 本地 JSON 文件（`userData/ainvest/logs/`）
- **测试环境**：结构化 JSON 日志，便于脚本解析
- **生产环境**：按需上报（ Electron 环境下可写入本地文件）

### 3.4 日志查看界面（DevTool 面板）

在设置页或独立 DevTool 面板中增加 "Agent 日志" Tab：
- 树形展示每个对话回合的事件流
- 点击展开查看完整请求/响应内容
- 支持按事件类型过滤
- 支持导出 JSON

---

## 四、需求 2：评测集（Evaluation Dataset）

### 4.1 评测集结构

```json
{
  "version": "1.0",
  "tests": [
    {
      "id": "intent-001",
      "category": "intent",
      "input": "茅台今天多少钱",
      "expected_intent": "market.query",
      "expected_entities": { "symbol": "600519" },
      "tags": ["行情", "中文", "简称"]
    },
    {
      "id": "e2e-001",
      "category": "e2e",
      "input": "帮我查一下五粮液的新闻",
      "expected_intent": "news.search",
      "expected_contains": ["五粮液", "新闻"],
      "tags": ["新闻", "中文", "工具调用"]
    }
  ]
}
```

### 4.2 评测维度

#### A. 意图识别评测（Intent Classification）
- **指标**：准确率（Accuracy）、Top-1 命中率
- **阈值**：≥ 80%
- **测试集**：50+ 条覆盖 8 种意图的用例
- **判分**：LLM 输出 intent 与 expected_intent 完全一致 = Pass

#### B. 参数提取评测（Entity Extraction）
- **指标**：字段级准确率、召回率
- **阈值**：symbol 提取 ≥ 90%
- **测试集**：30+ 条含不同表述的用例
- **判分**：JSON 解析后关键字段匹配 = Pass

#### C. E2E 回复质量评测（Response Quality）
- **指标**：相关性、准确性、流畅性
- **阈值**：LLM-as-judge 评分 ≥ 4/5
- **测试集**：20+ 条端到端用例
- **判分**：用 GPT/GLM 作为裁判，对比 Expected 和 Actual

#### D. Prompt 回归评测（Prompt Regression）
- **指标**：同一评测集在不同 prompt 版本下的通过率变化
- **用途**：prompt 修改后自动跑，防止 regression
- **触发**：每次 prompt 变更时 CI 自动执行

### 4.3 评测集示例（初始 30 条）

| ID | 输入 | 期望意图 | 期望工具 | 备注 |
|----|------|---------|---------|------|
| IC-001 | 茅台今天多少钱 | market.query | symbol=600519 | 中文简称 |
| IC-002 | 600519 行情 | market.query | symbol=600519 | 直接代码 |
| IC-003 | AAPL 股价 | market.query | symbol=AAPL | 美股 |
| IC-004 | 搜一下茅台的新闻 | news.search | keyword=茅台 | 新闻搜索 |
| IC-005 | 最近有什么白酒行业新闻 | news.search | keyword=白酒 | 行业 |
| IC-006 | 回测一下趋势策略 | strategy.backtest | strategyName=趋势策略 | 策略回测 |
| IC-007 | 茅台公司是做什么的 | stock.profile | symbol=600519 | 基本面 |
| IC-008 | 你好 | general.chat | - | 闲聊 |
| IC-009 | 谢谢 | general.chat | - | 礼貌用语 |
| IC-010 | 新建对话 | session.manage | - | Session |
| IC-011 | 我比较保守 | preference.update | - | 偏好 |
| IC-012 | 今天天气怎么样 | general.chat | - | 无关问题 |
| IC-013 | 000858 跌了没有 | market.query | symbol=000858 | 涨跌 |
| IC-014 | 给我看看茅台的档案 | stock.profile | symbol=600519 | 档案 |
| IC-015 | 有什么投资建议 | general.chat | - | 模糊咨询 |
| ... | ... | ... | ... | ... |

---

## 五、测试基础设施

### 5.1 日志系统（Logger Service）

```typescript
// src/renderer/services/logger/logger.ts
export const logEvent = (event: LogEvent) => {
  // 1. console.log（开发环境）
  // 2. 写入 localStorage 环形缓冲区
  // 3. 导出到文件（通过 IPC）
}
```

### 5.2 评测脚本（Evaluator Script）

```typescript
// test/evaluator/intent-evaluator.ts
// 批量跑评测集，输出准确率报告
```

### 5.3 日志查看组件

```typescript
// src/renderer/features/devtools/AgentLogPanel.tsx
// DevTool 面板，展示 Agent 决策树
```

---

## 六、实施优先级

| 优先级 | 任务 | 负责人 | 估算 |
|--------|------|--------|------|
| P0 | 运行时日志系统（Logger + 事件定义） | Developer | 2h |
| P0 | 评测集初始 30 条 | Tester + PM | 2h |
| P0 | Prompt 审计 + 重写 System Prompt | Developer | 2h |
| P1 | 日志查看 DevTool 面板 | Developer | 3h |
| P1 | 评测脚本（自动化跑批） | Tester | 3h |
| P2 | LLM-as-judge 质量评估 | Tester | 4h |
| P2 | Playwright E2E 测试 | Tester | 4h |

---

## 七、下一步行动

1. **PM 确认**：评测集用例是否覆盖核心用户场景
2. **Developer 实施**：日志系统 + Prompt 重写
3. **Tester 实施**：评测集录入 + 评测脚本
4. **Review**：跑一轮评测，输出基线报告
