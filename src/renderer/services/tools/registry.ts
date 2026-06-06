import { IntentType } from '@shared/types'

/**
 * 工具注册表
 * 按意图类型注册工具执行函数
 */

export type ToolExecutor = (args: Record<string, unknown>) => string | Promise<string>

interface ToolEntry {
  name: string
  description: string
  executor: ToolExecutor
}

const registry = new Map<IntentType, ToolEntry>()

/**
 * 注册工具
 */
export const registerTool = (
  intent: IntentType,
  name: string,
  description: string,
  executor: ToolExecutor
): void => {
  registry.set(intent, { name, description, executor })
}

/**
 * 获取工具执行器
 */
export const getToolExecutor = (intent: IntentType): ToolExecutor | undefined => {
  return registry.get(intent)?.executor
}

/**
 * 执行工具
 */
export const executeTool = async (
  intent: IntentType,
  args: Record<string, unknown>
): Promise<string> => {
  const executor = getToolExecutor(intent)
  if (!executor) {
    return `暂不支持 ${intent} 工具`
  }
  try {
    const result = await executor(args)
    return result
  } catch (err) {
    return `工具执行错误: ${err instanceof Error ? err.message : String(err)}`
  }
}

/**
 * 检查意图是否有对应的工具
 */
export const hasTool = (intent: IntentType): boolean => {
  return registry.has(intent)
}
