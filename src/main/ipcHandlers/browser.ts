import { ipcMain } from 'electron'
import { browserService } from '../services/browserCDP'
import { logInfo, logError } from '../services/logger'

/**
 * 注册浏览器自动化 IPC handlers
 * v6.1: 新增 6 个 CDP 智能操作 IPC 通道
 */
export const registerBrowserIPC = (): void => {
  // ── 文本提取模式（v6.0.1 已有）──

  ipcMain.handle('browser:open', async (_event, options: unknown) => {
    if (!options || typeof options !== 'object') {
      throw new Error('Invalid options')
    }

    const { url } = options as { url: string }
    if (!url || typeof url !== 'string') {
      throw new Error('URL is required')
    }

    logInfo('browser', 'open.request', { url })

    const result = await browserService.browse({ url })
    if (!result.success) {
      logError('browser', 'open.failed', { url, error: result.error })
    }
    return result
  })

  ipcMain.handle('browser:screenshot', async () => {
    logInfo('browser', 'screenshot.request', {})
    return browserService.screenshot()
  })

  ipcMain.handle('browser:close', async () => {
    logInfo('browser', 'close.request', {})
    await browserService.close()
    return { success: true }
  })

  // ── 智能操作模式（v6.1 新增）──

  ipcMain.handle('browser:attachCDP', async () => {
    logInfo('browser', 'attachCDP.request', {})
    try {
      const result = await browserService.attachCDP()
      return { success: true, cdpAttached: result.cdpAttached }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logError('browser', 'attachCDP.error', { error: errorMsg })
      return { success: false, error: errorMsg }
    }
  })

  ipcMain.handle('browser:detachCDP', async () => {
    logInfo('browser', 'detachCDP.request', {})
    try {
      await browserService.detachCDP()
      return { success: true }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logError('browser', 'detachCDP.error', { error: errorMsg })
      return { success: false, error: errorMsg }
    }
  })

  ipcMain.handle('browser:getAXTree', async () => {
    logInfo('browser', 'getAXTree.request', {})
    try {
      const tree = await browserService.getAXTree()
      return { success: true, tree }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logError('browser', 'getAXTree.error', { error: errorMsg })
      return { success: false, tree: [], error: errorMsg }
    }
  })

  ipcMain.handle('browser:clickElement', async (_event, nodeId: string, name?: string, role?: string) => {
    logInfo('browser', 'clickElement.request', { nodeId, name, role })
    return browserService.clickElement(nodeId, name, role)
  })

  ipcMain.handle('browser:typeText', async (_event, nodeId: string, text: string, name?: string, role?: string) => {
    logInfo('browser', 'typeText.request', { nodeId, textLength: text.length, name, role })
    return browserService.typeText(nodeId, text, name, role)
  })

  ipcMain.handle('browser:scrollPage', async (_event, direction: 'up' | 'down') => {
    logInfo('browser', 'scrollPage.request', { direction })
    return browserService.scrollPage(direction)
  })

  ipcMain.handle('browser:extractCurrentPageText', async () => {
    logInfo('browser', 'extractCurrentPageText.request', {})
    try {
      const text = await browserService.extractCurrentPageText()
      return text
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logError('browser', 'extractCurrentPageText.error', { error: errorMsg })
      return ''
    }
  })
}
