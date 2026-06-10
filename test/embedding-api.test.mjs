/**
 * Embedding API 调用单元测试
 * 测试智谱 Embedding API 的 mock 调用、批量分块、并发控制、降级逻辑
 * 直接运行：node test/embedding-api.test.mjs
 */

let pass = 0
let fail = 0

function assert(name, condition) {
  if (condition) {
    console.log(`  ✅ ${name}`)
    pass++
  } else {
    console.log(`  ❌ ${name}`)
    fail++
  }
}

// === 复制核心纯逻辑 ===

const DEFAULT_DIMENSION = 512

const fallbackEmbedding = (text, dimension) => {
  const vector = new Array(dimension).fill(0)
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    vector[i % dimension] += code
  }
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
  return norm > 0 ? vector.map((v) => v / norm) : vector
}

const chunkTexts = (texts, chunkSize) => {
  const chunks = []
  for (let i = 0; i < texts.length; i += chunkSize) {
    chunks.push(texts.slice(i, i + chunkSize))
  }
  return chunks
}

// 模拟 callEmbeddingAPI（依赖 fetch）
const callEmbeddingAPI = async (texts, config) => {
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

  const embeddings = data.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding)

  if (embeddings.length !== texts.length) {
    throw new Error(
      `Embedding API returned ${embeddings.length} embeddings, expected ${texts.length}`
    )
  }

  return embeddings
}

// 模拟 generateEmbeddings（简化版，不依赖 zustand store）
const generateEmbeddings = async (texts, config) => {
  const MAX_BATCH_SIZE = 64
  const MAX_CONCURRENT_CHUNKS = 3

  if (!config.apiKey) {
    return texts.map((t) => fallbackEmbedding(t, config.dimensions))
  }

  const validIndices = []
  const validTexts = []
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
    const allEmbeddings = []

    for (let i = 0; i < chunks.length; i += MAX_CONCURRENT_CHUNKS) {
      const batch = chunks.slice(i, i + MAX_CONCURRENT_CHUNKS)
      const results = await Promise.all(
        batch.map((chunk) => callEmbeddingAPI(chunk, config))
      )
      results.forEach((r) => allEmbeddings.push(...r))
    }

    const output = texts.map((t) => fallbackEmbedding(t, config.dimensions))
    validIndices.forEach((origIdx, validIdx) => {
      output[origIdx] = allEmbeddings[validIdx]
    })

    return output
  } catch (err) {
    return texts.map((t) => fallbackEmbedding(t, config.dimensions))
  }
}

// === Mock fetch 工具 ===
let fetchCalls = []
let fetchMock = null

const setupMockFetch = (impl) => {
  fetchCalls = []
  fetchMock = async (...args) => {
    fetchCalls.push(args)
    return impl(...args)
  }
  global.fetch = fetchMock
}

const resetMockFetch = () => {
  fetchCalls = []
  fetchMock = null
  delete global.fetch
}

// === 测试开始 ===

console.log('\n🌐 Embedding API Tests\n')

// --- 单条成功 ---
console.log('--- 单条成功 ---')
setupMockFetch(async () => ({
  ok: true,
  json: async () => ({
    data: [{ index: 0, embedding: Array(512).fill(0.1) }],
  }),
}))

const result1 = await generateEmbeddings(['宁德时代财报'], {
  apiKey: 'test-key',
  baseUrl: 'https://test.com',
  model: 'embedding-3',
  dimensions: 512,
})
assert('单条返回 1 个向量', result1.length === 1)
assert('单条向量维度 = 512', result1[0].length === 512)
assert('单条 fetch 调用 1 次', fetchCalls.length === 1)
assert('请求体包含 dimensions=512', JSON.parse(fetchCalls[0][1].body).dimensions === 512)
resetMockFetch()

// --- 批量分块 ---
console.log('\n--- 批量分块 ---')
setupMockFetch(async () => ({
  ok: true,
  json: async () => ({
    data: Array.from({ length: 64 }, (_, i) => ({
      index: i,
      embedding: Array(512).fill(i / 100),
    })),
  }),
}))

const texts65 = Array.from({ length: 65 }, (_, i) => `文本${i}`)
const result2 = await generateEmbeddings(texts65, {
  apiKey: 'test-key',
  baseUrl: 'https://test.com',
  model: 'embedding-3',
  dimensions: 512,
})
assert('65 条返回 65 个向量', result2.length === 65)
assert('65 条分 2 次 fetch 调用', fetchCalls.length === 2)
assert('第一块 64 条', JSON.parse(fetchCalls[0][1].body).input.length === 64)
assert('第二块 1 条', JSON.parse(fetchCalls[1][1].body).input.length === 1)
resetMockFetch()

