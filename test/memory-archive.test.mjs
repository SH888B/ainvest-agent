/**
 * Memory Archive 单元测试
 * 测试 fragmentsToUserMemory 和 cleanupExpired 逻辑
 * 直接运行：node test/memory-archive.test.mjs
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

// 复制 fragmentsToUserMemory 逻辑
const fragmentsToUserMemory = (fragments) => {
  const update = {}
  const preferenceContents = fragments
    .filter((f) => f.category === 'preference')
    .map((f) => f.content)
    .join('\n')

  if (preferenceContents.length > 0) {
    const riskKeywords = { 保守: '保守', 稳健: '稳健', 激进: '激进' }
    for (const [keyword, risk] of Object.entries(riskKeywords)) {
      if (preferenceContents.includes(keyword)) {
        update.riskPreference = risk
        break
      }
    }

    const sectorKeywords = ['新能源', '白酒', '医药', '半导体', '人工智能', '光伏', '锂电池', '银行', '保险', '券商']
    const foundSectors = sectorKeywords.filter((s) => preferenceContents.includes(s))
    if (foundSectors.length > 0) {
      update.focusSectors = foundSectors
    }

    const topPreference = fragments
      .filter((f) => f.category === 'preference')
      .sort((a, b) => b.importance - a.importance)[0]
    if (topPreference) {
      update.summary = topPreference.content.slice(0, 100)
    }
  }

  return update
}

console.log('\n🧠 Memory Archive Tests\n')

// === fragmentsToUserMemory 测试 ===
console.log('--- fragmentsToUserMemory ---')

// Given: 包含风险偏好的片段
const fragments1 = [
  { id: '1', content: '我比较激进，喜欢高风险', category: 'preference', importance: 5, sourceSessionId: 's1', createdAt: '2025-01-01', lastAccessedAt: '2025-01-01', accessCount: 0 },
]
const result1 = fragmentsToUserMemory(fragments1)
assert('提取风险偏好 - 激进', result1.riskPreference === '激进')
assert('提取摘要', result1.summary === '我比较激进，喜欢高风险')

// Given: 包含保守偏好
const fragments2 = [
  { id: '2', content: '我偏好稳健投资', category: 'preference', importance: 4, sourceSessionId: 's1', createdAt: '2025-01-01', lastAccessedAt: '2025-01-01', accessCount: 0 },
]
const result2 = fragmentsToUserMemory(fragments2)
assert('提取风险偏好 - 稳健', result2.riskPreference === '稳健')

// Given: 包含关注板块
const fragments3 = [
  { id: '3', content: '我关注新能源和白酒板块', category: 'preference', importance: 4, sourceSessionId: 's1', createdAt: '2025-01-01', lastAccessedAt: '2025-01-01', accessCount: 0 },
]
const result3 = fragmentsToUserMemory(fragments3)
assert('提取关注板块 - 新能源', result3.focusSectors?.includes('新能源'))
assert('提取关注板块 - 白酒', result3.focusSectors?.includes('白酒'))
assert('提取关注板块数量 = 2', result3.focusSectors?.length === 2)

// Given: 非 preference 类别的片段
const fragments4 = [
  { id: '4', content: '宁德时代财报超预期', category: 'stock', importance: 4, sourceSessionId: 's1', createdAt: '2025-01-01', lastAccessedAt: '2025-01-01', accessCount: 0 },
]
const result4 = fragmentsToUserMemory(fragments4)
assert('stock 类别不提取偏好', Object.keys(result4).length === 0)

// Given: 无偏好关键词
const fragments5 = [
  { id: '5', content: '今天天气不错', category: 'preference', importance: 1, sourceSessionId: 's1', createdAt: '2025-01-01', lastAccessedAt: '2025-01-01', accessCount: 0 },
]
const result5 = fragmentsToUserMemory(fragments5)
assert('无风险关键词不提取 riskPreference', result5.riskPreference === undefined)
assert('无板块关键词不提取 focusSectors', result5.focusSectors === undefined)

// Given: 空片段数组
const result6 = fragmentsToUserMemory([])
assert('空数组返回空对象', Object.keys(result6).length === 0)

// Given: 多条 preference 片段，取 importance 最高的作为摘要
const fragments7 = [
  { id: '7a', content: '低优先级偏好', category: 'preference', importance: 2, sourceSessionId: 's1', createdAt: '2025-01-01', lastAccessedAt: '2025-01-01', accessCount: 0 },
  { id: '7b', content: '高优先级偏好：偏好激进投资策略', category: 'preference', importance: 5, sourceSessionId: 's1', createdAt: '2025-01-01', lastAccessedAt: '2025-01-01', accessCount: 0 },
  { id: '7c', content: '中优先级偏好', category: 'preference', importance: 3, sourceSessionId: 's1', createdAt: '2025-01-01', lastAccessedAt: '2025-01-01', accessCount: 0 },
]
const result7 = fragmentsToUserMemory(fragments7)
assert('取 importance 最高的作为摘要', result7.summary === '高优先级偏好：偏好激进投资策略')

// === 过期清理逻辑测试 ===
console.log('\n--- cleanupExpired 逻辑 ---')

const DAY = 24 * 60 * 60 * 1000
const now = Date.now()

// 模拟过期判断逻辑
const shouldExpire = (importance, lastAccessedAt) => {
  const age = now - new Date(lastAccessedAt).getTime()
  if (importance <= 2 && age > 30 * DAY) return true
  if (importance === 3 && age > 90 * DAY) return true
  return false
}

// Given: importance=1, 31天前访问
assert('importance=1, 31天前 → 过期', shouldExpire(1, new Date(now - 31 * DAY).toISOString()))
assert('importance=2, 31天前 → 过期', shouldExpire(2, new Date(now - 31 * DAY).toISOString()))
assert('importance=1, 29天前 → 不过期', !shouldExpire(1, new Date(now - 29 * DAY).toISOString()))
assert('importance=2, 29天前 → 不过期', !shouldExpire(2, new Date(now - 29 * DAY).toISOString()))

// Given: importance=3, 91天前访问
assert('importance=3, 91天前 → 过期', shouldExpire(3, new Date(now - 91 * DAY).toISOString()))
assert('importance=3, 89天前 → 不过期', !shouldExpire(3, new Date(now - 89 * DAY).toISOString()))

// Given: importance>=4 永久保留
assert('importance=4, 365天前 → 不过期', !shouldExpire(4, new Date(now - 365 * DAY).toISOString()))
assert('importance=5, 1000天前 → 不过期', !shouldExpire(5, new Date(now - 1000 * DAY).toISOString()))

console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败\n`)
process.exit(fail > 0 ? 1 : 0)
