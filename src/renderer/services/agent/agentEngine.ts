import { ChatMessage, IntentType, LLMConfig, UserMemory, BrowserActionDecision, BrowserAgentStep, AXNode } from '@shared/types'
import { classifyIntent, classifyIntentLocal } from './intentClassifier'
import {
  buildSystemPrompt,
  MARKET_QUERY_EXTRACTION_PROMPT,
  STRATEGY_BACKTEST_EXTRACTION_PROMPT,
  STOCK_PROFILE_EXTRACTION_PROMPT,
  SHELL_EXECUTE_EXTRACTION_PROMPT,
  BROWSER_EXTRACTION_PROMPT,
  BROWSER_ACTION_PROMPT,
} from './prompts'
import { executeTool, hasTool } from '../tools/registry'
import { streamChat } from '../llm/llmService'
import { logInfo, logDebug, logWarn, logError } from '../logger/logger'
import { useThinkingStore } from '../../stores/useThinkingStore'
import { usePreferenceStore } from '../../stores/usePreferenceStore'
import { MAX_CONTEXT_ROUNDS } from '@shared/constants'
import { searchMemories } from '../memory/memoryArchive'

/**
 * Agent 引擎
 * 整合意图识别、工具调用、LLM 回复生成的核心流程
 */

export interface AgentCallbacks {
  onChunk: (content: string) => void
  onToolCall: (toolName: string, args: Record<string, unknown>) => void
  onToolResult: (result: string) => void
  onError: (error: string) => void
  onDone: () => void
  /** v6.1.1: 浏览器来源信息回调 */
  onSourceUrl?: (url: string, title: string) => void
}

/**
 * 运行 Agent 对话回合
 * @param userInput 用户输入文本
 * @param history 历史消息
 * @param config LLM 配置
 * @param memory 长期记忆（用户偏好）
 * @param callbacks 回调
 */
