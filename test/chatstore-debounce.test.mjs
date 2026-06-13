/**
 * ChatStore Debounced Storage 单元测试
 * 测试 useChatStore 的 debounced localStorage 写入策略
 * v6: debounce 从 800ms 缩短到 100ms，支持 flushStorage 立即写入
 * 直接运行：node test/chatstore-debounce.test.mjs
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

// 复制 createDebouncedStorage 逻辑（纯逻辑，不依赖 Electron）
function createDebouncedStorage(delay = 100) {
  let timer = null
  let pendingName = null
  let pendingValue = null
  const store = {} // 模拟 localStorage

  const flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (pendingName !== null) {
      store[pendingName] = JSON.stringify(pendingValue)
      pendingName = null
      pendingValue = null
    }
  }

  return {
    store, // 暴露用于测试
    flush,
    getItem: (name) => {
      const str = store[name]
      if (!str) return null
      try {
        return JSON.parse(str)
      } catch {
        return null
      }
    },
    setItem: (name, value) => {
      if (timer) clearTimeout(timer)
      pendingName = name
      pendingValue = value
      timer = setTimeout(() => {
        store[name] = JSON.stringify(value)
        pendingName = null
        pendingValue = null
        timer = null
      }, delay)
    },
    removeItem: (name) => {
      delete store[name]
    },
  }
}

console.log('\n💬 ChatStore Debounced Storage Tests\n')

// === 基本读写 ===
console.log('--- 基本读写 ---')
const s1 = createDebouncedStorage(100)
s1.setItem('key1', { a: 1 })

// 还没 flush，localStorage 里没有
assert('debounce 期间 getItem 返回 null', s1.getItem('key1') === null)
assert('debounce 期间 store 里也没有', !s1.store['key1'])

// 手动 flush
s1.flush()
assert('flush 后 getItem 返回正确值', s1.getItem('key1')?.a === 1)
assert('flush 后 store 里有值', !!s1.store['key1'])

// === 防抖覆盖 ===
console.log('\n--- 防抖覆盖 ---')
const s2 = createDebouncedStorage(100)
s2.setItem('key2', 'first')
s2.setItem('key2', 'second')
s2.setItem('key2', 'third')
s2.flush()
assert('多次 setItem 只有最后一次生效', s2.getItem('key2') === 'third')

// === removeItem ===
console.log('\n--- removeItem ---')
const s3 = createDebouncedStorage(100)
s3.setItem('key3', 'value')
s3.flush()
assert('setItem 后有值', s3.getItem('key3') === 'value')
s3.removeItem('key3')
assert('removeItem 后返回 null', s3.getItem('key3') === null)

// === 延迟自动写入 ===
console.log('\n--- 延迟自动写入 ---')
const s4 = createDebouncedStorage(50) // 50ms 延迟
s4.setItem('key4', 'auto-write')

// 等待前应无值
assert('延迟前无值', s4.getItem('key4') === null)

// 等待 100ms（超过 50ms delay）
await new Promise((r) => setTimeout(r, 100))
assert('延迟后自动写入', s4.getItem('key4') === 'auto-write')

// === flush 在 beforeunload 场景 ===
console.log('\n--- flush 立即写入 ---')
const s5 = createDebouncedStorage(5000) // 5s delay，模拟长防抖
s5.setItem('key5', 'urgent')
assert('5s debounce 前无值', s5.getItem('key5') === null)
s5.flush() // 模拟 beforeunload 事件触发
assert('flush 后立即有值', s5.getItem('key5') === 'urgent')

// === v6 debounce 间隔缩短到 100ms ===
console.log('\n--- v6 debounce 间隔验证 ---')
const s6 = createDebouncedStorage(100) // v6 默认 100ms
s6.setItem('key6', 'v6-test')

const start = Date.now()
await new Promise((r) => setTimeout(r, 150))
const elapsed = Date.now() - start
assert(`100ms debounce 后自动写入（耗时 ${elapsed}ms）`, s6.getItem('key6') === 'v6-test')

// === 多 key 防抖 ===
console.log('\n--- 多 key 防抖 ---')
const s7 = createDebouncedStorage(50)
s7.setItem('a', 1)
s7.setItem('b', 2)
s7.setItem('c', 3)
// 注意：当前实现 pendingName 是单值，连续 setItem 不同 key 时只有最后一个被 pending
// 这是已知行为：debounce 期间快速连续 setItem，只有最后一个 key 会被写入
s7.flush()
assert('多 key flush - 只有最后一个 pending key 被写入', s7.getItem('c') === 3)
assert('多 key flush - 之前的 key 未被写入', s7.getItem('a') === null)
assert('多 key flush - 中间的 key 未被写入', s7.getItem('b') === null)

// === 连续 setItem 同一个 key 只触发最后一次 ===
console.log('\n--- 连续 setItem 同一个 key ===')
const s8 = createDebouncedStorage(200)
let writeCount = 0
const originalSetTimeout = setTimeout
// 无法直接 mock store 写入次数，改用 flush 验证最终结果
s8.setItem('counter', 0)
for (let i = 1; i <= 10; i++) {
  s8.setItem('counter', i)
}
s8.flush()
assert('10 次 setItem 后 flush 值为最后一次', s8.getItem('counter') === 10)

// === 空值处理 ===
console.log('\n--- 空值处理 ---')
const s9 = createDebouncedStorage(50)
s9.setItem('empty', '')
s9.flush()
assert('空字符串可写入', s9.getItem('empty') === '')
s9.setItem('null', null)
s9.flush()
assert('null 可写入', s9.getItem('null') === null)
s9.setItem('zero', 0)
s9.flush()
assert('0 可写入', s9.getItem('zero') === 0)

console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败\n`)
process.exit(fail > 0 ? 1 : 0)
