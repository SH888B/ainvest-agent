import { UserMemory } from '@shared/types'

/**
 * System Prompt 构建器
 * 根据用户偏好和当前状态构建系统提示词
 */

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
 * 构建意图识别 System Prompt
 */
export const buildIntentPrompt = (): string => {
  return `你是一个意图分类助手。请将用户输入分类到以下类型之一：

- market.query: 查询股票行情、价格、涨跌幅、成交量等
- news.search: 搜索与股票或行业相关的新闻
- strategy.backtest: 对投资策略进行历史回测
- stock.profile: 查询个股基本面档案
- general.chat: 闲聊、问候、一般性投资咨询（不触发工具）
- session.manage: 对话管理操作（新建/切换/删除/重命名对话）
- preference.update: 更新用户偏好（风险偏好、关注板块等）
- unknown: 无法识别的意图

请以 JSON 格式返回：{"intent": "类型", "confidence": 0.0-1.0}`
}