export const runAgentTurn = async (
  userInput: string,
  history: ChatMessage[],
  config: LLMConfig,
  memory: UserMemory | undefined,
  callbacks: AgentCallbacks
): Promise<void> => {
  const { onChunk, onToolCall, onToolResult, onError, onDone, onSourceUrl } = callbacks
  const startTime = Date.now()
  const turnId = `turn-${Date.now()}`
  const { startTurn, addStep, completeStep, clearTurn } = useThinkingStore.getState()

  startTurn(turnId)

  logInfo('agent', 'agent.turn.start', {
    turnId,
    userInput,
    historyLength: history.length,
    model: config.model,
  })

  try {
    // 第一步：意图识别
    addStep({ type: 'intent.recognizing', status: 'running', message: '正在理解您的问题...' })
    const intentResult = await classifyIntent(userInput, config)
    const intent = intentResult.intent
    completeStep('intent.recognizing')
    addStep({
      type: 'intent.resolved',
      status: 'completed',
      message: `已识别意图：${intent}`,
      detail: `置信度：${intentResult.confidence}`,
    })

    logInfo('agent', 'agent.intent.resolved', {
      turnId,
      intent,
      confidence: intentResult.confidence,
    })

    // 第二步：处理非 LLM 意图
    if (intent === 'session.manage' || intent === 'preference.update') {
      const msg = '这个操作需要在界面中手动完成，请使用右侧的 Session 管理或设置页面。'
      logInfo('agent', 'agent.turn.skip', { turnId, reason: 'ui_operation', intent })
      onChunk(msg)
      onDone()
      clearTurn()
      return
    }

    // 第三步：语义检索相关记忆
    let relatedMemories: Awaited<ReturnType<typeof searchMemories>> = []
    try {
      relatedMemories = await searchMemories(userInput, { topK: 5, minScore: 0.7 })
      if (relatedMemories.length > 0) {
        logInfo('agent', 'agent.memory.retrieved', {
          turnId,
          count: relatedMemories.length,
          topContent: relatedMemories[0]?.content?.slice(0, 50),
        })
      }
    } catch (err) {
      // 提升日志级别为 warn，便于排查问题
      logWarn('agent', 'agent.memory.searchFailed', { turnId, error: String(err) })
      // 记忆检索失败不影响主流程，继续无记忆模式
    }

    // 第四步：准备 System Prompt 和上下文消息
    const systemPrompt = buildSystemPrompt(memory, relatedMemories)
    const contextMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-MAX_CONTEXT_ROUNDS * 2),
    ]

    logDebug('agent', 'agent.context.prepared', {
      turnId,
      systemPromptLength: systemPrompt.length,
      contextMessagesCount: contextMessages.length,
      memoryInjected: relatedMemories.length,
    })

    // 第四步：如果是工具意图，先执行工具
    let toolResultText = ''
    if (hasTool(intent)) {
      logInfo('agent', 'agent.tool.detected', { turnId, intent })

      addStep({ type: 'tool.extracting', status: 'running', message: '正在提取参数...' })
      let args = await extractToolArgs(userInput, intent, config)

      // v6.0.1: web.browse 搜索优先——如果 LLM 未返回有效 url 和 query，本地兜底
      if (intent === 'web.browse' && !args.url && !args.query) {
        const fallbackQuery = extractFallbackBrowseQuery(userInput)
        const fallbackDomain = detectDomainFromInput(userInput)
        if (fallbackQuery) {
          args = { query: fallbackQuery, domain: fallbackDomain, action: 'snapshot' }
          logInfo('agent', 'agent.tool.fallback', { turnId, fallbackQuery, fallbackDomain })
        }
      }

      // v6.0.1: 如果 LLM 返回了 query 但没返回 domain，从用户输入中检测
      if (intent === 'web.browse' && args.query && !args.domain) {
        args = { ...args, domain: detectDomainFromInput(userInput) }
      }

      // v6.1: web.browse 模式分支——智能操作模式走 Agent Loop
      const browserMode = usePreferenceStore.getState().browserMode
      if (intent === 'web.browse' && browserMode === 'agent') {
        logInfo('agent', 'agent.browser.agentMode', { turnId })
        completeStep('tool.extracting')
        onToolCall(intent, args)
        const agentResult = await runBrowserAgentLoop(userInput, args, config)
        toolResultText = agentResult.text
        // 传递来源信息给 UI 层
        if (agentResult.sourceUrl && onSourceUrl) {
          onSourceUrl(agentResult.sourceUrl, agentResult.sourceTitle)
        }
      } else {
        // 文本提取模式 & 其他工具：原有逻辑
        completeStep('tool.extracting')
        addStep({
          type: 'tool.calling',
          status: 'running',
          message: `正在调用 ${intent}...`,
          detail: JSON.stringify(args),
          meta: {
            tool: intent,
            ...(args.url ? { url: String(args.url) } : {}),
            ...(args.query ? { query: String(args.query), domain: String(args.domain || 'xueqiu.com') } : {}),
            action: String(args.action || 'snapshot'),
          },
        })
        logInfo('agent', 'agent.tool.args', { turnId, intent, args })

        onToolCall(intent, args)

        toolResultText = await executeTool(intent, args)

        // v6.1.1: web.browse 提取模式也传递来源信息
        if (intent === 'web.browse' && onSourceUrl) {
          const browseUrl = (args.url as string) || buildFinalUrl(args)
          const browseTitle = toolResultText.match(/已访问\s+(.+?)[\n\r]/)?.[1] || new URL(browseUrl).hostname
          if (browseUrl) {
            onSourceUrl(browseUrl, browseTitle)
          }
        }
      }

      const isError = /^(错误：|浏览失败|工具执行错误)/.test(toolResultText)
      completeStep('tool.calling')
      addStep({
        type: 'tool.result',
        status: isError ? 'failed' : 'completed',
        message: isError ? '工具执行失败' : '已获取工具结果',
        detail: `结果长度：${toolResultText.length} 字`,
        meta: {
          tool: intent,
          resultPreview: toolResultText.slice(0, 500),
          hasError: isError,
        },
      })
      logInfo('agent', 'agent.tool.result', {
        turnId,
        intent,
        resultLength: toolResultText.length,
      })

      onToolResult(toolResultText)

      contextMessages.push({
        role: 'user',
        content: `${userInput}\n\n[工具结果]\n${toolResultText}\n\n请根据以上工具结果，为用户生成自然语言回复。`,
      })
    } else {
      contextMessages.push({ role: 'user', content: userInput })
    }

    // 第五步：调用 LLM 生成回复
    let hasError = false

    addStep({ type: 'llm.generating', status: 'running', message: '正在生成回复...' })
    logInfo('agent', 'agent.llm.request', {
      turnId,
      model: config.model,
      messageCount: contextMessages.length,
    })

    await streamChat(
      contextMessages,
      config,
      undefined,
      {
        onChunk,
        onError: (err) => {
          hasError = true
          logError('agent', 'agent.llm.error', { turnId, error: err })
          onError(err)
        },
        onDone: () => {
          completeStep('llm.generating')
          addStep({ type: 'llm.streaming', status: 'completed', message: '回复已完成' })
          const latency = Date.now() - startTime
          logInfo('agent', 'agent.turn.end', {
            turnId,
            intent,
            hasError,
            latencyMs: latency,
          })
          onDone()
          clearTurn()
        },
      }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // 标记所有 running 步骤为失败
    const { currentTurnId: activeTurnId, turns } = useThinkingStore.getState()
    if (activeTurnId && turns[activeTurnId]) {
      for (const step of turns[activeTurnId]) {
        if (step.status === 'running') {
          useThinkingStore.getState().failStep(step.type, msg)
        }
      }
    }
    logError('agent', 'agent.turn.error', { turnId, error: msg })
    onError(msg)
    onDone()
    clearTurn()
  }
}

