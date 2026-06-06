import { contextBridge, ipcRenderer } from 'electron'

/**
 * Preload 脚本
 * 安全暴露 IPC API 到渲染进程
 * 严禁直接暴露 Node.js API
 */

export interface PersistenceAPI {
  readFile: (filePath: string) => Promise<{ success: boolean; data: string | null; error?: string }>
  writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
}

export interface AppAPI {
  getUserDataPath: () => Promise<string>
  getVersion: () => Promise<string>
}

const persistenceAPI: PersistenceAPI = {
  readFile: (filePath: string) => ipcRenderer.invoke('persistence:readFile', filePath),
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('persistence:writeFile', filePath, content),
}

const appAPI: AppAPI = {
  getUserDataPath: () => ipcRenderer.invoke('app:getUserDataPath'),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
}

contextBridge.exposeInMainWorld('persistence', persistenceAPI)
contextBridge.exposeInMainWorld('appAPI', appAPI)

// 类型声明扩展
declare global {
  interface Window {
    persistence: PersistenceAPI
    appAPI: AppAPI
  }
}
