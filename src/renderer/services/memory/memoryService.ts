import { ChatMessage, LLMConfig, UserMemory } from '@shared/types'

/**
 * 记忆提炼服务
 * 从对话历史中提炼用户偏好
 */

/**
 * 调用 LLM 提炼用户偏好
 * @param messages 当前 Session 的对话历史
 * @param config LLM 配置
 * @returns 提炼出的用户偏好
 */
export const extractMemoryFromDialogue = async (
  messages: ChatMessage[],
  config: LLMConfig
): Promise<UserMemory> => {
  const dialogueText = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`)
    .join('\n')

  const prompt = `你是一个用户画像分析师。请从以下对话历史中提炼用户的偏好和关注点。

对话历史：
${dialogueText}

请提取以下信息并以 JSON 格式返回（不要加 markdown 代码块，只返回纯 JSON）：
{
  "riskPreference": "保守/稳健/激进 之一（如果从对话中能推断出，不要猜测）",
  "focusSectors": ["用户明确提到的行业板块，如 ['白酒', '新能源']"],
  "frequentQuestions": ["用户经常问的问题类型"],
  "summary": "一句话总结用户画像（30字以内）"
}

提取规则：
1. riskPreference：只有用户明确表达风险态度时才填写。例如：
   - "我比较保守" → "保守"
   - "我喜欢稳健" → "稳健"
   - "我想激进一点" → "激进"
   - 未明确提及 → ""
2. focusSectors：只有用户明确提到关注的行业/板块时才填写。例如：
   - "我关注新能源和白酒" → ["新能源", "白酒"]
   - "经常问茅台" → ["白酒"]
   - 未明确提及 → []
3. summary：基于用户实际表达提炼，不要编造。如果对话太少无法提炼，返回""

注意：
- 如果某项信息无法从对话中推断，严格返回空字符串或空数组
- 不要猜测，只提取用户明确表达的信息
- focusSectors 和 frequentQuestions 最多各返回 5 个`

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
          { role: 'system', content: prompt },
          { role: 'user', content: '请分析上述对话' },
        ],
        temperature: 0.3,
        max_tokens: 300,
      }),
    })

    if (!response.ok) {
      throw new Error(`API 错误 ${response.status}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0])

      // 校验并标准化 riskPreference
      const riskMap: Record<string, UserMemory['riskPreference']> = {
        保守: '保守',
        保守型: '保守',
        低风险: '保守',
        稳健: '稳健',
        稳健型: '稳健',
        中等风险: '稳健',
        平衡: '稳健',
        激进: '激进',
        激进型: '激进',
        高风险: '激进',
        进取: '激进',
      }
      const normalizedRisk = result.riskPreference
        ? riskMap[String(result.riskPreference).trim()]
        : undefined

      // 过滤 focusSectors，去除空字符串
      const sectors = Array.isArray(result.focusSectors)
        ? result.focusSectors
            .filter((s: unknown) => typeof s === 'string' && s.trim().length > 0)
            .slice(0, 5)
        : []

      // 过滤 frequentQuestions，去除空字符串
      const questions = Array.isArray(result.frequentQuestions)
        ? result.frequentQuestions
            .filter((q: unknown) => typeof q === 'string' && q.trim().length > 0)
            .slice(0, 5)
        : []

      // 清理 summary
      const summary =
        typeof result.summary === 'string' && result.summary.trim().length > 0
          ? result.summary.trim().slice(0, 100)
          : ''

      return {
        riskPreference: normalizedRisk,
        focusSectors: sectors,
        frequentQuestions: questions,
        summary,
      }
    }
  } catch {
    // 提取失败
  }

  return {
    focusSectors: [],
    frequentQuestions: [],
    summary: '',
  }
}

/**
 * 合并新提炼的记忆到现有记忆
 */
export const mergeMemory = (existing: UserMemory, extracted: UserMemory): UserMemory => {
  const merged: UserMemory = { ...existing }

  // 风险偏好：以最新为准
  if (extracted.riskPreference) {
    merged.riskPreference = extracted.riskPreference
  }

  // 关注板块：合并去重，保留最近 10 个
  if (extracted.focusSectors && extracted.focusSectors.length > 0) {
    const combined = [...(existing.focusSectors || []), ...extracted.focusSectors]
    merged.focusSectors = [...new Set(combined)].slice(-10)
  }

  // 常问问题：合并去重，保留最近 20 个
  if (extracted.frequentQuestions && extracted.frequentQuestions.length > 0) {
    const combined = [...(existing.frequentQuestions || []), ...extracted.frequentQuestions]
    merged.frequentQuestions = [...new Set(combined)].slice(-20)
  }

  // 摘要：以最新为准
  if (extracted.summary) {
    merged.summary = extracted.summary
  }

  merged.updatedAt = new Date().toISOString()
  return merged
}