/**
 * 从用户输入中提取工具参数
 * 使用 LLM 进行参数提取
 */
const extractToolArgs = async (
  userInput: string,
  intent: IntentType,
  config: LLMConfig
): Promise<Record<string, unknown>> => {
  const promptMap: Record<string, string> = {
    'market.query': MARKET_QUERY_EXTRACTION_PROMPT,
    'strategy.backtest': STRATEGY_BACKTEST_EXTRACTION_PROMPT,
    'stock.profile': STOCK_PROFILE_EXTRACTION_PROMPT,
    'shell.execute': SHELL_EXECUTE_EXTRACTION_PROMPT,
    'web.browse': BROWSER_EXTRACTION_PROMPT,
  }

  const prompt = promptMap[intent] || '从用户输入中提取相关参数，返回 JSON 格式'

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
          { role: 'user', content: userInput },
        ],
        temperature: 0.1,
        max_tokens: 200,
      }),
    })

    if (!response.ok) {
      return {}
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  } catch {
    // 提取失败，返回空参数
  }

  return {}
}

/**
 * 快速意图识别（仅本地正则，不调用 LLM）
 * 用于前端快速判断是否需要展示工具卡片
 */
export const quickClassify = (text: string): IntentType => {
  const result = classifyIntentLocal(text)
  return result?.intent || 'general.chat'
}

/**
 * v6.0.1: 本地兜底搜索关键词提取
 * v6.0.2: 重写清理逻辑——先整体匹配"搜一下"等口语短语，再逐步拆解
 * 策略：移除平台名+口语短语+虚词 → 按标点分句 → 关键词拼接
 */
