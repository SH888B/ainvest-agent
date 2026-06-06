import { ChatMessage, IntentType, LLMConfig, UserMemory } from '@shared/types'
import { classifyIntent, classifyIntentLocal } from './intentClassifier'
import {
  buildSystemPrompt,
  MARKET_QUERY_EXTRACTION_PROMPT,
  NEWS_SEARCH_EXTRACTION_PROMPT,
  STRATEGY_BACKTEST_EXTRACTION_PROMPT,
  STOCK_PROFILE_EXTRACTION_PROMPT,
} from './prompts'
import { executeTool, hasTool } from '../tools/registry'
import { streamChat } from '../llm/llmService'
import { logInfo, logDebug, logError } from '../logger/logger'
import { useThinkingStore } from '../../stores/useThinkingStore'
import { MAX_CONTEXT_ROUNDS } from '@shared/constants'

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
  const { onChunk, onToolCall, onToolResult, onError, onDone } = callbacks
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

    // 第三步：准备 System Prompt 和上下文消息
    const systemPrompt = buildSystemPrompt(memory)
    const contextMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-MAX_CONTEXT_ROUNDS * 2),
    ]

    logDebug('agent', 'agent.context.prepared', {
      turnId,
      systemPromptLength: systemPrompt.length,
      contextMessagesCount: contextMessages.length,
    })

    // 第四步：如果是工具意图，先执行工具
    let toolResultText = ''
    if (hasTool(intent)) {
      logInfo('agent', 'agent.tool.detected', { turnId, intent })

      addStep({ type: 'tool.extracting', status: 'running', message: '正在提取参数...' })
      const args = await extractToolArgs(userInput, intent, config)
      completeStep('tool.extracting')
      addStep({
        type: 'tool.calling',
        status: 'running',
        message: `正在调用 ${intent}...`,
        detail: JSON.stringify(args),
      })
      logInfo('agent', 'agent.tool.args', { turnId, intent, args })

      onToolCall(intent, args)

      toolResultText = await executeTool(intent, args)
      completeStep('tool.calling')
      addStep({
        type: 'tool.result',
        status: 'completed',
        message: '已获取工具结果',
        detail: `结果长度：${toolResultText.length} 字`,
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
    'news.search': NEWS_SEARCH_EXTRACTION_PROMPT,
    'strategy.backtest': STRATEGY_BACKTEST_EXTRACTION_PROMPT,
    'stock.profile': STOCK_PROFILE_EXTRACTION_PROMPT,
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
