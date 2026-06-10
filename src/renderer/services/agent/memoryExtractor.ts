import { ChatMessage, LLMConfig } from '@shared/types'
import { MemoryFragment, MemoryCategory } from '../../../shared/types/memory'
import { logInfo, logError } from '../logger/logger'

/**
 * 记忆提取器
 * 调用 LLM 从对话历史中提取结构化的记忆片段
 */

const EXTRACTION_PROMPT = `你是一个对话记忆提取专家。请从以下对话历史中提取所有有价值的记忆片段。

提取规则：
1. 每条记忆必须是一个独立的、有价值的信息点
2. 内容要简洁准确，保留核心信息，控制在 50 字以内
3. 分类必须准确：
   - stock: 个股相关信息（某只股票的表现、财报、研报等）
   - market: 市场/板块信息（行业趋势、大盘走势、政策影响等）
   - strategy: 投资策略（用户提到的策略思路、回测结果、交易方法等）
   - preference: 用户偏好（风险偏好、投资风格、关注领域、个人需求等）
   - general: 其他一般性投资知识或信息
4. 重要性评分（1-5）：
   - 5: 核心偏好、关键决策依据
   - 4: 重要的个股/市场信息
   - 3: 一般性投资信息
   - 2: 次要细节
   - 1: 闲聊或无关紧要的内容
5. 不要提取重复信息，如果同一话题多次出现，只提取最完整的一条
6. 如果对话中没有有价值的信息，返回空数组 []

输出格式要求（必须严格遵守）：
- 只输出 JSON 数组，不要输出任何其他解释文字
- 可以包裹在 markdown 代码块 \`\`\`json 中，也可以直接输出纯 JSON
- 数组中的每个对象必须包含 content、category、importance 三个字段

示例输出：
[
  {
    "content": "用户偏好高风险高回报策略",
    "category": "preference",
    "importance": 5
  },
  {
    "content": "关注宁德时代和比亚迪",
    "category": "stock",
    "importance": 4
  }
]`

/**
 * 单条消息最大长度（字符数），防止 prompt 过长
 */
const MAX_MESSAGE_LENGTH = 500

/**
 * 对话历史最大消息数
 */
const MAX_HISTORY_MESSAGES = 20

/**
 * 从对话历史中提取记忆片段
 * @param messages 对话消息列表
 * @param config LLM 配置
 * @returns 记忆片段数组
 */