const extractFallbackBrowseQuery = (input: string): string => {
  // 1. 移除平台名（整词替换，防止残留）
  let text = input
  const platformNames = ['东方财富网', '东方财富', '雪球', '同花顺', '财联社', '新浪财经', '新浪', '百度', '东方']
  for (const name of platformNames) {
    text = text.replace(new RegExp(name, 'g'), ' ')
  }

  // 2. 先整体匹配口语化短语（必须在单字匹配之前！）
  //    否则"搜一下"会先被"搜"吃掉，留下"一下"粘到后面
  const phrasePatterns = [
    /搜[一一下]+/g,         // 搜一下、搜下
    /搜索[一一下]+/g,       // 搜索一下
    /查[一一下]+/g,         // 查一下、查下
    /找[一一下]+/g,         // 找一下
    /看看/g,               // 看看
    /看[一一下]+/g,         // 看一下
    /了解[一一下]+/g,       // 了解一下
    /打听[一一下]+/g,       // 打听一下
  ]
  for (const pattern of phrasePatterns) {
    text = text.replace(pattern, ' ')
  }

  // 3. 移除单字指令词
  const directivePatterns = [
    /搜索?/g,               // 搜、搜索
    /浏览/g,
    /打开/g,
    /帮[我咱]/g,
    /给[我咱]/g,
    /请/g,
    /能否/g,
    /可以/g,
    /我想/g,
    /想要/g,
    /并给/g,
    /并[做出提写]/g,
    /总结[一一下]*/g,
    /汇总/g,
    /梳理/g,
    /归纳/g,
    /整理[一一下]*/g,
  ]
  for (const pattern of directivePatterns) {
    text = text.replace(pattern, ' ')
  }

  // 4. 移除口语化连接短语（"是什么""有哪些""有没有"等）
  const fillerPatterns = [
    /是什么/g,
    /有哪些/g,
    /有没有/g,
    /有什么/g,           // "有什么新闻"
    /是什么意思/g,
    /怎么样/g,
    /如何/g,
    /为什么/g,
    /为什么呢/g,
    /能不能/g,
  ]
  for (const pattern of fillerPatterns) {
    text = text.replace(pattern, ' ')
  }

  // 5. 移除标点 + 清理残留虚词
  text = text
    .replace(/[，。！？、；：""''（）\[\]【】]/g, ' ')
    .replace(/和[给出]/g, ' ')
    .replace(/的/g, ' ')          // 移除所有"的"（之前只移除句首句尾，不够）

  // 6. 拆分粘合的噪声词（"PCB铜箔最新"→"PCB铜箔 最新"，"茅台讨论"→"茅台 讨论"）
  //    这些词本身有意义但不应粘在核心词后面
  const stickySuffixes = ['最新', '最近', '相关', '讨论', '观点', '分析', '总结']
  for (const suffix of stickySuffixes) {
    // 只有当 suffix 粘在一个 2+ 字的词后面时才拆分（避免把独立的"最新"拆没了）
    text = text.replace(new RegExp(`([\\u4e00-\\u9fa5A-Za-z0-9]{2,})${suffix}`, 'g'), `$1 ${suffix}`)
  }

  // 7. 分词（按空格），过滤太短/太长/无意义词
  const segments = text
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 20)

  const noiseWords = new Set([
    '一下', '然后', '之后', '接着', '那个', '这个', '什么', '怎么',
    '如何', '为啥', '为什么', '多少', '几', '吗', '呢', '吧', '啊',
    '的', '了', '着', '过', '在', '是', '有', '不', '也', '都',
    '还', '就', '又', '把', '被', '让', '到', '很', '会', '能', '要',
    '最新', '最近', '相关', '一些', '那些', '这些',
  ])

  const keywords = segments.filter((s) => !noiseWords.has(s))

  // 7. 去重 + 拼接
  const unique = [...new Set(keywords)]

  if (unique.length === 0) {
    // 兜底：去标点后取前 30 字
    const fallback = input.replace(/[，。！？、；：""''（）\[\]【】]/g, ' ').trim()
    return fallback.length >= 2 ? fallback.slice(0, 30) : input.slice(0, 20)
  }

  return unique.join(' ')
}

/**
 * v6.0.1: 从用户输入中检测目标域名
 * v6.0.2: 增加智能路由——根据关键词类型自动选择最佳域名
 */
const DOMAIN_KEYWORDS: Array<{ keywords: string[]; domain: string }> = [
  { keywords: ['东方财富', '东方财富网', 'eastmoney'], domain: 'eastmoney.com' },
  { keywords: ['雪球', 'xueqiu'], domain: 'xueqiu.com' },
  { keywords: ['同花顺', '10jqka'], domain: '10jqka.com.cn' },
  { keywords: ['财联社', 'cls'], domain: 'cls.cn' },
  { keywords: ['新浪', 'sina'], domain: 'sina.com.cn' },
  { keywords: ['巨潮', 'cninfo'], domain: 'cninfo.com.cn' },
  { keywords: ['百度', 'baidu'], domain: 'baidu.com' },
]

