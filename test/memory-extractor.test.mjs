/**
 * Memory Extractor 单元测试
 * 测试 LLM 返回结果的解析逻辑
 * 直接运行：node test/memory-extractor.test.mjs
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

// 复制 memoryExtractor 的核心解析逻辑
const parseFragments = (content) => {
  const jsonMatch = content.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []

  const parsed = JSON.parse(jsonMatch[0])
  if (!Array.isArray(parsed)) return []

  return parsed
    .filter((item) => {
      if (typeof item !== 'object' || item === null) return false
      return typeof item.content === 'string' && item.content.trim().length > 0
    })
    .map((item, index) => {
      const rawCategory = String(item.category || 'general').toLowerCase()
      const validCategories = ['stock', 'market', 'strategy', 'preference', 'general']
      const category = validCategories.includes(rawCategory) ? rawCategory : 'general'

      const rawImportance = Number(item.importance || 3)
      const importance = Math.max(1, Math.min(5, rawImportance))

      return {
        id: `frag-${Date.now()}-${index}`,
        content: String(item.content).trim().slice(0, 200),
        category,
        importance,
      }
    })
}

console.log('\n🧠 Memory Extractor Tests\n')

// === 正常 LLM 响应解析 ===
console.log('--- 正常解析 ---')

const response1 = `[{"content":"宁德时代 Q2 财报超预期","category":"stock","importance":4},{"content":"我比较激进","category":"preference","importance":5}]`
const result1 = parseFragments(response1)
assert('解析 2 条片段', result1.length === 2)
assert('第一条 category=stock', result1[0].category === 'stock')
assert('第一条 importance=4', result1[0].importance === 4)
assert('第二条 category=preference', result1[1].category === 'preference')
assert('第二条 importance=5', result1[1].importance === 5)

// === 带 markdown 代码块的响应 ===
console.log('\n--- Markdown 包裹 ---')
const response2 = '```json\n[{"content":"测试","category":"stock","importance":3}]\n```'
const result2 = parseFragments(response2)
assert('解析 markdown 包裹的 JSON', result2.length === 1)

// === 无效 category 降级 ===
console.log('\n--- Category 降级 ---')
const response3 = `[{"content":"测试","category":"invalid_category","importance":3}]`
const result3 = parseFragments(response3)
assert('无效 category 降级为 general', result3[0].category === 'general')

// === importance 越界修正 ===
console.log('\n--- Importance 越界 ---')
const response4 = `[{"content":"太高","category":"stock","importance":10},{"content":"太低","category":"stock","importance":-1},{"content":"缺省","category":"stock"}]`
const result4 = parseFragments(response4)
assert('importance=10 截断为 5', result4[0].importance === 5)
assert('importance=-1 截断为 1', result4[1].importance === 1)
assert('缺省 importance=3', result4[2].importance === 3)

// === 空 content 过滤 ===
console.log('\n--- 空 content 过滤 ---')
const response5 = `[{"content":"","category":"stock","importance":3},{"content":"  ","category":"stock","importance":3},{"content":"有效","category":"stock","importance":3}]`
const result5 = parseFragments(response5)
assert('空字符串被过滤', result5.length === 1)
assert('保留有效内容', result5[0].content === '有效')

// === 非对象项过滤 ===
console.log('\n--- 非对象过滤 ---')
const response6 = `[null,"string",123,{"content":"有效","category":"stock","importance":3}]`
const result6 = parseFragments(response6)
assert('null/string/number 被过滤', result6.length === 1)

// === 空数组 ===
console.log('\n--- 空数组 ---')
const response7 = `[]`
const result7 = parseFragments(response7)
assert('空数组返回空', result7.length === 0)

// === 无 JSON 匹配 ===
console.log('\n--- 无 JSON ---')
const response8 = `没有找到任何有价值的记忆片段`
const result8 = parseFragments(response8)
assert('无 JSON 返回空', result8.length === 0)

// === content 截断 ===
console.log('\n--- Content 截断 ---')
const longContent = '这是一段很长的内容'.repeat(20)
const response9 = `[{"content":"${longContent}","category":"stock","importance":3}]`
const result9 = parseFragments(response9)
assert('content 截断到 200 字符', result9[0].content.length <= 200)

// === 消息过滤和截断逻辑 ===
console.log('\n--- 消息预处理 ---')

const MAX_MESSAGE_LENGTH = 500
const MAX_HISTORY_MESSAGES = 20

const preprocessMessages = (messages) => {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({
      role: m.role === 'user' ? '用户' : '助手',
      content: m.content.slice(0, MAX_MESSAGE_LENGTH),
    }))
}

// Given: 包含 system/tool 消息
const messages1 = [
  { role: 'system', content: '系统提示' },
  { role: 'user', content: '用户输入' },
  { role: 'assistant', content: '助手回复' },
  { role: 'tool', content: '工具结果' },
]
const processed1 = preprocessMessages(messages1)
assert('过滤 system/tool 消息', processed1.length === 2)
assert('只保留 user 和 assistant', processed1.every((m) => ['用户', '助手'].includes(m.role)))

// Given: 超过 20 条消息
const messages2 = Array.from({ length: 30 }, (_, i) => ({
  role: i % 2 === 0 ? 'user' : 'assistant',
  content: `消息 ${i}`,
}))
const processed2 = preprocessMessages(messages2)
assert('超过 20 条截取最近 20 条', processed2.length === 20)
assert('截取最后 20 条', processed2[0].content === '消息 10')

// Given: 超长内容截断
const messages3 = [
  { role: 'user', content: 'A'.repeat(1000) },
]
const processed3 = preprocessMessages(messages3)
assert('内容截断到 500 字符', processed3[0].content.length === 500)

console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败\n`)
process.exit(fail > 0 ? 1 : 0)
