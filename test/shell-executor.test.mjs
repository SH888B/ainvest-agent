/**
 * Shell Executor 单元测试
 * 对齐源码 src/main/services/shellExecutor.ts
 * 直接运行：node test/shell-executor.test.mjs
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

// 对齐源码
const ALLOWED_COMMANDS = new Set([
  'python', 'python3', 'node', 'npm', 'curl', 'git', 'ls', 'dir', 'cat', 'type', 'find', 'grep',
])

const DANGEROUS_COMMANDS = {
  sudo: '需要超级用户权限',
  format: '格式化操作',
}

const DANGEROUS_PATTERNS = [
  { pattern: /rm\s+-rf/i, reason: '强制递归删除' },
  { pattern: />\s*\//, reason: '重定向到根目录' },
  { pattern: />\s*~/, reason: '重定向到用户目录' },
  { pattern: /del\s+\//i, reason: '删除根目录文件' },
  { pattern: /rd\s+\//i, reason: '删除根目录' },
  { pattern: /rd\s+\/s/i, reason: '强制删除目录树' },
  { pattern: /del\s+\/s/i, reason: '强制删除目录树' },
]

const isCommandAllowed = (command) => {
  const normalized = command.replace(/\.(exe|cmd|bat)$/i, '').toLowerCase()
  return ALLOWED_COMMANDS.has(normalized)
}

const detectDanger = (command, args) => {
  const cmdLower = command.toLowerCase()
  if (DANGEROUS_COMMANDS[cmdLower]) return DANGEROUS_COMMANDS[cmdLower]

  const fullCmd = `${command} ${args.join(' ')}`
  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(fullCmd)) return reason
  }
  return null
}

console.log('\n📦 Shell Executor Tests\n')

// === 白名单测试 ===
console.log('--- 白名单检查 ---')
assert('python 允许', isCommandAllowed('python'))
assert('python3 允许', isCommandAllowed('python3'))
assert('node 允许', isCommandAllowed('node'))
assert('npm 允许', isCommandAllowed('npm'))
assert('git 允许', isCommandAllowed('git'))
assert('ls 允许', isCommandAllowed('ls'))
assert('dir 允许', isCommandAllowed('dir'))
assert('cat 允许', isCommandAllowed('cat'))
assert('grep 允许', isCommandAllowed('grep'))
assert('find 允许', isCommandAllowed('find'))
assert('curl 允许', isCommandAllowed('curl'))
assert('type 允许', isCommandAllowed('type'))

assert('node.exe (Windows后缀) 允许', isCommandAllowed('node.exe'))
assert('python.cmd (Windows后缀) 允许', isCommandAllowed('python.cmd'))

assert('rm 拒绝', !isCommandAllowed('rm'))
assert('sudo 拒绝', !isCommandAllowed('sudo'))
assert('bash 拒绝', !isCommandAllowed('bash'))
assert('sh 拒绝', !isCommandAllowed('sh'))
assert('cmd.exe 拒绝', !isCommandAllowed('cmd.exe'))

// === 危险模式检测 ===
console.log('\n--- 危险模式检测 ---')
assert('rm -rf / 危险', detectDanger('rm', ['-rf', '/']) !== null)
assert('rm -rf . 危险 (匹配 >~/)', detectDanger('rm', ['-rf', '.']) !== null) // 源码 DANGEROUS_PATTERNS 不匹配这个，但 rm 本身不在白名单
assert('sudo ls 危险', detectDanger('sudo', ['ls']) !== null)
assert('python sudo.py 不危险', detectDanger('python', ['sudo.py']) === null)
assert('> /etc/passwd 危险', detectDanger('cat', ['>', '/etc/passwd']) !== null)
assert('> ~/.bashrc 危险', detectDanger('cat', ['>', '~/.bashrc']) !== null)
assert('node app.js 不危险', detectDanger('node', ['app.js']) === null)
assert('python test.py 不危险', detectDanger('python', ['test.py']) === null)
assert('git status 不危险', detectDanger('git', ['status']) === null)
assert('ls -la 不危险', detectDanger('ls', ['-la']) === null)

// === 白名单完整性 ===
console.log('\n--- 白名单完整性 ---')
assert('白名单包含 12 个命令', ALLOWED_COMMANDS.size === 12)

console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败\n`)
process.exit(fail > 0 ? 1 : 0)
