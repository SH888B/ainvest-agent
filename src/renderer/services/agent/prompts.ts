import { UserMemory } from '@shared/types'

/**
 * Prompt 版本号
 * v3.0.0: 从 intentClassifier.ts 和 agentEngine.ts 迁移 inline prompt 到此处
 */
export const PROMPT_VERSION = 'v3.0.0'

/**
 * 构建基础 System Prompt
 */
export const buildSystemPrompt = (memory?: UserMemory): string => {
  const basePrompt = `你是一个专业的投资研究助手，名叫 AInvest Agent。

你可以帮助用户完成以下任务：
1. 查询股票行情（价格、涨跌幅、成交量、PE、PB 等）
2. 搜索与股票或行业相关的新闻
3. 对投资策略进行历史回测
4. 查看个股基本面档案

请用中文回答，保持专业、简洁、准确。如果不确定用户意图，可以礼貌询问澄清。`

  if (!memory) {
    return basePrompt
  }

  // 注入长期记忆
  const memoryParts: string[] = []

  if (memory.riskPreference) {
    memoryParts.push(`用户风险偏好：${memory.riskPreference}`)
  }

  if (memory.focusSectors && memory.focusSectors.length > 0) {
    memoryParts.push(`用户关注板块：${memory.focusSectors.join('、')}`)
  }

  if (memory.summary) {
    memoryParts.push(`用户画像摘要：${memory.summary}`)
  }

  if (memoryParts.length === 0) {
    return basePrompt
  }

  return `${basePrompt}

---
以下是你对当前用户的了解（基于历史对话提炼）：
${memoryParts.join('\n')}

请根据以上信息，在回答时尽量贴合用户的关注点和偏好风格。`
}

/**
 * 构建意图识别 Prompt
 * @param text 用户输入文本
 */
export const buildIntentPrompt = (text: string): string => {
  return `你是一个意图分类助手。请将用户输入分类到以下类型之一，并以 JSON 格式返回。

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

用户输入："${text}"`
}

// ===== 工具参数提取 Prompts =====

export const MARKET_QUERY_EXTRACTION_PROMPT =
  '从用户输入中提取股票代码（如 600519、AAPL）。只返回 JSON 格式：{"symbol": "股票代码"}'

export const NEWS_SEARCH_EXTRACTION_PROMPT =
  '从用户输入中提取搜索关键词。只返回 JSON 格式：{"keyword": "关键词", "limit": 5}'

export const STRATEGY_BACKTEST_EXTRACTION_PROMPT =
  '从用户输入中提取策略名称、股票代码、开始日期、结束日期。只返回 JSON 格式：{"strategyName": "策略名", "symbol": "代码", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD"}'

export const STOCK_PROFILE_EXTRACTION_PROMPT =
  '从用户输入中提取股票代码。只返回 JSON 格式：{"symbol": "股票代码"}'
