/**
 * Mutex 并发控制单元测试
 * 测试 vectorStore 中 Mutex 类的正确性
 * 直接运行：node test/mutex.test.mjs
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

// 复制 Mutex 实现
class Mutex {
  #locked = false
  #queue = []

  async acquire() {
    if (!this.#locked) {
      this.#locked = true
      return
    }
    return new Promise((resolve) => {
      this.#queue.push(resolve)
    })
  }

  release() {
    if (this.#queue.length > 0) {
      const next = this.#queue.shift()
      next()
    } else {
      this.#locked = false
    }
  }

  // 测试辅助方法
  get isLocked() { return this.#locked }
  get queueLength() { return this.#queue.length }
}

console.log('\n🔒 Mutex Tests\n')

// === 基本获取/释放 ===
console.log('--- 基本操作 ---')
const m1 = new Mutex()
assert('初始状态未锁定', !m1.isLocked)
await m1.acquire()
assert('acquire 后锁定', m1.isLocked)
m1.release()
assert('release 后解锁', !m1.isLocked)

// === 互斥：第二个 acquire 排队 ===
console.log('\n--- 互斥排队 ---')
const m2 = new Mutex()
let order = []

await m2.acquire()
order.push('A-acquired')

// 启动第二个 acquire（会排队）
const p2 = m2.acquire().then(() => order.push('B-acquired'))

assert('A 持有时 B 排队', m2.queueLength === 1)
assert('B 还没获取', !order.includes('B-acquired'))

// 释放 A
m2.release()
await p2
assert('A 释放后 B 获取', order.includes('B-acquired'))
m2.release()

// === 执行顺序保证 ===
console.log('\n--- 执行顺序 ---')
const m3 = new Mutex()
let seq = []

await m3.acquire()
seq.push(1)

const p3a = m3.acquire().then(() => seq.push(2))
const p3b = m3.acquire().then(() => seq.push(3))

m3.release() // 让 2 获取
await p3a
m3.release() // 让 3 获取
await p3b
m3.release()

assert('FIFO 顺序：1,2,3', seq[0] === 1 && seq[1] === 2 && seq[2] === 3)

// === 并发写模拟 ===
console.log('\n--- 并发写模拟 ---')
const m4 = new Mutex()
let counter = 0

const increment = async (id) => {
  await m4.acquire()
  const temp = counter
  // 模拟异步操作
  await new Promise((r) => setTimeout(r, 1))
  counter = temp + 1
  m4.release()
}

// 并发 10 次增量
const promises = Array.from({ length: 10 }, (_, i) => increment(i))
await Promise.all(promises)

assert('10 次并发增量结果 = 10', counter === 10)

// === release 不多释放 ===
console.log('\n--- 释放安全 ---')
const m5 = new Mutex()
m5.release() // 未 acquire 就 release
m5.release()
assert('多余 release 不崩溃', true)

await m5.acquire()
assert('多余 release 后仍可 acquire', m5.isLocked)
m5.release()

console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败\n`)
process.exit(fail > 0 ? 1 : 0)
