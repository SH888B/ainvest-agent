import { registerTool } from './registry'

/**
 * Shell 执行工具
 * 通过 IPC 调用主进程执行本地命令
 */

interface ShellResult {
  stdout: string
  stderr: string
  exitCode: number
  killed: boolean
  executionTimeMs: number
}

registerTool(
  'shell.execute',
  'shell.execute',
  '执行本地命令或脚本（如 python、node、git 等）',
  async (args: Record<string, unknown>) => {
    const command = String(args.command || '')
    const argsArray = Array.isArray(args.args) ? args.args.map(String) : []
    const cwd = args.cwd ? String(args.cwd) : undefined

    if (!command) {
      return '请提供要执行的命令'
    }

    if (!window.shell) {
      return 'Shell API 未初始化'
    }

    let result: ShellResult
    try {
      result = await window.shell.execute({
        command,
        args: argsArray,
        cwd,
      })
    } catch (err) {
      return `Shell 执行失败: ${err instanceof Error ? err.message : String(err)}`
    }

    const parts: string[] = []

    if (result.killed) {
      parts.push('[命令被终止]')
    }

    if (result.stdout) {
      parts.push(`[输出]\n${result.stdout}`)
    }

    if (result.stderr) {
      parts.push(`[错误输出]\n${result.stderr}`)
    }

    if (result.exitCode !== 0 && !result.killed) {
      parts.push(`[退出码: ${result.exitCode}]`)
    }

    if (parts.length === 0) {
      return '命令执行完成，无输出'
    }

    return parts.join('\n\n')
  }
)
