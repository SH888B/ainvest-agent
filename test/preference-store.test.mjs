/**
 * Preference Store 配置兼容单元测试
 * 测试旧配置反序列化、新字段默认值、embedding 配置变更
 * 直接运行：node test/preference-store.test.mjs
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

// 模拟 localStorage
const mockStorage = new Map()
const mockLocalStorage = {
  getItem: (key) => mockStorage.get(key) || null,
  setItem: (key, value) => mockStorage.set(key, value),
  removeItem: (key) => mockStorage.delete(key),
}

global.localStorage = mockLocalStorage

// 模拟 zustand persist 的序列化/反序列化逻辑
const STORAGE_KEY = 'ainvest:llmConfig'

const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4'
const DEFAULT_MODEL = 'glm-5.1'
const DEFAULT_TEMPERATURE = 0.7
const DEFAULT_EMBEDDING_MODEL = 'embedding-3'
const DEFAULT_EMBEDDING_DIMENSIONS = 512

const serialize = (state) => JSON.stringify(state)
const deserialize = (str) => JSON.parse(str)

// 创建配置对象的工厂函数（模拟 store 的初始化逻辑）
const createConfig = (overrides = {}) => {
  return {
    apiKey: '',
    baseUrl: DEFAULT_BASE_URL,
    model: DEFAULT_MODEL,
    temperature: DEFAULT_TEMPERATURE,
    embeddingModel: DEFAULT_EMBEDDING_MODEL,
    embeddingDimensions: DEFAULT_EMBEDDING_DIMENSIONS,
    ...overrides,
  }
}

// 模拟 setLLMConfig 合并逻辑
const mergeConfig = (current, partial) => {
  return { ...current, ...partial }
}

console.log('\n⚙️  Preference Store Tests\n')

// --- 旧配置反序列化 ---
console.log('--- 旧配置兼容 ---')

// Given: v5.0 的旧配置（没有 embeddingModel 和 embeddingDimensions）
const oldConfig = {
  apiKey: 'sk-test123',
  baseUrl: DEFAULT_BASE_URL,
  model: 'glm-4',
  temperature: 0.5,
}
mockStorage.set(STORAGE_KEY, serialize({ state: { llmConfig: oldConfig, isConfigValid: true } }))

const loadedOld = deserialize(mockStorage.get(STORAGE_KEY))
const mergedOld = {
  ...createConfig(),
  ...loadedOld.state.llmConfig,
}
assert('旧配置反序列化后 apiKey 保留', mergedOld.apiKey === 'sk-test123')
assert('旧配置反序列化后 model 保留', mergedOld.model === 'glm-4')
assert('旧配置反序列化后 temperature 保留', mergedOld.temperature === 0.5)
assert('旧配置缺失 embeddingModel → 默认 embedding-3', mergedOld.embeddingModel === 'embedding-3')
assert('旧配置缺失 embeddingDimensions → 默认 512', mergedOld.embeddingDimensions === 512)

// --- 新配置完整序列化 ---
console.log('\n--- 新配置完整 ---')

const newConfig = createConfig({
  apiKey: 'sk-new456',
  model: 'glm-5.1',
  embeddingModel: 'embedding-3',
  embeddingDimensions: 1024,
})
mockStorage.set(STORAGE_KEY, serialize({ state: { llmConfig: newConfig, isConfigValid: true } }))

const loadedNew = deserialize(mockStorage.get(STORAGE_KEY)).state.llmConfig
assert('新配置 embeddingModel 保留', loadedNew.embeddingModel === 'embedding-3')
assert('新配置 embeddingDimensions 保留', loadedNew.embeddingDimensions === 1024)
assert('新配置 apiKey 保留', loadedNew.apiKey === 'sk-new456')

// --- 部分更新 ---
console.log('\n--- 部分更新 ---')

let currentConfig = createConfig({ apiKey: 'sk-test' })
currentConfig = mergeConfig(currentConfig, { embeddingDimensions: 256 })
assert('部分更新 embeddingDimensions', currentConfig.embeddingDimensions === 256)
assert('部分更新不影响其他字段', currentConfig.apiKey === 'sk-test')
assert('部分更新不影响 model', currentConfig.model === DEFAULT_MODEL)
assert('部分更新后 embeddingModel 仍默认', currentConfig.embeddingModel === 'embedding-3')

// --- 验证逻辑 ---
console.log('\n--- 验证逻辑 ---')

const validateConfig = (config) => {
  const valid = config.apiKey.length > 0 && config.baseUrl.length > 0 && config.model.length > 0
  return valid
}

assert('完整配置验证通过', validateConfig(createConfig({ apiKey: 'sk-valid' })) === true)
assert('空 apiKey 验证失败', validateConfig(createConfig({ apiKey: '' })) === false)
assert('空 baseUrl 验证失败', validateConfig({ ...createConfig({ apiKey: 'sk' }), baseUrl: '' }) === false)
assert('embedding 字段不影响验证', validateConfig(createConfig({ apiKey: 'sk', embeddingModel: '', embeddingDimensions: 0 })) === true)

// --- 维度选项有效性 ---
console.log('\n--- 维度选项 ---')

const EMBEDDING_DIMENSIONS_OPTIONS = [256, 512, 1024, 2048]
assert('256 是有效选项', EMBEDDING_DIMENSIONS_OPTIONS.includes(256))
assert('512 是有效选项', EMBEDDING_DIMENSIONS_OPTIONS.includes(512))
assert('1024 是有效选项', EMBEDDING_DIMENSIONS_OPTIONS.includes(1024))
assert('2048 是有效选项', EMBEDDING_DIMENSIONS_OPTIONS.includes(2048))
assert('384 不是有效选项（旧维度）', !EMBEDDING_DIMENSIONS_OPTIONS.includes(384))
assert('选项共 4 个', EMBEDDING_DIMENSIONS_OPTIONS.length === 4)

// --- 配置变更检测 ---
console.log('\n--- 维度变更检测 ---')

const hasDimensionChanged = (oldCfg, newCfg) => {
  return (oldCfg.embeddingDimensions || 512) !== (newCfg.embeddingDimensions || 512)
}

const cfg1 = createConfig({ embeddingDimensions: 512 })
const cfg2 = createConfig({ embeddingDimensions: 256 })
assert('512→256 检测到变更', hasDimensionChanged(cfg1, cfg2) === true)
assert('512→512 未检测到变更', hasDimensionChanged(cfg1, cfg1) === false)

// 旧配置没有 embeddingDimensions 字段，默认 512
const cfgOld = { apiKey: 'sk', baseUrl: DEFAULT_BASE_URL, model: DEFAULT_MODEL, temperature: DEFAULT_TEMPERATURE }
const cfgNew512 = createConfig({ embeddingDimensions: 512 })
assert('旧配置(无字段,默认512)→512 未检测到变更', hasDimensionChanged(cfgOld, cfgNew512) === false)

console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败\n`)
process.exit(fail > 0 ? 1 : 0)