const detectDomainFromInput = (input: string): string => {
  // 1. 先检查用户是否明确指定了网站
  for (const { keywords, domain } of DOMAIN_KEYWORDS) {
    if (keywords.some((kw) => input.includes(kw))) {
      return domain
    }
  }
  // 2. v6.0.2: 智能路由——根据内容关键词选择最佳域名
  if (/催化|新闻|快讯|受益|概念|热点|动态|资讯/i.test(input)) return 'cls.cn'
  if (/研报|深度|分析|调研|研究|机构|评级|目标价/i.test(input)) return 'eastmoney.com'
  if (/讨论|观点|股吧|社区|评论|看好|看空/i.test(input)) return 'xueqiu.com'
  if (/公告|监管|披露|证监会|问询|回复/i.test(input)) return 'cninfo.com.cn'
  // 3. 兜底：东方财富（比百度金融信息更精准）
  return 'eastmoney.com'
}

// ──────────────────────────────────────────────
// v6.1: 浏览器智能操作模式（Agent Loop）
// ──────────────────────────────────────────────

/** Agent Loop 最大步数 */
const MAX_BROWSER_STEPS = 5

/** Agent Loop 总超时（ms） */
const BROWSER_AGENT_TIMEOUT_MS = 30000

/** 危险按钮文本模式 */
const DANGEROUS_ELEMENT_PATTERNS = [
  /登录|注册|下载|购买|支付|删除|退出|注销|签约/i,
]

/**
 * 危险 action 安全检查
 * 只检查 click 操作，过滤包含危险文本的元素
 */
const isActionSafe = (decision: BrowserActionDecision, axTree: AXNode[]): boolean => {
  if (decision.action !== 'click' || !decision.nodeId) return true

  const target = axTree.find((n) => n.nodeId === decision.nodeId)
  if (!target) return true  // 找不到节点不阻止，让 clickElement 自行处理定位

  // 危险按钮检查
  if (DANGEROUS_ELEMENT_PATTERNS.some((p) => p.test(target.name))) {
    logWarn('agent', 'browser.action.blocked', { nodeId: decision.nodeId, name: target.name })
    return false
  }

  return true
}

/**
 * v6.1: 浏览器智能操作 Agent Loop
 *
 * 流程：打开页面 → attachCDP → [获取AXTree → LLM决策 → 执行action] × N → detachCDP → close
 *
 * @param userInput 用户原始输入
 * @param toolArgs 工具参数（url/query/domain/action）
 * @param config LLM 配置
 * @returns 工具结果文本
 */
