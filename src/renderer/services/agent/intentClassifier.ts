import { IntentResult, IntentType, LLMConfig } from '@shared/types'
import { INTENT_TYPES } from '@shared/constants'
import { logInfo, logDebug, logWarn } from '../logger/logger'

/**
 * 意图识别器
 * 双层策略：LLM 为主 + 本地正则兜底
 */

/** 本地正则规则表 */
const LOCAL_RULES: Array<{
  pattern: RegExp
  intent: IntentType
  confidence: number
}> = [
  // ===== market.query：行情查询 =====
  // 模式 A：行情关键词 + 股票代码/英文代码
  {
    pattern: /(行情|价格|多少钱|股价|涨跌|涨了|跌了|涨跌幅|市值|市盈率|PE|PB|成交量|走势|K线).*?(\d{6}|[A-Z]{2,5})/,
    intent: 'market.query',
    confidence: 0.9,
  },
  // 模式 B：股票代码/英文代码 + 行情关键词
  {
    pattern: /(\d{6}|[A-Z]{2,5}).*?(行情|价格|多少钱|股价|涨跌|涨了|跌了|市值|市盈率|PE|PB|成交量|走势)/,
    intent: 'market.query',
    confidence: 0.9,
  },
  // 模式 C：行情关键词 + 中文股票名称/英文代码（2-6个汉字/字母）
  {
    pattern: /(行情|价格|多少钱|股价|涨跌|涨了|跌了|市值|市盈率|PE|PB|成交量|走势).{0,5}([\u4e00-\u9fa5]{2,6}|[A-Z]{2,5})/,
    intent: 'market.query',
    confidence: 0.8,
  },
  // 模式 D：中文股票名称/英文代码 + 行情关键词
  {
    pattern: /([\u4e00-\u9fa5]{2,6}|[A-Z]{2,5}).{0,5}(行情|价格|多少钱|股价|涨跌|涨了|跌了|市值|市盈率|PE|PB|成交量|走势)/,
    intent: 'market.query',
    confidence: 0.8,
  },
  // 模式 E：宽泛的行情动词 + 股票名称
  {
    pattern: /(看看|查|查询|查一下).{0,5}([\u4e00-\u9fa5]{2,6}|[A-Z]{2,5}).{0,3}(行情|价格|股价|成交量|PE|PB)/,
    intent: 'market.query',
    confidence: 0.75,
  },

  // ===== news.search：新闻搜索 =====
  {
    pattern: /(新闻|资讯|消息|报道|最新消息|热点).{0,5}(\d{6}|[A-Z]{2,5}|[\u4e00-\u9fa5]{2,6})/,
    intent: 'news.search',
    confidence: 0.8,
  },
  {
    pattern: /(\d{6}|[A-Z]{2,5}|[\u4e00-\u9fa5]{2,6}).{0,5}(新闻|资讯|消息|报道)/,
    intent: 'news.search',
    confidence: 0.8,
  },
  {
    pattern: /(搜|搜索|查|查找).{0,5}(新闻|资讯|消息)/,
    intent: 'news.search',
    confidence: 0.8,
  },
  {
    pattern: /(有什么|最新|最近).{0,3}(新闻|资讯|消息)/,
    intent: 'news.search',
    confidence: 0.75,
  },

  // ===== strategy.backtest：策略回测 =====
  {
    pattern: /(回测|策略|测试|回测一下|策略测试|历史回测)/,
    intent: 'strategy.backtest',
    confidence: 0.85,
  },

  // ===== stock.profile：个股档案 =====
  {
    pattern: /(档案|基本面|公司简介|公司信息|公司是做什么的|做什么业务|简介|介绍|是干什么的).*?(\d{6}|[A-Z]{2,5}|[\u4e00-\u9fa5]{2,6})/,
    intent: 'stock.profile',
    confidence: 0.8,
  },
  {
    pattern: /(\d{6}|[A-Z]{2,5}|[\u4e00-\u9fa5]{2,6}).*?(档案|基本面|公司简介|公司信息|简介|介绍|是做什么的|是干什么的)/,
    intent: 'stock.profile',
    confidence: 0.8,
  },

  // ===== session.manage：会话管理 =====
  {
    pattern: /(新建|创建|新开|新增).{0,3}(对话|会话|聊天)/,
    intent: 'session.manage',
    confidence: 0.9,
  },
  {
    pattern: /(删除|移除|清除|删掉).{0,3}(对话|会话|聊天|历史)/,
    intent: 'session.manage',
    confidence: 0.9,
  },
  {
    pattern: /(切换|换到|转到|跳到).{0,10}(对话|会话)/,
    intent: 'session.manage',
    confidence: 0.9,
  },
  {
    pattern: /(对话|会话).{0,5}(切换|换到|转到|跳到)/,
    intent: 'session.manage',
    confidence: 0.9,
  },
  {
    pattern: /(重命名|改名|改名字|改名成).{0,10}(对话|会话)/,
    intent: 'session.manage',
    confidence: 0.9,
  },
  {
    pattern: /(对话|会话).{0,5}(重命名|改名|改名字)/,
    intent: 'session.manage',
    confidence: 0.9,
  },

  // ===== preference.update：偏好更新 =====
  {
    pattern: /(风险偏好|风险|偏好|关注板块|关注|我喜欢|我不喜欢|记住|记住我)/,
    intent: 'preference.update',
    confidence: 0.75,
  },

  // ===== general.chat：闲聊兜底 =====
  {
    pattern: /^(你好|您好|嗨|hello|hi|hey|早上好|下午好|晚上好|再见|拜拜|谢谢|感谢|辛苦了|不客气)$/i,
    intent: 'general.chat',
    confidence: 0.95,
  },
  {
    pattern: /(天气|今天几号|现在几点|吃饭了吗|在吗|有人吗)/,
    intent: 'general.chat',
    confidence: 0.9,
  },
  {
    pattern: /(投资建议|推荐|买什么|怎么看|好不好|怎么样|值得买吗|能买吗|可以入手吗|帮忙分析).*?(\d{6}|[A-Z]{2,5}|[\u4e00-\u9fa5]{2,6})?/,
    intent: 'general.chat',
    confidence: 0.7,
  },
  {
    pattern: /(大盘|指数|A股|美股|港股|市场|牛市|熊市).{0,5}(怎么样|如何|走势|看法|观点|分析)?/,
    intent: 'general.chat',
    confidence: 0.7,
  },
  {
    pattern: /^(好的|OK|嗯|哦|知道了|明白了|了解)$/,
    intent: 'general.chat',
    confidence: 0.8,
  },
]

