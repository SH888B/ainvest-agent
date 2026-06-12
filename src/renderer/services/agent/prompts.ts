import { UserMemory } from '@shared/types'
import { MemoryFragment } from '../../../shared/types/memory'

/**
 * Prompt 版本号
 * v5.0.0: 增加语义记忆注入
 */
export const PROMPT_VERSION = 'v6.0.0'

/**
 * 构建基础 System Prompt
 * @param memory 用户显式偏好
 * @param relatedMemories 语义检索到的相关历史记忆
 */
export const buildSystemPrompt = (memory?: UserMemory, relatedMemories?: MemoryFragment[]): string => {
  const basePrompt = `你是一个专业的投资研究助手，名叫 AInvest Agent。

你可以帮助用户完成以下任务：
1. 查询股票行情（价格、涨跌幅、成交量、PE、PB 等）
2. 搜索与股票或行业相关的新闻
3. 对投资策略进行历史回测
4. 查看个股基本面档案
5. 执行本地命令或脚本（如 python、node 等）——当用户要求运行命令时，你应该直接执行并返回结果
6. 浏览金融网站获取实时信息（如雪球、东方财富、财联社）——当用户询问最新研报、公告、新闻时，你可以打开相关网页提取内容

请用中文回答，保持专业、简洁、准确。如果不确定用户意图，可以礼貌询问澄清。`

  const sections: string[] = [basePrompt]

  // 注入显式长期记忆
  if (memory) {
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

    if (memoryParts.length > 0) {
      sections.push(`以下是你对当前用户的了解（基于历史对话提炼）：\n${memoryParts.join('\n')}`)
    }
  }

  // 注入语义检索到的相关记忆
  if (relatedMemories && relatedMemories.length > 0) {
    const memoryLines = relatedMemories
      .slice(0, 5)
      .map((m, i) => `${i + 1}. [${m.category}] ${m.content}`)
      .join('\n')

    sections.push(`以下是之前对话中提取的相关记忆（你可以直接使用这些信息来理解用户意图）：\n${memoryLines}\n\n重要规则：\n- 当用户使用代词或模糊指代（如"那只股票""那家公司""那个板块"）时，请结合记忆主动推断指代对象\n- 例如：如果记忆中有"关注宁德时代"，用户问"那家公司怎么样"时，你应该推断为宁德时代并直接回答\n- 不要回复"请问您指的是哪只股票"，而是基于记忆直接给出答案\n- 如果记忆中有多个可能的指代对象，可以简短列出但优先选择最相关的\n- 自然地融入回答，不需要说"根据记忆"或"根据历史"`)
  }

  if (sections.length === 1) {
    return basePrompt
  }

  return sections.join('\n\n---\n\n')
}

/**
 * 构建意图识别 Prompt
 * @param text 用户输入文本
 */
export const buildIntentPrompt = (text: string): string => {
  return `你是一个意图分类助手。请将用户输入分类到以下类型之一，并以 JSON 格式返回。

可选类型：
- market.query: 查询股票行情、价格、涨跌幅等
- strategy.backtest: 策略回测
- stock.profile: 个股基本面档案
- shell.execute: 执行本地命令或脚本（如运行 Python、查看文件等）
- web.browse: 浏览网页获取实时信息（如搜索新闻、查看最新研报、公告）
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

export const STRATEGY_BACKTEST_EXTRACTION_PROMPT =
  '从用户输入中提取策略名称、股票代码、开始日期、结束日期。只返回 JSON 格式：{"strategyName": "策略名", "symbol": "代码", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD"}'

export const STOCK_PROFILE_EXTRACTION_PROMPT =
  '从用户输入中提取股票代码。只返回 JSON 格式：{"symbol": "股票代码"}'

export const SHELL_EXECUTE_EXTRACTION_PROMPT =
  '从用户输入中提取要执行的命令和参数。只返回 JSON 格式：{"command": "命令名", "args": ["参数1", "参数2"], "cwd": "可选的工作目录"}\n\n示例：\n- 输入"运行 test.py" → {"command": "python", "args": ["test.py"]}\n- 输入"查看 workspace 目录" → {"command": "ls", "args": ["workspace"]}\n- 输入"执行 node -e console.log(1)" → {"command": "node", "args": ["-e", "console.log(1)"]}'

export const BROWSER_EXTRACTION_PROMPT =
  '从用户输入中提取搜索关键词和目标网站。返回 JSON 格式：{"query": "搜索关键词", "domain": "目标域名", "action": "snapshot"}\n\n规则：\n- query：从用户输入中提取核心搜索词，多个词用空格分隔（如"宁德时代 研报 最新"）\n- domain：根据用户指定或内容类型选择最合适的网站域名\n  - 未指定或不确定 → baidu.com（默认，搜索引擎结果最全面、提取最可靠）\n  - 用户明确提到某网站 → 使用该网站域名\n  - 研报/个股分析/财务数据 → eastmoney.com\n  - 新闻/快讯/实时资讯 → cls.cn\n  - 股票讨论/综合信息 → xueqiu.com\n  - 公告/监管信息 → cninfo.com.cn\n- action 默认 snapshot（提取文本），用户要求截图时用 screenshot\n- 如果用户已经给出了完整URL，则直接返回 {"url": "完整URL", "action": "snapshot"}\n\n示例：\n- "查一下宁德时代的研报" → {"query": "宁德时代 研报", "domain": "baidu.com"}\n- "最新财经新闻" → {"query": "财经 新闻 最新", "domain": "baidu.com"}\n- "帮我看看雪球的茅台讨论" → {"query": "贵州茅台", "domain": "xueqiu.com"}\n- "在东方财富搜索茅台新闻" → {"query": "贵州茅台 新闻", "domain": "eastmoney.com"}\n- "打开 https://xueqiu.com/S/SH600519" → {"url": "https://xueqiu.com/S/SH600519", "action": "snapshot"}'