const runBrowserAgentLoop = async (
  userInput: string,
  toolArgs: Record<string, unknown>,
  config: LLMConfig
): Promise<{ text: string; sourceUrl: string; sourceTitle: string }> => {
  const startTime = Date.now()
  const { addStep, completeStep } = useThinkingStore.getState()
  const steps: BrowserAgentStep[] = []
  let finalContent = ''

  logInfo('agent', 'browser.agentLoop.start', {
    userInput: userInput.slice(0, 100),
    toolArgs: JSON.stringify(toolArgs),
  })

  // 1. 构造 URL 并打开页面
  addStep({ type: 'browser.opening', status: 'running', message: '正在打开页面...' })

  const url = buildFinalUrl(toolArgs)
  const browseResult = await window.browser.open({ url })

  if (!browseResult.success) {
    completeStep('browser.opening')
    return { text: `浏览失败：${browseResult.error || '未知错误'}`, sourceUrl: '', sourceTitle: '' }
  }

  completeStep('browser.opening')
  addStep({
    type: 'browser.opened',
    status: 'completed',
    message: `已打开: ${browseResult.title}`,
    detail: browseResult.url,
  })

  // 2. 启用 CDP
  let cdpAttached = false
  try {
    const attachResult = await window.browser.attachCDP()
    cdpAttached = attachResult.success && (attachResult.cdpAttached ?? false)
    if (!cdpAttached) {
      logWarn('agent', 'browser.cdp.attachFailed', {
        success: attachResult.success,
        cdpAttached: attachResult.cdpAttached,
        error: attachResult.error,
      })
      // CDP attach 失败，降级为文本提取模式（browse 已成功，直接用其文本）
      await window.browser.close()
      return { text: `已访问 ${browseResult.title}\n\n提取内容：\n${browseResult.text}`, sourceUrl: browseResult.url, sourceTitle: browseResult.title }
    }
    logInfo('agent', 'browser.cdp.attached', { cdpAttached: attachResult.cdpAttached })
  } catch (err) {
    logWarn('agent', 'browser.cdp.attachError', { error: String(err) })
    await window.browser.close()
    return { text: `已访问 ${browseResult.title}\n\n提取内容：\n${browseResult.text}`, sourceUrl: browseResult.url, sourceTitle: browseResult.title }
  }

  try {
    // 3. Agent Loop
    for (let step = 0; step < MAX_BROWSER_STEPS; step++) {
      if (Date.now() - startTime > BROWSER_AGENT_TIMEOUT_MS) {
        finalContent = await window.browser.extractCurrentPageText() || browseResult.text
        addStep({
          type: 'browser.timeout',
          status: 'completed',
          message: '操作超时，提取已获取内容',
        })
        break
      }

      // 3a. 观察获取 AXTree
      addStep({ type: 'browser.observing', status: 'running', message: `正在观察页面（第${step + 1}步）...` })

      let axTree: AXNode[] = []
      try {
        const axResult = await window.browser.getAXTree()
        if (axResult.success) {
          axTree = axResult.tree
        } else {
          logWarn('agent', 'browser.axTree.failed', {
            error: axResult.error,
            treeLength: axResult.tree?.length ?? -1,
          })
        }
      } catch (err) {
        logWarn('agent', 'browser.axTree.error', { error: String(err) })
      }

      completeStep('browser.observing')

      logInfo('agent', 'browser.axTree.result', {
        step,
        nodeCount: axTree.length,
      })

      if (axTree.length === 0) {
        logWarn('agent', 'browser.axTree.empty', { step, url: browseResult.url })
        // 无法获取 AXTree，直接提取当前页面文本
        finalContent = await window.browser.extractCurrentPageText() || browseResult.text
        break
      }

      // 3b. 思考：LLM 决策
      addStep({ type: 'browser.thinking', status: 'running', message: 'Agent 正在决策下一步...' })

      const decision = await llmDecideAction(userInput, axTree, steps, browseResult, config)

      completeStep('browser.thinking')

      if (!decision) {
        logWarn('agent', 'browser.llmDecide.failed', {
          step,
          axTreeNodes: axTree.length,
        })
        // LLM 决策失败，提取当前页面文本
        finalContent = await window.browser.extractCurrentPageText() || browseResult.text
        break
      }

      logInfo('agent', 'browser.llmDecide.result', {
        step,
        action: decision.action,
        nodeId: decision.nodeId,
        reason: decision.reason,
      })

      // 3c. 检查是否结束
      if (decision.action === 'extract' || decision.action === 'done') {
        if (decision.action === 'extract') {
          finalContent = await window.browser.extractCurrentPageText() || browseResult.text
        } else {
          finalContent = browseResult.text
        }

        steps.push({
          step,
          action: decision.action,
          result: decision.reason,
          timestamp: Date.now(),
        })

        addStep({
          type: 'browser.action',
          status: 'completed',
          message: `${decision.action}: ${decision.reason}`,
        })
        break
      }

      // 3d. 安全检查
      if (!isActionSafe(decision, axTree)) {
        steps.push({
          step,
          action: decision.action,
          target: decision.nodeId,
          result: 'Action blocked (unsafe)',
          timestamp: Date.now(),
        })
        addStep({
          type: 'browser.action',
          status: 'completed',
          message: `操作被安全策略拦截: ${decision.nodeId}`,
        })
        continue
      }

      // 3e. 执行操作
      addStep({
        type: 'browser.action',
        status: 'running',
        message: `${decision.action}: ${decision.reason}`,
      })

      let actionResult: string
      switch (decision.action) {
        case 'click': {
          // 从 AXTree 中找到目标节点的 name/role，传给 clickElement 做文本匹配
          const axNode = axTree.find((n) => n.nodeId === decision.nodeId)
          const res = await window.browser.clickElement(
            decision.nodeId || '',
            axNode?.name,
            axNode?.role
          )
          actionResult = res.success ? `Clicked "${axNode?.name || decision.nodeId}"` : `Click failed: ${res.error}`
          break
        }
        case 'type': {
          const axNode = axTree.find((n) => n.nodeId === decision.nodeId)
          const res = await window.browser.typeText(
            decision.nodeId || '',
            decision.text || '',
            axNode?.name,
            axNode?.role
          )
          actionResult = res.success ? `Typed "${decision.text}" into "${axNode?.name || decision.nodeId}"` : `Type failed: ${res.error}`
          break
        }
        case 'scroll': {
          const res = await window.browser.scrollPage(decision.direction || 'down')
          actionResult = res.success ? `Scrolled ${decision.direction}` : `Scroll failed: ${res.error}`
          break
        }
        default: {
          actionResult = 'Unknown action'
          break
        }
      }

      completeStep('browser.action')

      steps.push({
        step,
        action: decision.action,
        target: decision.nodeId,
        result: actionResult,
        timestamp: Date.now(),
      })

      logInfo('agent', 'browser.action.executed', {
        step,
        action: decision.action,
        nodeId: decision.nodeId,
        result: actionResult,
      })
    }

    // 4. 如果 loop 结束但未 extract，提取当前页面
    if (!finalContent) {
      finalContent = await window.browser.extractCurrentPageText() || browseResult.text
    }
  } finally {
    // 5. 清理
    try {
      if (cdpAttached) {
        await window.browser.detachCDP()
      }
    } catch { /* ignore */ }
    await window.browser.close()
  }

  const elapsed = Date.now() - startTime
  logInfo('agent', 'browser.agentLoop.done', {
    steps: steps.length,
    elapsedMs: elapsed,
    contentLength: finalContent.length,
  })

  return { text: `已通过智能操作访问 ${browseResult.title}\n操作步骤：${steps.length} 步（${elapsed / 1000}s）\n\n提取内容：\n${finalContent}`, sourceUrl: browseResult.url, sourceTitle: browseResult.title }
}

