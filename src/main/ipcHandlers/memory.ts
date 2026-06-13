import { ipcMain } from 'electron'
import { VectorRecord } from '../../shared/types/memory'
import * as vectorStore from '../services/vectorStore'

/**
 * 注册向量记忆相关的 IPC handlers
 * 所有 Vectra 操作通过主进程执行，绕过渲染进程的 fs 兼容性问题
 */

export const registerMemoryIPC = (): void => {
  ipcMain.handle('memory:insertItem', async (_event, record: unknown) => {
    if (!record || typeof record !== 'object') throw new Error('Invalid record')
    await vectorStore.insertItem(record as VectorRecord)
  })

  ipcMain.handle('memory:insertItems', async (_event, records: unknown) => {
    if (!Array.isArray(records)) throw new Error('Invalid records: expected array')
    await vectorStore.insertItems(records as VectorRecord[])
  })

  ipcMain.handle('memory:queryItems', async (_event, vector: unknown, topK: unknown) => {
    if (!Array.isArray(vector)) throw new Error('Invalid vector: expected number[]')
    const topKNum = typeof topK === 'number' ? topK : 5
    return await vectorStore.queryItems(vector, topKNum)
  })

  ipcMain.handle('memory:deleteItem', async (_event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('Invalid id')
    await vectorStore.deleteItem(id)
  })

  ipcMain.handle('memory:getStats', async () => {
    return await vectorStore.getStats()
  })

  ipcMain.handle('memory:listItems', async () => {
    return await vectorStore.listItems()
  })

  ipcMain.handle('memory:getItem', async (_event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('Invalid id')
    return await vectorStore.getItem(id)
  })

  ipcMain.handle('memory:upsertItem', async (_event, id: unknown, vector: unknown, metadata: unknown) => {
    if (typeof id !== 'string') throw new Error('Invalid id')
    if (!Array.isArray(vector)) throw new Error('Invalid vector')
    if (!metadata || typeof metadata !== 'object') throw new Error('Invalid metadata')
    await vectorStore.upsertItem(id, vector, metadata as Record<string, unknown>)
  })
}
