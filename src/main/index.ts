import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { registerShellIPC } from './ipcHandlers/shell'
import { registerMemoryIPC } from './ipcHandlers/memory'
import { registerBrowserIPC } from './ipcHandlers/browser'

/**
 * Electron 主进程入口
 * 负责窗口管理和文件持久化服务
 */

const isDev = !app.isPackaged

/** 用户数据目录路径 */
const getUserDataPath = (): string => {
  const base = app.getPath('userData')
  return path.join(base, 'ainvest')
}

/** 确保目录存在 */
const ensureDir = async (dir: string): Promise<void> => {
  try {
    await fs.access(dir)
  } catch {
    await fs.mkdir(dir, { recursive: true })
  }
}

/** 创建主窗口 */
const createWindow = (): void => {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// IPC: 读取文件
ipcMain.handle('persistence:readFile', async (_event, filePath: string) => {
  const baseDir = getUserDataPath()
  const fullPath = path.join(baseDir, filePath)
  // 安全检查：确保路径在用户数据目录内
  if (!fullPath.startsWith(baseDir)) {
    throw new Error('非法路径')
  }
  try {
    const data = await fs.readFile(fullPath, 'utf-8')
    return { success: true, data }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return { success: true, data: null }
    }
    return { success: false, error: (err as Error).message }
  }
})

// IPC: 写入文件
ipcMain.handle('persistence:writeFile', async (_event, filePath: string, content: string) => {
  const baseDir = getUserDataPath()
  const fullPath = path.join(baseDir, filePath)
  if (!fullPath.startsWith(baseDir)) {
    throw new Error('非法路径')
  }
  await ensureDir(path.dirname(fullPath))
  await fs.writeFile(fullPath, content, 'utf-8')
  return { success: true }
})

// IPC: 获取用户数据目录路径
ipcMain.handle('app:getUserDataPath', () => {
  return getUserDataPath()
})

// IPC: 获取应用版本
ipcMain.handle('app:getVersion', () => {
  return app.getVersion()
})

// IPC: 用系统默认浏览器打开外部链接（仅允许 http/https 协议）
ipcMain.handle('app:openExternal', async (_event, url: string) => {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return
    }
    await shell.openExternal(url)
  } catch {
    // 忽略无效 URL 或打开失败的错误
  }
})

app.whenReady().then(async () => {
  const userDataPath = getUserDataPath()

  // 确保 Shell workspace 目录存在
  await ensureDir(path.join(userDataPath, 'workspace'))

  // 注册 IPC handlers
  registerShellIPC(userDataPath)
  registerMemoryIPC()
  registerBrowserIPC()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
