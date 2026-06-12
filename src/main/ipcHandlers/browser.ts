import { ipcMain } from 'electron'
import { browserService } from '../services/browserCDP'
import { logInfo, logError } from '../services/logger'

/**
 * 注册浏览器自动化 IPC handlers
 */
export const registerBrowserIPC = (): void => {
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
}
