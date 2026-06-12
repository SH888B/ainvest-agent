import { IntentResult, IntentType, LLMConfig } from '@shared/types'
import { INTENT_TYPES } from '@shared/constants'
import { logInfo, logDebug, logWarn } from '../logger/logger'
import { buildIntentPrompt } from './prompts'

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

  // ===== news.search：已合并到 web.browse =====
  // v6.0.1: news.search (mock) 合并到 web.browse (CDP 真实抓取)
  // 以下规则 intent 改为 web.browse，confidence 不变
  {
    pattern: /(新闻|资讯|消息|报道|最新消息|热点).{0,5}(\d{6}|[A-Z]{2,5}|[\u4e00-\u9fa5]{2,6})/,
    intent: 'web.browse',
    confidence: 0.8,
  },
  {
    pattern: /(\d{6}|[A-Z]{2,5}|[\u4e00-\u9fa5]{2,6}).{0,5}(新闻|资讯|消息|报道)/,
    intent: 'web.browse',
    confidence: 0.8,
  },
  {
    pattern: /(搜|搜索|查|查找).{0,5}(新闻|资讯|消息)/,
    intent: 'web.browse',
    confidence: 0.8,
  },
  {
    pattern: /(有什么|最新|最近).{0,3}(新闻|资讯|消息)/,
    intent: 'web.browse',
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

  // ===== shell.execute：执行本地命令 =====
  {
    pattern: /(运行|执行|调用|跑|跑一下|执行一下|帮我).{0,5}(python|node|npm|git|curl|pip|conda|java|go|bash|sh|zsh|rm|mkdir|cp|mv|chmod|echo|cat|ls|pwd|which|whoami)/i,
    intent: 'shell.execute',
    confidence: 0.9,
  },
  {
    pattern: /(python|node|npm|git|curl|pip|conda|java|go|bash|sh|rm|mkdir|cp|mv).{0,5}(运行|执行|调用|跑|脚本)/i,
    intent: 'shell.execute',
    confidence: 0.9,
  },
  {
    pattern: /(查看|列出|显示|查一下).{0,5}(文件|目录|文件夹|workspace)/i,
    intent: 'shell.execute',
    confidence: 0.85,
  },
  {
    pattern: /^(ls|dir|cat|type|grep|find|rm|mkdir|cp|mv|python|node|npm|git|curl|echo|bash|sh)\s+/i,
    intent: 'shell.execute',
    confidence: 0.85,
  },

  // ===== web.browse：浏览网页 =====
  // v6.0.2: 放宽正则范围，覆盖口语化搜索表达

  // 规则1：搜索动词 + 金融关键词（扩大匹配距离到 30 字符）
  {
    pattern: /(搜|搜索|查|看看|打开|浏览).{0,30}(网页|网站|研报|新闻|资讯|公告|雪球|东方财富|同花顺|财联社|催化|受益|概念|板块|行业|热点|动态|快讯)/,
    intent: 'web.browse',
    confidence: 0.85,
  },
  // 规则2：网站名 + 搜索动词
  {
    pattern: /(雪球|东方财富|同花顺|财联社).{0,10}(搜|搜索|查|看看)/,
    intent: 'web.browse',
    confidence: 0.85,
  },
  // 规则3：最新/最近 + 金融信息关键词
  {
    pattern: /(最新|最近).{0,5}(研报|公告|新闻|资讯|催化|动态|快讯).{0,5}(哪里|怎么|哪里看|在哪|有哪些|是什么)/,
    intent: 'web.browse',
    confidence: 0.8,
  },
  // 规则4（新增）：搜索动词 + 长距离金融意图词（催化/受益/概念/板块/行业）
  {
    pattern: /(搜|搜索|查|查找|了解|打听).{0,20}(催化|受益|概念|板块|行业|热点|研报|公告|新闻|资讯|快讯|动态)/,
    intent: 'web.browse',
    confidence: 0.8,
  },
  // 规则5（新增）：口语化搜索兜底——"搜一下/查查/帮我搜" 开头，后面跟任意内容
  // 置信度 0.65，不达 0.9，让 LLM 二次确认
  {
    pattern: /^(搜一下?|搜索|查找|查查|查查看|帮我搜|搜下|搜搜|查下|查一下|了解了解).{2,}/,
    intent: 'web.browse',
    confidence: 0.65,
  },

  // ===== preference.update：偏好更新 =====
  // v6.0.1: 精确化规则，只匹配明确的更新/设置意图，不匹配查询意图
  // "我之前关注哪些公司"是查询偏好，应走 general.chat（记忆检索）
  {
    pattern: /(设置|更新|修改|调整|变更).{0,5}(风险偏好|偏好|关注板块|投资风格|风险)/,
    intent: 'preference.update',
    confidence: 0.9,
  },
  {
    pattern: /^(记住|记住我|我喜欢|我不喜欢|我关注|我偏好|我的风险|我的偏好)/,
    intent: 'preference.update',
    confidence: 0.85,
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
 * v6.0.1: 改为遍历所有规则，返回置信度最高的匹配
 * 修复：当多个规则匹配同一输入时（如"搜索东方财富的贵州茅台新闻"同时匹配 news.search 和 web.browse），
 * 应返回置信度最高的，而非数组中最先出现的
 */
export const classifyIntentLocal = (text: string): IntentResult | null => {
  let bestMatch: IntentResult | null = null

  for (const rule of LOCAL_RULES) {
    if (rule.pattern.test(text)) {
      if (!bestMatch || rule.confidence > bestMatch.confidence) {
        bestMatch = {
          intent: rule.intent,
          confidence: rule.confidence,
        }
      }
    }
  }

  return bestMatch
}

/**
 * LLM 意图识别
 * 构造一个分类 prompt，让 LLM 返回 JSON 格式结果
 */
export const classifyIntentLLM = async (
  text: string,
  config: LLMConfig
): Promise<IntentResult> => {
  const prompt = buildIntentPrompt(text)

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