/**
 * 构造最终 URL
 */
const buildFinalUrl = (toolArgs: Record<string, unknown>): string => {
  if (toolArgs.url && typeof toolArgs.url === 'string') {
    return toolArgs.url
  }

  // 动态导入 buildSearchUrl（避免循环依赖）
  const query = toolArgs.query as string | undefined
  const domain = toolArgs.domain as string | undefined

  if (!query) {
    return 'https://so.eastmoney.com'
  }

  // 内联 URL 构造（与 browser.ts 的 buildSearchUrl 相同逻辑）
  // v6.0.2: 默认走智能路由，而非百度
  const SEARCH_URL_TEMPLATES: Record<string, string> = {
    'baidu.com': 'https://www.baidu.com/s?wd={query}',
    'xueqiu.com': 'https://xueqiu.com/k?q={query}',
    'eastmoney.com': 'https://so.eastmoney.com/news/s?keyword={query}',
    'cls.cn': 'https://www.cls.cn/searchPage?keyword={query}&type=all',
    'sina.com.cn': 'https://search.sina.com.cn/?q={query}',
    '10jqka.com.cn': 'https://www.10jqka.com.cn/search?q={query}',
    'cninfo.com.cn': 'https://www.cninfo.com.cn/search?keyword={query}',
    'cs.com.cn': 'https://www.cs.com.cn/search?q={query}',
    'hexun.com': 'https://so.hexun.com/?q={query}',
  }

  // v6.0.2: 智能路由——根据 query 关键词选择最佳域名（与 browser.ts 的 queryDomainRoute 同步）
  const smartDomainRoute = (q: string): string => {
    if (/催化|新闻|快讯|受益|概念|热点|动态|资讯/i.test(q)) return 'cls.cn'
    if (/研报|深度|分析|调研|研究|机构|评级|目标价/i.test(q)) return 'eastmoney.com'
    if (/讨论|观点|股吧|社区|评论|看好|看空/i.test(q)) return 'xueqiu.com'
    if (/公告|监管|披露|证监会|问询|回复/i.test(q)) return 'cninfo.com.cn'
    return 'eastmoney.com'
  }

  const targetDomain = domain && SEARCH_URL_TEMPLATES[domain] ? domain : smartDomainRoute(query)
  const template = SEARCH_URL_TEMPLATES[targetDomain]
  return template.replace('{query}', encodeURIComponent(query))
}

