import { spawn } from 'child_process'

/**
 * Shell 执行服务
 * 基于 child_process.spawn 的命令执行封装
 * 支持超时、输出截断、跨平台兼容
 */

/** Shell 执行选项 */
export interface ShellExecuteOptions {
  command: string
  args: string[]
  cwd?: string
  timeout?: number
}

/** Shell 执行结果 */
export interface ShellExecuteResult {
  stdout: string
  stderr: string
  exitCode: number
  killed: boolean
  executionTimeMs: number
}

/** 命令白名单 */
export const ALLOWED_COMMANDS = new Set([
  'python',
  'python3',
  'node',
  'npm',
  'curl',
  'git',
  'ls',
  'dir',
  'cat',
  'type',
  'find',
  'grep',
])

/** 危险命令本身 */
const DANGEROUS_COMMANDS: Record<string, string> = {
  sudo: '需要超级用户权限',
  format: '格式化操作',
}

/** 危险模式检测正则（检查 command + args 组合） */
export const DANGEROUS_PATTERNS = [
  { pattern: /rm\s+-rf/i, reason: '强制递归删除' },
  { pattern: />\s*\//, reason: '重定向到根目录' },
  { pattern: />\s*~/, reason: '重定向到用户目录' },
  { pattern: /del\s+\//i, reason: '删除根目录文件' },
  { pattern: /rd\s+\//i, reason: '删除根目录' },
  { pattern: /rd\s+\/s/i, reason: '强制删除目录树' },
  { pattern: /del\s+\/s/i, reason: '强制删除目录树' },
]

/** 执行约束 */
export const CONSTRAINTS = {
  maxOutputLength: 5000,
  maxExecutionTime: 30000,
}

/**
 * 检查命令是否在白名单中
 */
export const isCommandAllowed = (command: string): boolean => {
  // Windows 下可能带 .exe / .cmd 后缀
  const normalized = command.replace(/\.(exe|cmd|bat)$/i, '').toLowerCase()
  return ALLOWED_COMMANDS.has(normalized)
}

/**
 * 检测危险模式
 * @returns 匹配到的危险原因，若无危险则返回 null
 */
export const detectDanger = (
  command: string,
  args: string[]
): string | null => {
  // 1. 检查命令本身是否危险
  const cmdLower = command.toLowerCase()
  if (DANGEROUS_COMMANDS[cmdLower]) {
    return DANGEROUS_COMMANDS[cmdLower]
  }

  // 2. 检查 command + args 组合模式
  const fullCmd = `${command} ${args.join(' ')}`
  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(fullCmd)) {
      return reason
    }
  }
  return null
}

/**
 * 执行 Shell 命令
 */
export const executeShell = (
  options: ShellExecuteOptions
): Promise<ShellExecuteResult> => {
  const { command, args, cwd, timeout = CONSTRAINTS.maxExecutionTime } = options
  const startTime = Date.now()

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    let killed = false

    // stdout 流收集
    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString('utf-8')
      if (stdout.length > CONSTRAINTS.maxOutputLength) {
        stdout = stdout.slice(0, CONSTRAINTS.maxOutputLength) + '\n... [输出已截断]'
        child.kill('SIGTERM')
        killed = true
      }
    })

    // stderr 流收集
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString('utf-8')
      if (stderr.length > CONSTRAINTS.maxOutputLength) {
        stderr = stderr.slice(0, CONSTRAINTS.maxOutputLength) + '\n... [输出已截断]'
      }
    })

    // 超时处理
    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM')
      killed = true
    }, timeout)

    // 进程结束
    child.on('close', (exitCode) => {
      clearTimeout(timeoutId)
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: exitCode ?? 0,
        killed,
        executionTimeMs: Date.now() - startTime,
      })
    })

    // 进程错误（如命令不存在）
    child.on('error', (err) => {
      clearTimeout(timeoutId)
      resolve({
        stdout: '',
        stderr: err.message,
        exitCode: -1,
        killed: false,
        executionTimeMs: Date.now() - startTime,
      })
    })
  })
}
