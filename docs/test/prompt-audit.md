# Prompt 审计报告

> 审计时间：2026-06-06
> 审计范围：src/renderer/services/agent/ 及 LLM 调用链
> 审计目的：梳理所有 prompt，为评测集和优化提供基线

---

## 一、Prompt 清单总览

| # | Prompt 名称 | 位置 | 调用方 | Token 消耗 | 风险等级 |
|---|------------|------|--------|-----------|---------|
| 1 | `buildSystemPrompt` | `agent/prompts.ts:11` | AgentEngine | 中（~200 tokens） | 中 |
| 2 | `buildIntentPrompt` | `agent/prompts.ts:57` | 未实际使用 | 低 | 低 |
| 3 | `classifyIntentLLM` inline prompt | `agent/intentClassifier.ts:70` | classifyIntent | 低（~150 tokens） | 高 |
| 4 | `extractToolArgs` promptMap | `agent/agentEngine.ts:108-117` | runAgentTurn | 低（~80 tokens/次） | 高 |

---

## 二、逐 Prompt 审计

### Prompt 1：System Prompt（对话回复）

**位置**：`src/renderer/services/agent/prompts.ts:11`

**当前内容**：
```
你是一个专业的投资研究助手，名叫 AInvest Agent。

你可以帮助用户完成以下任务：
1. 查询股票行情（价格、涨跌幅、成交量、PE、PB 等）
2. 搜索与股票或行业相关的新闻
3. 对投资策略进行历史回测
4. 查看个股基本面档案

请用中文回答，保持专业、简洁、准确。如果不确定用户意图，可以礼貌询问澄清。
```

**问题**：
1. 没有明确说明 Agent 的能力边界（"我不知道" vs "我应该调用工具"）
2. 没有引导模型在需要时主动调用工具
3. 没有 tone/风格约束（过于通用）
4. 缺少 few-shot 示例

**建议优化方向**：
- 加入 "当用户问题涉及行情/新闻/回测/档案时，请等待工具结果后再回答"
- 加入输出格式约束（markdown/表格使用规范）
- 加入 "不确定时先澄清，不编造数据" 的约束

---

### Prompt 2：意图识别 Prompt（LLM 分类）

**位置**：`src/renderer/services/agent/intentClassifier.ts:70`

**当前内容**：
```
你是一个意图分类助手。请将用户输入分类到以下类型之一，并以 JSON 格式返回。

可选类型：
- market.query: 查询股票行情、价格、涨跌幅等
- news.search: 搜索股票或行业新闻
- strategy.backtest: 策略回测
- stock.profile: 个股基本面档案
- session.manage: 对话管理（新建/切换/删除）
- preference.update: 更新用户偏好
- general.chat: 闲聊、问候、投资咨询等
- unknown: 无法识别

要求返回格式（不要加 markdown 代码块标记）：
{"intent": "类型", "confidence": 0.9}

用户输入："${text}"
```

**问题**：
1. 缺少 few-shot 示例（模型对模糊意图分类不准）
2. `general.chat` 和 `unknown` 的边界不清晰
3. 没有说明 "投资咨询" 到底走 `general.chat` 还是 `market.query`
4. 未使用 `buildIntentPrompt()` 函数（代码中有定义但未调用，prompt 与 prompts.ts 中的定义重复）

**建议优化方向**：
- 加入 3-5 个 few-shot 示例
- 明确 "涉及具体股票代码的行情问题" → `market.query`
- 明确 "宏观/概念性问题" → `general.chat`

---

### Prompt 3：工具参数提取 Prompt

**位置**：`src/renderer/services/agent/agentEngine.ts:108-117`

**当前内容**（以 market.query 为例）：
```
从用户输入中提取股票代码（如 600519、AAPL）。只返回 JSON 格式：{"symbol": "股票代码"}
```

**问题**：
1. 没有处理 "用户没说股票代码" 的情况（应返回明确的 error/empty）
2. 没有 few-shot
3. 正则提取更高效（但当前用 LLM 也可以接受）
4. 参数缺失时返回 `{}`，导致工具执行时提示"请提供股票代码"，体验不好

**建议优化方向**：
- 加入 "如果找不到对应参数，返回 {"symbol": ""} 并在 symbol 为空时说明原因"
- 或改用本地正则提取（更高效、更可控）

---

## 三、Prompt 设计规范建议

1. **统一收口**：所有 prompt 统一放在 `prompts.ts`，不要在业务代码中 inline
2. **版本化**：prompt 变更需记录 diff，便于 A/B 测试
3. **few-shot 必备**：分类/提取类 prompt 至少 3 个示例
4. **输出格式约束**：明确要求 "不要加 markdown 代码块"、"只返回纯 JSON"
5. **Token 预算**：每个 prompt 标注预估 token 数，控制总成本

---

## 四、后续行动

- [ ] 重写 System Prompt，加入能力边界和输出约束
- [ ] 重写意图识别 Prompt，加入 few-shot 示例
- [ ] 统一 prompt 到 `prompts.ts`，删除 inline prompt
- [ ] 建立 prompt 版本变更日志
