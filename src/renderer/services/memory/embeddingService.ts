/**
 * Embedding 服务
 * v5.1: 从本地 transformers.js 切换为智谱 Embedding-3 API
 * 支持批量调用、自动分块、并发控制、API 失败降级
 */

import { logInfo, logWarn, logError } from '../logger/logger'
import { usePreferenceStore } from '../../stores/usePreferenceStore'

const DEFAULT_DIMENSION = 512
const DEFAULT_MODEL = 'embedding-3'
const MAX_BATCH_SIZE = 64
const MAX_CONCURRENT_CHUNKS = 3

interface EmbeddingConfig {
  apiKey: string
  baseUrl: string
  model: string
  dimensions: number
}

/**
 * 从 PreferenceStore 获取 Embedding 配置
 */
const getEmbeddingConfig = (): EmbeddingConfig => {
  const { llmConfig } = usePreferenceStore.getState()
  return {
    apiKey: llmConfig.apiKey || '',
    baseUrl: llmConfig.baseUrl || 'https://open.bigmodel.cn/api/paas/v4',
    model: llmConfig.embeddingModel || DEFAULT_MODEL,
    dimensions: llmConfig.embeddingDimensions || DEFAULT_DIMENSION,
  }
}

/**
 * Fallback 伪 Embedding（当 API 调用失败时使用）
 * 基于字符编码的哈希向量，不具备真实语义能力，但能让功能通路跑通
 */
const fallbackEmbedding = (text: string, dimension: number): number[] => {
  const vector = new Array(dimension).fill(0)
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    vector[i % dimension] += code
  }
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
  return norm > 0 ? vector.map((v) => v / norm) : vector
}

/**
 * 内部：调用智谱 Embedding API
 */
const callEmbeddingAPI = async (
  texts: string[],
  config: EmbeddingConfig
): Promise<number[][]> => {
  const url = `${config.baseUrl}/embeddings`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      input: texts,
      dimensions: config.dimensions,
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Embedding API ${response.status}: ${errText.slice(0, 200)}`)
  }

  const data = await response.json()

  if (!data.data || !Array.isArray(data.data)) {
    throw new Error('Embedding API response missing data array')
  }

  const embeddings = (data.data as Array<{ index: number; embedding: number[] }>)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding)

  if (embeddings.length !== texts.length) {
    throw new Error(
      `Embedding API returned ${embeddings.length} embeddings, expected ${texts.length}`
    )
  }

  return embeddings
}

/**
 * 将文本数组分块，控制单次批量大小
 */
const chunkTexts = (texts: string[], chunkSize: number): string[][] => {
  const chunks: string[][] = []
  for (let i = 0; i < texts.length; i += chunkSize) {
    chunks.push(texts.slice(i, i + chunkSize))
  }
  return chunks
}

/**
 * 将文本转换为向量
 * @param text 输入文本
 * @returns 归一化向量（维度由配置决定，默认 512）
 */
export const generateEmbedding = async (text: string): Promise<number[]> => {
  const vectors = await generateEmbeddings([text])
  return vectors[0]
}

/**
 * 批量生成向量（性能优化关键）
 * - 单次最多 64 条（智谱限制）
 * - 超过 64 条自动分块
 * - 并发控制：最多 3 个 chunk 同时请求
 * - 自动过滤空文本
 * @param texts 文本数组
 * @returns 向量数组（顺序与输入一致）
 */
export const generateEmbeddings = async (texts: string[]): Promise<number[][]> => {
  const config = getEmbeddingConfig()

  if (!config.apiKey) {
    logWarn('memory', 'embedding.noApiKey', { error: 'API Key 未配置，使用 fallback 向量' })
    return texts.map((t) => fallbackEmbedding(t, config.dimensions))
  }

  // 过滤空文本，但保留原顺序占位
  const validIndices: number[] = []
  const validTexts: string[] = []
  texts.forEach((t, i) => {
    if (t.trim().length > 0) {
      validIndices.push(i)
      validTexts.push(t)
    }
  })

  if (validTexts.length === 0) {
    return texts.map((t) => fallbackEmbedding(t, config.dimensions))
  }

  try {
    const chunks = chunkTexts(validTexts, MAX_BATCH_SIZE)
    const allEmbeddings: number[][] = []

    // 按 MAX_CONCURRENT_CHUNKS 分批并发
    for (let i = 0; i < chunks.length; i += MAX_CONCURRENT_CHUNKS) {
      const batch = chunks.slice(i, i + MAX_CONCURRENT_CHUNKS)
      const results = await Promise.all(
        batch.map((chunk) => callEmbeddingAPI(chunk, config))
      )
      results.forEach((r) => allEmbeddings.push(...r))
    }

    // 回填到原始顺序
    const output: number[][] = texts.map((t) => fallbackEmbedding(t, config.dimensions))
    validIndices.forEach((origIdx, validIdx) => {
      output[origIdx] = allEmbeddings[validIdx]
    })

    logInfo('memory', 'embedding.batchSuccess', {
      total: texts.length,
      valid: validTexts.length,
      chunks: chunks.length,
    })

    return output
  } catch (err) {
    logError('memory', 'embedding.batchApiFailed', { error: String(err) })
    console.warn('[Embedding] 批量 API 调用失败，全部使用 fallback 伪向量')
    return texts.map((t) => fallbackEmbedding(t, config.dimensions))
  }
}

/**
 * 预加载模型（云端模型无需预加载，保留接口兼容）
 */
export const preloadModel = async (): Promise<void> => {
  // 云端模型无需预加载
}

/**
 * 检查模型是否加载中（云端模型始终未在加载，保留接口兼容）
 */
export const isModelLoading = (): boolean => false

/**
 * 检查模型是否已加载（云端模型始终就绪，保留接口兼容）
 */
export const isModelReady = (): boolean => true

/**
 * 获取向量维度
 */
export const getVectorDimension = (): number => {
  return getEmbeddingConfig().dimensions
}