export const extractMemoryFragments = async (
  messages: ChatMessage[],
  config: LLMConfig
): Promise<MemoryFragment[]> => {
  if (messages.length === 0) return []

  // 只取 user 和 assistant 的消息，限制数量和长度
  const limitedMessages = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-MAX_HISTORY_MESSAGES) // 只取最近 20 条
    .map((m) => ({
      role: m.role === 'user' ? '用户' : '助手',
      // 截断过长内容，防止 prompt 过大和注入攻击
      content: m.content.slice(0, MAX_MESSAGE_LENGTH),
    }))

  // 使用 JSON 格式传递对话内容，避免字符串拼接导致的注入风险
  const dialoguePayload = JSON.stringify(limitedMessages, null, 2)

  logInfo('memory', 'extractor.start', {
    messageCount: limitedMessages.length,
    originalCount: messages.length,
  })

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: EXTRACTION_PROMPT },
          { role: 'user', content: `对话历史（JSON格式）：\n${dialoguePayload}\n\n请提取记忆片段：` },
        ],
        temperature: 0.2,
        max_tokens: 1500,
      }),
    })

    if (!response.ok) {
      throw new Error(`API 错误 ${response.status}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''
    const finishReason = data.choices?.[0]?.finish_reason || 'unknown'

    // 记录完整返回内容用于调试（DevTool 中可展开查看）
    logInfo('memory', 'extractor.rawResponse', {
      content: content.slice(0, 1000),
      finishReason,
      model: data.model || config.model,
      usage: data.usage || null,
    })

    let jsonText = ''

    // 策略1：尝试提取完整的 markdown 代码块中的 JSON
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim()
    } else {
      // 策略1.5：截断的代码块（finishReason=length 时，缺少闭合 ```）
      const truncatedCodeBlock = content.match(/```(?:json)?\s*([\s\S]+)/)
      if (truncatedCodeBlock) {
        jsonText = truncatedCodeBlock[1].trim()
        // 截断的 JSON 可能缺少闭合 ]，尝试补全
        if (!jsonText.endsWith(']')) {
          // 找到最后一个完整的 } 对象，截断并补 ]
          const lastBrace = jsonText.lastIndexOf('}')
          if (lastBrace > 0) {
            jsonText = jsonText.slice(0, lastBrace + 1) + '\n]'
          }
        }
      } else {
        // 策略2：尝试匹配纯 JSON 数组
        const jsonMatch = content.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          jsonText = jsonMatch[0].trim()
        }
      }
    }

    // 策略3：如果都没匹配到，尝试用兜底正则提取
    if (!jsonText) {
      logInfo('memory', 'extractor.noJsonMatch', { content: content.slice(0, 200) })
      // 兜底：基于关键词从所有用户消息中提取多条记忆
      const fallbacks = extractFallbackFragments(limitedMessages)
      if (fallbacks.length > 0) {
        logInfo('memory', 'extractor.fallbackUsed', { reason: 'noJsonMatch', count: fallbacks.length })
        return fallbacks
      }
      return []
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(jsonText)
    } catch (parseErr) {
      logInfo('memory', 'extractor.parseFailed', { jsonText: jsonText.slice(0, 200), error: String(parseErr) })
      const fallbacks = extractFallbackFragments(limitedMessages)
      if (fallbacks.length > 0) {
        logInfo('memory', 'extractor.fallbackUsed', { reason: 'jsonParseFailed', count: fallbacks.length })
        return fallbacks
      }
      return []
    }

    if (!Array.isArray(parsed)) {
      logInfo('memory', 'extractor.notArray', { parsed })
      return []
    }

    const fragments: MemoryFragment[] = parsed
      .filter((item: unknown) => {
        if (typeof item !== 'object' || item === null) return false
        const i = item as Record<string, unknown>
        return typeof i.content === 'string' && i.content.trim().length > 0
      })
      .map((item: unknown, index: number) => {
        const i = item as Record<string, unknown>
        const rawCategory = String(i.category || 'general').toLowerCase()
        const validCategories: MemoryCategory[] = ['stock', 'market', 'strategy', 'preference', 'general']
        const category = validCategories.includes(rawCategory as MemoryCategory)
          ? (rawCategory as MemoryCategory)
          : 'general'

        const rawImportance = Number(i.importance || 3)
        const importance = Math.max(1, Math.min(5, rawImportance)) as 1 | 2 | 3 | 4 | 5

        const now = new Date().toISOString()
        return {
          id: `frag-${Date.now()}-${index}`,
          content: String(i.content).trim().slice(0, 200),
          category,
          importance,
          sourceSessionId: '', // 由调用方填充
          createdAt: now,
          lastAccessedAt: now,
          accessCount: 0,
        }
      })

    logInfo('memory', 'extractor.complete', { extractedCount: fragments.length })
    return fragments
  } catch (err) {
    logError('memory', 'extractor.error', { error: String(err) })
    return []
  }
}

/**
 * 兜底提取：当 LLM 不返回有效 JSON 时，基于关键词从所有用户消息中提取记忆
 * v5.1.1: 从只取最后一条改为关键词匹配所有用户消息，提取多条记忆
 */
function extractFallbackFragment(
  messages: { role: string; content: string }[]
): MemoryFragment | null {
  // 保留旧接口兼容，但实际使用 multi 版本
  const fragments = extractFallbackFragments(messages)
  return fragments[0] || null
}

/**
 * 多条兜底提取：基于关键词从所有用户消息中提取记忆
 */
function extractFallbackFragments(
  messages: { role: string; content: string }[]
): MemoryFragment[] {
  const userMessages = messages.filter((m) => m.role === '用户').map((m) => m.content)
  if (userMessages.length === 0) return []

  const now = new Date().toISOString()
  const fragments: MemoryFragment[] = []

  // 关键词 → 分类/重要性映射
  const patterns: { regex: RegExp; category: MemoryCategory; importance: 1 | 2 | 3 | 4 | 5 }[] = [
    // 偏好类
    { regex: /激进|高风险|保守|稳健|风险偏好|投资风格/, category: 'preference', importance: 5 },
    // 个股类
    { regex: /宁德时代|比亚迪|茅台|平安|招商|腾讯|阿里|贵州茅台/, category: 'stock', importance: 4 },
    // 板块/市场类
    { regex: /新能源|白酒|医药|半导体|人工智能|光伏|锂电池|板块|大盘/, category: 'market', importance: 3 },
    // 策略类
    { regex: /量化|策略|回测|均线|交易|止损|止盈|波段/, category: 'strategy', importance: 4 },
  ]

  for (const msg of userMessages) {
    const trimmed = msg.trim()
    if (trimmed.length < 3) continue

    // 匹配最高优先级的分类
    let matched = false
    for (const pattern of patterns) {
      if (pattern.regex.test(trimmed)) {
        // 检查是否已存在相同分类的片段（去重）
        const existing = fragments.find((f) => f.category === pattern.category)
        if (!existing) {
          fragments.push({
            id: `fallback-${Date.now()}-${fragments.length}`,
            content: trimmed.slice(0, 80),
            category: pattern.category,
            importance: pattern.importance,
            sourceSessionId: '',
            createdAt: now,
            lastAccessedAt: now,
            accessCount: 0,
          })
        }
        matched = true
        break
      }
    }

    // 未匹配到任何关键词，归为 general
    if (!matched && fragments.length < 5) {
      fragments.push({
        id: `fallback-${Date.now()}-${fragments.length}`,
        content: trimmed.slice(0, 80),
        category: 'general',
        importance: 2,
        sourceSessionId: '',
        createdAt: now,
        lastAccessedAt: now,
        accessCount: 0,
      })
    }
  }

  return fragments
}
