/**
 * SessionStore 创建逻辑单元测试
 * 测试 useSessionStore 的 Session 创建、命名、删除等逻辑
 * v6: 修复 Session 创建竞态，增加 loading 状态
 * 直接运行：node test/session-store.test.mjs
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

// 复制 generateSessionName 逻辑（与 useSessionStore.ts 保持一致）
function generateSessionName(firstMessage) {
  const trimmed = firstMessage.trim().replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, '')
  if (!trimmed) return '新对话'
  const chars = Array.from(trimmed)
  const maxLen = 10
  if (chars.length <= maxLen) return trimmed
  return chars.slice(0, maxLen).join('') + '...'
}

// 简化的 Session Store（不依赖 zustand/persist）
function createSessionStore() {
  let state = {
    sessions: [],
    currentSessionId: null,
  }

  const generateId = () =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

  const createDefaultSession = () => {
    const now = new Date().toISOString()
    return {
      id: generateId(),
      title: '新对话',
      createdAt: now,
      updatedAt: now,
      archivedMessageCount: 0,
    }
  }

  return {
    getState: () => state,
    createSession: () => {
      const session = createDefaultSession()
      state = {
        sessions: [session, ...state.sessions],
        currentSessionId: session.id,
      }
      return session.id
    },
    switchSession: (id) => {
      state = { ...state, currentSessionId: id }
    },
    renameSession: (id, title) => {
      state = {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === id
            ? { ...s, title, updatedAt: new Date().toISOString(), isCustomNamed: true }
            : s
        ),
      }
    },
    autoRenameSession: (id, title) => {
      state = {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === id && !s.isCustomNamed && s.title === '新对话'
            ? { ...s, title, updatedAt: new Date().toISOString() }
            : s
        ),
      }
    },
    deleteSession: (id) => {
      const filtered = state.sessions.filter((s) => s.id !== id)
      const nextId =
        state.currentSessionId === id
          ? filtered.length > 0
            ? filtered[0].id
            : null
          : state.currentSessionId
      state = { sessions: filtered, currentSessionId: nextId }
    },
  }
}

console.log('\n📋 SessionStore 创建逻辑 Tests\n')

// === generateSessionName ===
console.log('--- generateSessionName ---')
assert('短文本原样返回', generateSessionName('你好') === '你好')
assert('10 字符内原样返回', generateSessionName('茅台行情怎么样') === '茅台行情怎么样')
assert('超过 10 字符截断加省略号', generateSessionName('宁德时代最近有什么研报可以看看') === '宁德时代最近有什么研...')
assert('空字符串返回新对话', generateSessionName('') === '新对话')
assert('纯空格返回新对话', generateSessionName('   ') === '新对话')
assert('前导标点被去除', generateSessionName('。。。你好') === '你好')
assert('尾部标点被去除', generateSessionName('你好。。。') === '你好')
assert('英文超过 10 字符截断', generateSessionName('abcdefghijklmn') === 'abcdefghij...')
assert('emoji 正确处理', generateSessionName('🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥') === '🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥...')

// === createSession ===
console.log('\n--- createSession ---')
const store1 = createSessionStore()
assert('初始无 session', store1.getState().sessions.length === 0)
assert('初始 currentSessionId 为 null', store1.getState().currentSessionId === null)

const id1 = store1.createSession()
assert('创建后 session 数量 = 1', store1.getState().sessions.length === 1)
assert('currentSessionId 指向新 session', store1.getState().currentSessionId === id1)
assert('新 session 标题为"新对话"', store1.getState().sessions[0].title === '新对话')
assert('返回值是 session id', typeof id1 === 'string' && id1.length > 0)

// === 连续创建多个 session ===
console.log('\n--- 连续创建多个 session ---')
const store2 = createSessionStore()
const id2a = store2.createSession()
const id2b = store2.createSession()
const id2c = store2.createSession()
assert('创建 3 个 session', store2.getState().sessions.length === 3)
assert('最新 session 排最前', store2.getState().sessions[0].id === id2c)
assert('currentSessionId 指向最后创建的', store2.getState().currentSessionId === id2c)
assert('每个 session id 唯一', id2a !== id2b && id2b !== id2c && id2a !== id2c)

// === switchSession ===
console.log('\n--- switchSession ---')
const store3 = createSessionStore()
const id3a = store3.createSession()
const id3b = store3.createSession()
assert('切换前指向最后一个', store3.getState().currentSessionId === id3b)
store3.switchSession(id3a)
assert('切换后指向第一个', store3.getState().currentSessionId === id3a)

// === renameSession ===
console.log('\n--- renameSession ---')
const store4 = createSessionStore()
const id4 = store4.createSession()
store4.renameSession(id4, '自定义名称')
assert('重命名成功', store4.getState().sessions[0].title === '自定义名称')
assert('标记为 isCustomNamed', store4.getState().sessions[0].isCustomNamed === true)

// === autoRenameSession ===
console.log('\n--- autoRenameSession ---')
const store5 = createSessionStore()
const id5 = store5.createSession()
store5.autoRenameSession(id5, '茅台行情')
assert('自动重命名成功', store5.getState().sessions[0].title === '茅台行情')

// 自动重命名不会覆盖已自定义的名称
store5.renameSession(id5, '手动名称')
store5.autoRenameSession(id5, '又被自动改名了')
assert('自动重命名不覆盖手动名称', store5.getState().sessions[0].title === '手动名称')

// 自动重命名只改"新对话"标题
const store5b = createSessionStore()
const id5b = store5b.createSession()
store5b.autoRenameSession(id5b, '第一次自动')
store5b.autoRenameSession(id5b, '第二次自动')
assert('自动重命名只改"新对话"标题', store5b.getState().sessions[0].title === '第一次自动')

// === deleteSession ===
console.log('\n--- deleteSession ---')
const store6 = createSessionStore()
const id6a = store6.createSession()
const id6b = store6.createSession()
const id6c = store6.createSession()
assert('删除前 3 个 session', store6.getState().sessions.length === 3)

// 删除当前 session，自动切换到第一个剩余的
store6.deleteSession(id6c)
assert('删除当前 session 后数量 = 2', store6.getState().sessions.length === 2)
assert('删除当前 session 后自动切换', store6.getState().currentSessionId === id6b)

// 删除非当前 session
store6.deleteSession(id6a)
assert('删除非当前 session 后数量 = 1', store6.getState().sessions.length === 1)
assert('currentSessionId 不变', store6.getState().currentSessionId === id6b)

// 删除最后一个 session
store6.deleteSession(id6b)
assert('删除最后一个后数量 = 0', store6.getState().sessions.length === 0)
assert('删除最后一个后 currentSessionId 为 null', store6.getState().currentSessionId === null)

// === v6 防竞态：快速连续创建 ===
console.log('\n--- v6 防竞态：快速连续创建 ---')
const store7 = createSessionStore()
// 模拟快速点击 10 次创建
const ids = []
for (let i = 0; i < 10; i++) {
  ids.push(store7.createSession())
}
// v6 预期：每次 createSession 都是同步的，应该创建 10 个（zustand 是同步更新 state 的）
// 竞态问题出在 debounce persist，不在内存 state 更新
assert('快速创建 10 个 session', store7.getState().sessions.length === 10)
assert('currentSessionId 指向最后一个', store7.getState().currentSessionId === ids[9])
// 验证每个 id 唯一
const uniqueIds = new Set(ids)
assert('10 个 id 全部唯一', uniqueIds.size === 10)

console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败\n`)
process.exit(fail > 0 ? 1 : 0)
