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

export interface BrowserAPI {
  open: (options: { url: string }) => Promise<{
    success: boolean
    title: string
    url: string
    text: string
    error?: string
  }>
  screenshot: () => Promise<{
    success: boolean
    dataUrl: string
    error?: string
  }>
  close: () => Promise<{ success: boolean }>
  /** v6.1: 启用 CDP debugger */
  attachCDP: () => Promise<{ success: boolean; cdpAttached?: boolean; error?: string }>
  /** v6.1: 关闭 CDP debugger */
  detachCDP: () => Promise<{ success: boolean; error?: string }>
  /** v6.1: 获取简化 Accessibility Tree */
  getAXTree: () => Promise<{
    success: boolean
    tree: Array<{ nodeId: string; role: string; name: string; value?: string }>
    error?: string
  }>
  /** v6.1: 点击指定元素 */
  clickElement: (nodeId: string, name?: string, role?: string) => Promise<{ success: boolean; error?: string }>
  /** v6.1: 在元素中输入文本 */
  typeText: (nodeId: string, text: string, name?: string, role?: string) => Promise<{ success: boolean; error?: string }>
  /** v6.1: 滚动页面 */
  scrollPage: (direction: 'up' | 'down') => Promise<{ success: boolean; error?: string }>
  /** v6.1: 提取当前页面文本（Agent Loop 中使用） */
  extractCurrentPageText: () => Promise<string>
  /** 用系统默认浏览器打开外部链接 */
  openExternal: (url: string) => Promise<void>
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

const browserAPI: BrowserAPI = {
  open: (options) => ipcRenderer.invoke('browser:open', options),
  screenshot: () => ipcRenderer.invoke('browser:screenshot'),
  close: () => ipcRenderer.invoke('browser:close'),
  attachCDP: () => ipcRenderer.invoke('browser:attachCDP'),
  detachCDP: () => ipcRenderer.invoke('browser:detachCDP'),
  getAXTree: () => ipcRenderer.invoke('browser:getAXTree'),
  clickElement: (nodeId, name, role) => ipcRenderer.invoke('browser:clickElement', nodeId, name, role),
  typeText: (nodeId, text, name, role) => ipcRenderer.invoke('browser:typeText', nodeId, text, name, role),
  scrollPage: (direction) => ipcRenderer.invoke('browser:scrollPage', direction),
  extractCurrentPageText: () => ipcRenderer.invoke('browser:extractCurrentPageText'),
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
}

contextBridge.exposeInMainWorld('persistence', persistenceAPI)
contextBridge.exposeInMainWorld('appAPI', appAPI)
contextBridge.exposeInMainWorld('shell', shellAPI)
contextBridge.exposeInMainWorld('memoryAPI', memoryAPI)
contextBridge.exposeInMainWorld('browser', browserAPI)

// 类型声明扩展
declare global {
  interface Window {
    persistence: PersistenceAPI
    appAPI: AppAPI
    shell: ShellAPI
    memoryAPI: MemoryAPI
    browser: BrowserAPI
  }
}
