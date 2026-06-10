/**
 * Embedding Service 单元测试
 * 测试 fallback 伪向量生成逻辑
 * 直接运行：node test/embedding-service.test.mjs
 *
 * 注意：真实 transformers.js 模型加载需要 Electron 环境，
 * 此测试只覆盖 fallbackEmbedding 纯函数逻辑
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

// 复制 fallbackEmbedding 逻辑（因为它是模块内 private 函数）
const VECTOR_DIMENSION = 512

const fallbackEmbedding = (text) => {
  const vector = new Array(VECTOR_DIMENSION).fill(0)
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    vector[i % VECTOR_DIMENSION] += code
  }
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
  return norm > 0 ? vector.map((v) => v / norm) : vector
}

console.log('\n🧮 Embedding Service Tests\n')

// === 向量维度测试 ===
console.log('--- 向量维度 ---')
const v1 = fallbackEmbedding('测试文本')
assert('fallback 向量维度 = 512', v1.length === 512)

// === 归一化测试 ===
console.log('\n--- 归一化 ---')
const norm = Math.sqrt(v1.reduce((sum, v) => sum + v * v, 0))
assert('归一化后 L2 范数 ≈ 1', Math.abs(norm - 1) < 0.0001)

// === 空文本边界 ===
console.log('\n--- 空文本 ---')
const v2 = fallbackEmbedding('')
assert('空文本返回零向量', v2.every((v) => v === 0))

// === 确定性 ===
console.log('\n--- 确定性 ---')
const v3 = fallbackEmbedding('确定性测试')
const v4 = fallbackEmbedding('确定性测试')
assert('相同输入产生相同输出', v3.every((v, i) => v === v4[i]))

// === 不同输入产生不同输出 ===
console.log('\n--- 区分性 ---')
const v5 = fallbackEmbedding('宁德时代')
const v6 = fallbackEmbedding('贵州茅台')
const dotProduct = v5.reduce((sum, v, i) => sum + v * v6[i], 0)
assert('不同文本的余弦相似度 < 1', dotProduct < 0.999)

// === 中文支持 ===
console.log('\n--- 中文支持 ---')
const v7 = fallbackEmbedding('中文测试')
assert('中文文本不崩溃', v7.length === 512)
assert('中文文本归一化正确', Math.abs(Math.sqrt(v7.reduce((s, v) => s + v * v, 0)) - 1) < 0.0001)

// === 长文本测试 ===
console.log('\n--- 长文本 ---')
const longText = '这是一段很长的文本'.repeat(100)
const v8 = fallbackEmbedding(longText)
assert('超长文本不崩溃', v8.length === 512)
assert('超长文本归一化正确', Math.abs(Math.sqrt(v8.reduce((s, v) => s + v * v, 0)) - 1) < 0.0001)

// === 向量值范围 ===
console.log('\n--- 值范围 ---')
const v9 = fallbackEmbedding('范围测试')
assert('所有值在 [-1, 1] 范围内', v9.every((v) => v >= -1 && v <= 1))

console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败\n`)
process.exit(fail > 0 ? 1 : 0)