// --- 并发控制 ---
console.log('\n--- 并发控制 ---')
let concurrentCount = 0
let maxConcurrent = 0

setupMockFetch(async () => {
  concurrentCount++
  maxConcurrent = Math.max(maxConcurrent, concurrentCount)
  await new Promise((r) => setTimeout(r, 10))
  concurrentCount--
  return {
    ok: true,
    json: async () => ({
      data: Array.from({ length: 64 }, (_, i) => ({
        index: i,
        embedding: Array(512).fill(0.1),
      })),
    }),
  }
})

// 130 条 = 3 个 64 条 chunk，但并发限制为 3，所以应一次性并发 3 个
const texts130 = Array.from({ length: 130 }, (_, i) => `文本${i}`)
await generateEmbeddings(texts130, {
  apiKey: 'test-key',
  baseUrl: 'https://test.com',
  model: 'embedding-3',
  dimensions: 512,
})
assert('130 条（3 chunk）最大并发 = 3', maxConcurrent === 3)
resetMockFetch()

// --- 空文本过滤 ---
console.log('\n--- 空文本过滤 ---')
setupMockFetch(async () => ({
  ok: true,
  json: async () => ({
    data: [
      { index: 0, embedding: Array(512).fill(0.2) },
      { index: 1, embedding: Array(512).fill(0.3) },
    ],
  }),
}))

const mixedTexts = ['有效文本1', '', '   ', '有效文本2']
const result3 = await generateEmbeddings(mixedTexts, {
  apiKey: 'test-key',
  baseUrl: 'https://test.com',
  model: 'embedding-3',
  dimensions: 512,
})
assert('4 条输入返回 4 个向量', result3.length === 4)
assert('空文本使用 fallback', JSON.stringify(result3[1]) === JSON.stringify(fallbackEmbedding('', 512)))
assert('空格文本使用 fallback', JSON.stringify(result3[2]) === JSON.stringify(fallbackEmbedding('   ', 512)))
assert('有效文本1 使用 API', result3[0][0] === 0.2)
assert('有效文本2 使用 API', result3[3][0] === 0.3)
assert('fetch 只调用 1 次（2 条有效）', fetchCalls.length === 1)
resetMockFetch()

// --- API 401 降级 ---
console.log('\n--- API 401 降级 ---')
setupMockFetch(async () => ({
  ok: false,
  status: 401,
  text: async () => 'Unauthorized',
}))

const result4 = await generateEmbeddings(['测试'], {
  apiKey: 'wrong-key',
  baseUrl: 'https://test.com',
  model: 'embedding-3',
  dimensions: 512,
})
assert('401 错误降级 fallback', result4.length === 1)
assert('401 降级向量维度 = 512', result4[0].length === 512)
resetMockFetch()

// --- API 返回向量数量不一致 ---
console.log('\n--- 返回数量不一致 ---')
setupMockFetch(async () => ({
  ok: true,
  json: async () => ({
    data: [{ index: 0, embedding: Array(512).fill(0.1) }], // 只返回 1 个，但请求了 2 个
  }),
}))

const result5 = await generateEmbeddings(['文本1', '文本2'], {
  apiKey: 'test-key',
  baseUrl: 'https://test.com',
  model: 'embedding-3',
  dimensions: 512,
})
assert('数量不一致降级 fallback', result5.length === 2)
assert('数量不一致后全部 fallback', JSON.stringify(result5[0]) === JSON.stringify(fallbackEmbedding('文本1', 512)))
resetMockFetch()

// --- API Key 为空直接 fallback ---
console.log('\n--- API Key 为空 ---')
const result6 = await generateEmbeddings(['测试'], {
  apiKey: '',
  baseUrl: 'https://test.com',
  model: 'embedding-3',
  dimensions: 512,
})
assert('空 API Key 直接 fallback', result6.length === 1)
assert('空 API Key 不发起 fetch', fetchCalls.length === 0)
resetMockFetch()

// --- 全部空文本 ---
console.log('\n--- 全部空文本 ---')
const result7 = await generateEmbeddings(['', '  ', '\t'], {
  apiKey: 'test-key',
  baseUrl: 'https://test.com',
  model: 'embedding-3',
  dimensions: 512,
})
assert('全部空文本返回 3 个 fallback', result7.length === 3)
assert('全部空文本不发起 fetch', fetchCalls.length === 0)
resetMockFetch()

console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败\n`)
process.exit(fail > 0 ? 1 : 0)
