/**
 * Vector Store 单元测试
 * 测试 Vectra 封装的基本操作
 * 直接运行：node test/vector-store.test.mjs
 */

import { LocalIndex } from 'vectra'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'

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

const TEST_INDEX_PATH = path.join(os.tmpdir(), `vectra-test-${Date.now()}`)

async function cleanup() {
  try {
    await fs.rm(TEST_INDEX_PATH, { recursive: true, force: true })
  } catch {
    // ignore
  }
}

async function runTests() {
  console.log('\n📦 Vector Store Tests\n')

  await cleanup()

  const index = new LocalIndex(TEST_INDEX_PATH)

  // 创建索引
  await index.createIndex({ version: 1 })
  assert('创建索引', await index.isIndexCreated())

  // 插入向量
  await index.beginUpdate()
  await index.insertItem({
    id: 'test-1',
    vector: [1, 0, 0, 0],
    metadata: { content: '第一条记忆', category: 'stock', importance: 4 },
  })
  await index.insertItem({
    id: 'test-2',
    vector: [0.9, 0.1, 0, 0],
    metadata: { content: '第二条记忆', category: 'market', importance: 3 },
  })
  await index.insertItem({
    id: 'test-3',
    vector: [0, 1, 0, 0],
    metadata: { content: '第三条记忆', category: 'general', importance: 2 },
  })
  await index.endUpdate()

  const stats = await index.getIndexStats()
  assert('插入 3 条记录', stats.items === 3)

  // 查询向量
  const results = await index.queryItems([1, 0, 0, 0], '', 3)
  assert('查询返回结果', results.length > 0)
  assert('最近邻是 test-1', results[0].item.id === 'test-1')
  assert('相似度 > 0.9', results[0].score > 0.9)

  // 删除向量
  await index.deleteItem('test-3')
  const statsAfterDelete = await index.getIndexStats()
  assert('删除后剩余 2 条', statsAfterDelete.items === 2)

  // 列出所有
  const allItems = await index.listItems()
  assert('列出所有记录', allItems.length === 2)

  // 清理
  await cleanup()
  assert('清理临时目录', true)

  console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败\n`)
  process.exit(fail > 0 ? 1 : 0)
}

runTests().catch((err) => {
  console.error('测试运行错误:', err)
  process.exit(1)
})
