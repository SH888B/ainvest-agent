import { ipcMain, dialog, BrowserWindow } from 'electron'
import path from 'path'
import {
  executeShell,
  isCommandAllowed,
  detectDanger,
  ALLOWED_COMMANDS,
} from '../services/shellExecutor'
import type { ShellExecuteOptions, ShellExecuteResult } from '../services/shellExecutor'

/**
 * Shell 执行 IPC 处理器
 * 注册 shell:execute 通道，包含安全校验和危险确认
 */

const WORKSPACE_DIR = 'workspace'

/**
 * 获取合法的 cwd 路径
 * 限制在 userData/ainvest/workspace/ 内
 */
const resolveCwd = (userDataPath: string, cwd?: string): string => {
  const workspacePath = path.join(userDataPath, WORKSPACE_DIR)
  if (!cwd) {
    return workspacePath
  }
  const resolved = path.resolve(workspacePath, cwd)
  // 安全检查：cwd 必须在 workspace 内
  if (!resolved.startsWith(workspacePath)) {
    return workspacePath
  }
  return resolved
}

/**
 * 注册 Shell IPC handler
 */
export const registerShellIPC = (userDataPath: string): void => {
  ipcMain.handle(
    'shell:execute',
    async (_event, options: ShellExecuteOptions): Promise<ShellExecuteResult> => {
      const { command, args, cwd } = options

      // 1. 白名单检查
      if (!isCommandAllowed(command)) {
        return {
          stdout: '',
          stderr: `命令 "${command}" 不在白名单中。允许的命令：${Array.from(
            ALLOWED_COMMANDS
          ).join(', ')}`,
          exitCode: -1,
          killed: false,
          executionTimeMs: 0,
        }
      }

      // 2. 危险模式检测
      const dangerReason = detectDanger(command, args)
      if (dangerReason) {
        // 获取当前窗口，弹出确认对话框
        const focusedWindow = BrowserWindow.getFocusedWindow()
        if (!focusedWindow) {
          // 无窗口时默认拒绝，安全第一
          return {
            stdout: '',
            stderr: `危险命令被拒绝：无法获取确认窗口（风险：${dangerReason}）`,
            exitCode: -1,
            killed: false,
            executionTimeMs: 0,
          }
        }
        const result = dialog.showMessageBoxSync(focusedWindow, {
          type: 'warning',
          title: '危险操作确认',
          message: `即将执行可能危险的命令：`,
          detail: `命令：${command} ${args.join(' ')}
风险：${dangerReason}

是否继续执行？`,
          buttons: ['取消', '允许执行'],
          defaultId: 0,
          cancelId: 0,
        })
        if (result === 0) {
          return {
            stdout: '',
            stderr: '用户取消了危险命令的执行',
            exitCode: -1,
            killed: false,
            executionTimeMs: 0,
          }
        }
      }

      // 3. 解析并校验 cwd
      const resolvedCwd = resolveCwd(userDataPath, cwd)

      // 4. 执行命令
      const result = await executeShell({
        command,
        args,
        cwd: resolvedCwd,
      })

      return result
    }
  )
}