/**
 * LLM 决策下一步操作
 * v6.1.1: 精简 AXTree 文本、增加 max_tokens、增加重试机制、增加完整响应日志
 */
const llmDecideAction = async (
  userInput: string,
  axTree: AXNode[],
  previousSteps: BrowserAgentStep[],
  browseResult: { title: string; url: string },
  config: LLMConfig
): Promise<BrowserActionDecision | null> => {
  // 精简 AXTree：只保留交互元素 + 前5个有名称的非交互元素，最多25个
  const INTERACTIVE_ROLES = new Set(['button', 'link', 'textbox', 'combobox', 'searchbox', 'checkbox', 'tab', 'menuitem', 'option'])
  const interactiveNodes = axTree.filter((n) => INTERACTIVE_ROLES.has(n.role))
  const otherNodes = axTree.filter((n) => !INTERACTIVE_ROLES.has(n.role)).slice(0, 5)
  const condensedTree = [...interactiveNodes, ...otherNodes].slice(0, 25)

  // 格式化精简后的 AXTree（紧凑格式，减小 prompt 体积）
  const axTreeText = condensedTree
    .map((n) => `${n.nodeId}|${n.role}|${n.name}${n.value ? `|${n.value}` : ''}`)
    .join('\n')

  // 格式化历史步骤
  const stepsText = previousSteps.length > 0
    ? previousSteps.map((s) => `步骤${s.step}: ${s.action}${s.target ? ` → ${s.target}` : ''} — ${s.result}`).join('\n')
    : '（无）'

  // 转义用户输入中的花括号，防止 Prompt 模板注入
  const safeUserInput = userInput.replace(/[{}]/g, '')

  // 构建 prompt
  const prompt = BROWSER_ACTION_PROMPT
    .replace('{userInput}', safeUserInput)
    .replace('{url}', browseResult.url)
    .replace('{title}', browseResult.title)
    .replace('{axTree}', axTreeText)
    .replace('{steps}', stepsText)

  logInfo('agent', 'browser.llmDecide.promptSize', {
    axTreeTotal: axTree.length,
    axTreeCondensed: condensedTree.length,
    promptLength: prompt.length,
  })

  // 最多重试 1 次
  const MAX_RETRIES = 1

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
            { role: 'user', content: `请根据以上信息，决定下一步操作。返回 JSON 格式。` },
          ],
          temperature: 0.1,
          max_tokens: 1024,
        }),
      })

      if (!response.ok) {
        logWarn('agent', 'browser.llmDecide.httpError', {
          attempt,
          status: response.status,
          statusText: response.statusText,
        })
        continue
      }

      const data = await response.json()
      const content: string = data.choices?.[0]?.message?.content || ''

      // 记录完整响应信息用于诊断
      logInfo('agent', 'browser.llmDecide.rawResponse', {
        attempt,
        contentLength: content.length,
        finishReason: data.choices?.[0]?.finish_reason,
        usage: data.usage,
        contentPreview: content.slice(0, 300),
      })

      if (!content || content.trim().length === 0) {
        logWarn('agent', 'browser.llmDecide.emptyContent', {
          attempt,
          finishReason: data.choices?.[0]?.finish_reason,
        })
        continue
      }

      // 解析 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        logWarn('agent', 'browser.llmDecide.noJson', {
          attempt,
          contentPreview: content.slice(0, 200),
        })
        continue
      }

      const parsed = JSON.parse(jsonMatch[0])

      return {
        action: parsed.action || 'done',
        nodeId: parsed.nodeId,
        text: parsed.text,
        direction: parsed.direction,
        reason: parsed.reason || '',
      }
    } catch (err) {
      logWarn('agent', 'browser.llmDecide.error', { attempt, error: String(err) })
    }
  }

  return null
}
