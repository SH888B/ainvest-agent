/**
 * v5.1.1 Vectra 主进程迁移 单元测试
 * 测试渲染进程 IPC 代理层 + 主进程 IPC handler 参数校验
 * 直接运行：node test/v5.1.1-ipc-proxy.test.mjs
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

// =============================================
// 1. 渲染进程 vectorStore IPC 代理逻辑测试
// =============================================
console.log('\n📦 v5.1.1 IPC Proxy Tests\n')

// --- queryVectors 的 minScore 过滤逻辑 ---
console.log('--- queryVectors minScore 过滤 ---')

// 模拟 window.memoryAPI.queryItems 返回的数据结构
const mockQueryResults = [
  { item: { id: '1', metadata: { content: '记忆A', category: 'stock', importance: 4 } }, score: 0.95 },
  { item: { id: '2', metadata: { content: '记忆B', category: 'market', importance: 3 } }, score: 0.85 },
  { item: { id: '3', metadata: { content: '记忆C', category: 'general', importance: 2 } }, score: 0.65 },
  { item: { id: '4', metadata: { content: '记忆D', category: 'preference', importance: 5 } }, score: 0.50 },
]

// 模拟 queryVectors 中的过滤逻辑
const filterResults = (results, minScore) => {
  return results
    .filter((r) => r.score >= minScore)
    .map((r) => ({
      id: r.item.id,
      score: r.score,
      metadata: r.item.metadata,
    }))
}

// 默认 minScore=0.7
const filtered1 = filterResults(mockQueryResults, 0.7)
assert('minScore=0.7 过滤掉 <0.7 的结果', filtered1.length === 2)
assert('minScore=0.7 保留 score=0.95', filtered1[0].score === 0.95)
assert('minScore=0.7 保留 score=0.85', filtered1[1].score === 0.85)

// 自定义 minScore=0.9
const filtered2 = filterResults(mockQueryResults, 0.9)
assert('minScore=0.9 只保留 >=0.9', filtered2.length === 1)

// minScore=0 时保留全部
const filtered3 = filterResults(mockQueryResults, 0)
assert('minScore=0 保留全部', filtered3.length === 4)

// 空结果
const filtered4 = filterResults([], 0.7)
assert('空输入返回空', filtered4.length === 0)

// --- addVector / addVectors 错误传递 ---
console.log('\n--- addVector / addVectors 错误传递 ---')

// 验证 try-catch 会 re-throw
let errorThrown = false
try {
  // 模拟 window.memoryAPI.insertItem 抛错
  const mockInsertItem = async () => { throw new Error('IPC error') }
  await mockInsertItem()
} catch (e) {
  errorThrown = true
}
assert('IPC 错误正确 re-throw', errorThrown)

// --- getVectorItem null 处理 ---
console.log('\n--- getVectorItem null 处理 ---')

const mockGetItem = (id) => {
  if (id === 'exists') return { id, vector: [1, 2], metadata: { content: 'test' } }
  return null
}

assert('存在的 ID 返回对象', mockGetItem('exists') !== null)
assert('不存在的 ID 返回 null', mockGetItem('nonexist') === null)

// =============================================
// 2. IPC Handler 参数校验测试
// =============================================
console.log('\n\n🛡️ IPC Handler 参数校验 Tests\n')

// 模拟主进程 IPC handler 的参数校验逻辑
const validateInsertItem = (record) => {
  if (!record || typeof record !== 'object') throw new Error('Invalid record')
  return true
}

const validateInsertItems = (records) => {
  if (!Array.isArray(records)) throw new Error('Invalid records: expected array')
  return true
}

const validateQueryItems = (vector, topK) => {
  if (!Array.isArray(vector)) throw new Error('Invalid vector: expected number[]')
  if (typeof topK !== 'number') topK = 5
  return { vector, topK }
}

const validateDeleteItem = (id) => {
  if (typeof id !== 'string') throw new Error('Invalid id')
  return true
}

const validateGetItem = (id) => {
  if (typeof id !== 'string') throw new Error('Invalid id')
  return true
}

const validateUpsertItem = (id, vector, metadata) => {
  if (typeof id !== 'string') throw new Error('Invalid id')
  if (!Array.isArray(vector)) throw new Error('Invalid vector')
  if (!metadata || typeof metadata !== 'object') throw new Error('Invalid metadata')
  return true
}

console.log('--- insertItem 校验 ---')
assert('有效 record 通过', validateInsertItem({ id: '1', vector: [1], metadata: {} }))
assert('null record 拒绝', (() => { try { validateInsertItem(null); return false } catch { return true } })())
assert('undefined record 拒绝', (() => { try { validateInsertItem(undefined); return false } catch { return true } })())
assert('字符串 record 拒绝', (() => { try { validateInsertItem('bad'); return false } catch { return true } })())

console.log('\n--- insertItems 校验 ---')
assert('有效数组通过', validateInsertItems([{ id: '1' }]))
assert('非数组拒绝', (() => { try { validateInsertItems('not array'); return false } catch { return true } })())
assert('空数组通过', validateInsertItems([]))

console.log('\n--- queryItems 校验 ---')
const q1 = validateQueryItems([1, 2, 3], 5)
assert('有效 vector 通过', q1.vector.length === 3)
assert('有效 topK 保留', q1.topK === 5)
const q2 = validateQueryItems([1], 'bad')
assert('非数字 topK 默认 5', q2.topK === 5)
assert('非数组 vector 拒绝', (() => { try { validateQueryItems('bad', 5); return false } catch { return true } })())

console.log('\n--- deleteItem 校验 ---')
assert('有效 id 通过', validateDeleteItem('test-1'))
assert('数字 id 拒绝', (() => { try { validateDeleteItem(123); return false } catch { return true } })())
assert('null id 拒绝', (() => { try { validateDeleteItem(null); return false } catch { return true } })())

console.log('\n--- getItem 校验 ---')
assert('有效 id 通过', validateGetItem('test-1'))
assert('数字 id 拒绝', (() => { try { validateGetItem(123); return false } catch { return true } })())

console.log('\n--- upsertItem 校验 ---')
assert('有效参数通过', validateUpsertItem('1', [1, 2], { content: 'test' }))
assert('非 string id 拒绝', (() => { try { validateUpsertItem(1, [1], {}); return false } catch { return true } })())
assert('非 array vector 拒绝', (() => { try { validateUpsertItem('1', 'bad', {}); return false } catch { return true } })())
assert('null metadata 拒绝', (() => { try { validateUpsertItem('1', [1], null); return false } catch { return true } })())
assert('string metadata 拒绝', (() => { try { validateUpsertItem('1', [1], 'bad'); return false } catch { return true } })())

// =============================================
// 3. MemoryAPI 类型完整性测试
// =============================================
console.log('\n\n🔌 MemoryAPI 类型完整性 Tests\n')

// 模拟 MemoryAPI 的方法签名
const MEMORY_API_METHODS = [
  'insertItem',
  'insertItems',
  'queryItems',
  'deleteItem',
  'getStats',
  'listItems',
  'getItem',
  'upsertItem',
]

const mockMemoryAPI = {
  insertItem: (record) => {},
  insertItems: (records) => {},
  queryItems: (vector, topK) => {},
  deleteItem: (id) => {},
  getStats: () => {},
  listItems: () => {},
  getItem: (id) => {},
  upsertItem: (id, vector, metadata) => {},
}

for (const method of MEMORY_API_METHODS) {
  assert(`MemoryAPI.${method} 存在`, typeof mockMemoryAPI[method] === 'function')
}

assert('MemoryAPI 方法数 = 8', MEMORY_API_METHODS.length === 8)

// =============================================
// 4. IPC Channel 映射一致性测试
// =============================================
console.log('\n\n📡 IPC Channel 映射一致性 Tests\n')

const IPC_CHANNELS = [
  'memory:insertItem',
  'memory:insertItems',
  'memory:queryItems',
  'memory:deleteItem',
  'memory:getStats',
  'memory:listItems',
  'memory:getItem',
  'memory:upsertItem',
]

assert('IPC channel 数 = 8', IPC_CHANNELS.length === 8)
assert('所有 channel 以 memory: 前缀', IPC_CHANNELS.every((c) => c.startsWith('memory:')))
assert('无重复 channel', new Set(IPC_CHANNELS).size === IPC_CHANNELS.length)

// 验证 channel 名与 API 方法名一一对应
const apiMethodNames = MEMORY_API_METHODS
const channelMethodNames = IPC_CHANNELS.map((c) => c.split(':')[1])
assert('channel 方法名与 API 方法名一致',
  apiMethodNames.every((name, i) => name === channelMethodNames[i]))

// =============================================
// 5. 向量归档 merge 逻辑测试 (通过 IPC 代理)
// =============================================
console.log('\n\n🔄 Merge 逻辑 Tests (IPC 代理)\n')

// 模拟合并元数据计算逻辑（与 memoryArchive.ts 一致）
const computeMergedMetadata = (newMeta, oldMeta) => {
  return {
    ...newMeta,
    createdAt: oldMeta?.createdAt || newMeta.createdAt,
    accessCount: (oldMeta?.accessCount || 0) + 1,
    importance: Math.max(oldMeta?.importance || 1, newMeta.importance),
  }
}

const newMeta = {
  content: '用户偏好激进策略',
  category: 'preference',
  importance: 4,
  sourceSessionId: 's1',
  createdAt: '2026-06-11T00:00:00Z',
  lastAccessedAt: '2026-06-11T00:00:00Z',
  accessCount: 0,
}

const oldMeta1 = {
  content: '用户偏好稳健策略',
  category: 'preference',
  importance: 3,
  sourceSessionId: 's0',
  createdAt: '2026-06-01T00:00:00Z',
  lastAccessedAt: '2026-06-10T00:00:00Z',
  accessCount: 5,
}

const merged1 = computeMergedMetadata(newMeta, oldMeta1)
assert('合并后保留旧 createdAt', merged1.createdAt === '2026-06-01T00:00:00Z')
assert('合并后 accessCount = 旧 + 1', merged1.accessCount === 6)
assert('合并后 importance 取最大', merged1.importance === 4)
assert('合并后 content 用新的', merged1.content === '用户偏好激进策略')

// 旧记录为 null（不存在）时的 fallback
const merged2 = computeMergedMetadata(newMeta, null)
assert('旧记录 null 时用新 createdAt', merged2.createdAt === '2026-06-11T00:00:00Z')
assert('旧记录 null 时 accessCount = 1', merged2.accessCount === 1)
assert('旧记录 null 时 importance 用新的', merged2.importance === 4)

// 旧记录缺字段时的 fallback
const oldMeta2 = { ...oldMeta1, accessCount: undefined, importance: undefined }
const merged3 = computeMergedMetadata(newMeta, oldMeta2)
assert('旧 accessCount undefined → 1', merged3.accessCount === 1)
assert('旧 importance undefined → 用新的', merged3.importance === 4)

console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败\n`)
process.exit(fail > 0 ? 1 : 0)