/**
 * 本地正则兜底识别
 */
export const classifyIntentLocal = (text: string): IntentResult | null => {
  for (const rule of LOCAL_RULES) {
    if (rule.pattern.test(text)) {
      return {
        intent: rule.intent,
        confidence: rule.confidence,
      }
    }
  }
  return null
}

/**
 * LLM 意图识别
 * 构造一个分类 prompt，让 LLM 返回 JSON 格式结果
 */
export const classifyIntentLLM = async (
  text: string,
  config: LLMConfig
): Promise<IntentResult> => {
  const prompt = `你是一个意图分类助手。请将用户输入分类到以下类型之一，并以 JSON 格式返回。

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
          { role: 'user', content: text },
        ],
        temperature: 0.1,
        max_tokens: 100,
      }),
    })

    if (!response.ok) {
      throw new Error(`API 错误 ${response.status}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''

    // 提取 JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0])
      const intent = INTENT_TYPES.includes(result.intent) ? result.intent : 'unknown'
      return {
        intent: intent as IntentType,
        confidence: typeof result.confidence === 'number' ? result.confidence : 0.5,
      }
    }
  } catch {
    // LLM 失败，fallback 到 unknown
  }

  return { intent: 'unknown', confidence: 0 }
}

/**
 * 综合意图识别
 * 先本地正则，再 LLM，置信度 > 0.7 时返回 LLM 结果
 */
export const classifyIntent = async (
  text: string,
  config: LLMConfig
): Promise<IntentResult> => {
  // 第一层：本地正则兜底
  const localResult = classifyIntentLocal(text)
  logDebug('intent', 'classify.local', {
    input: text,
    matched: !!localResult,
    result: localResult,
  })

  if (localResult && localResult.confidence >= 0.9) {
    logInfo('intent', 'classify.complete', {
      input: text,
      method: 'local',
      intent: localResult.intent,
      confidence: localResult.confidence,
    })
    return localResult
  }

  // 第二层：LLM 分类
  const llmResult = await classifyIntentLLM(text, config)
  logInfo('intent', 'classify.complete', {
    input: text,
    method: 'llm',
    intent: llmResult.intent,
    confidence: llmResult.confidence,
  })

  if (llmResult.confidence > 0.7) {
    return llmResult
  }

  // 第三层：本地结果兜底（如果 LLM 置信度不够）
  if (localResult) {
    logWarn('intent', 'classify.fallback', {
      input: text,
      method: 'local_fallback',
      llmConfidence: llmResult.confidence,
    })
    return localResult
  }

  return llmResult
}
