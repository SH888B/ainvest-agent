import { contextBridge, ipcRenderer } from 'electron'
import type { ShellExecuteOptions, ShellExecuteResult } from '../main/services/shellExecutor'

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

export interface ShellAPI {
  execute: (options: ShellExecuteOptions) => Promise<ShellExecuteResult>
}

export interface MemoryAPI {
  insertItem: (record: unknown) => Promise<void>
  insertItems: (records: unknown[]) => Promise<void>
  queryItems: (vector: number[], topK: number) => Promise<unknown[]>
  deleteItem: (id: string) => Promise<void>
  getStats: () => Promise<{ itemCount: number; path: string }>
  listItems: () => Promise<unknown[]>
  getItem: (id: string) => Promise<unknown | null>
  upsertItem: (id: string, vector: number[], metadata: unknown) => Promise<void>
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

const shellAPI: ShellAPI = {
  execute: (options: ShellExecuteOptions) => ipcRenderer.invoke('shell:execute', options),
}

const memoryAPI: MemoryAPI = {
  insertItem: (record) => ipcRenderer.invoke('memory:insertItem', record),
  insertItems: (records) => ipcRenderer.invoke('memory:insertItems', records),
  queryItems: (vector, topK) => ipcRenderer.invoke('memory:queryItems', vector, topK),
  deleteItem: (id) => ipcRenderer.invoke('memory:deleteItem', id),
  getStats: () => ipcRenderer.invoke('memory:getStats'),
  listItems: () => ipcRenderer.invoke('memory:listItems'),
  getItem: (id) => ipcRenderer.invoke('memory:getItem', id),
  upsertItem: (id, vector, metadata) => ipcRenderer.invoke('memory:upsertItem', id, vector, metadata),
}

contextBridge.exposeInMainWorld('persistence', persistenceAPI)
contextBridge.exposeInMainWorld('appAPI', appAPI)
contextBridge.exposeInMainWorld('shell', shellAPI)
contextBridge.exposeInMainWorld('memoryAPI', memoryAPI)

// 类型声明扩展
declare global {
  interface Window {
    persistence: PersistenceAPI
    appAPI: AppAPI
    shell: ShellAPI
    memoryAPI: MemoryAPI
  }
}
