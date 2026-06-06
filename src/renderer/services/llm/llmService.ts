import { ChatMessage, LLMConfig, ToolCall, ToolDefinition } from '@shared/types'

/**
 * LLM 服务
 * 封装 OpenAI-compatible API（智谱 GLM / Kimi 等）的流式调用和配置验证
 */

export interface StreamCallbacks {
  onChunk: (content: string) => void
  onToolCall?: (toolCall: ToolCall) => void
  onError?: (error: string) => void
  onDone?: () => void
}

/**
 * 流式对话请求
 * @param messages 消息历史
 * @param config LLM 配置
 * @param tools 可选的工具定义列表
 * @param callbacks 流式回调
 */
export const streamChat = async (
  messages: ChatMessage[],
  config: LLMConfig,
  tools: ToolDefinition[] | undefined,
  callbacks: StreamCallbacks
): Promise<void> => {
  const { onChunk, onToolCall, onError, onDone } = callbacks

  try {
    const body: Record<string, unknown> = {
      model: config.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
      })),
      temperature: config.temperature,
      stream: true,
    }

    if (tools && tools.length > 0) {
      body.tools = tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }))
    }

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '未知错误')
      throw new Error(`API 错误 (${response.status}): ${errText}`)
    }

    if (!response.body) {
      throw new Error('响应体为空')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed === 'data: [DONE]') continue
        if (!trimmed.startsWith('data: ')) continue

        const jsonStr = trimmed.slice(6)
        try {
          const chunk = JSON.parse(jsonStr)
          const delta = chunk.choices?.[0]?.delta
          if (!delta) continue

          // 文本内容
          if (delta.content) {
            onChunk(delta.content)
          }

          // 工具调用
          if (delta.tool_calls && onToolCall) {
            for (const tc of delta.tool_calls) {
              onToolCall(tc as ToolCall)
            }
          }
        } catch {
          // 忽略解析失败的 chunk
        }
      }
    }

    onDone?.()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    onError?.(msg)
    onDone?.()
  }
}

/**
 * 验证 LLM 配置是否有效
 * 发起一个最小化 chat 请求测试 API Key，兼容所有 OpenAI-compatible 接口
 */
export const validateConfig = async (config: LLMConfig): Promise<{ valid: boolean; error?: string }> => {
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '未知错误')
      return { valid: false, error: `验证失败 (${response.status}): ${errText}` }
    }

    return { valid: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { valid: false, error: `网络错误: ${msg}` }
  }
}
