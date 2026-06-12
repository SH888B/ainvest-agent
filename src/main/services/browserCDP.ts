import { BrowserWindow } from 'electron'
import { BROWSER_DOMAIN_WHITELIST } from '@shared/constants'
import { logInfo, logError } from './logger'

/**
 * 浏览选项
 */
interface BrowseOptions {
  url: string
  timeout?: number
}

/**
 * 浏览结果
 */
interface BrowseResult {
  success: boolean
  title: string
  url: string
  text: string
  error?: string
}

/**
 * 截图结果
 */
interface ScreenshotResult {
  success: boolean
  dataUrl: string
  error?: string
}

/**
 * 浏览器错误类型
 */
enum BrowserError {
  INVALID_URL = 'INVALID_URL',
  NOT_WHITELISTED = 'NOT_WHITELISTED',
  TIMEOUT = 'TIMEOUT',
  NAVIGATION_FAILED = 'NAVIGATION_FAILED',
}

/** 自动关闭空闲窗口时间（ms） */
const AUTO_CLOSE_IDLE_MS = 60000

/**
 * 页面内容提取脚本（在浏览器上下文中执行）
 * v6.0.1: 简化为只提取 innerText，不做 DOM 删除操作
 * - innerText 已自动排除 <script>/<style> 内容
 * - 不使用 el.remove()，避免误删搜索结果容器
 * - 噪声过滤移到 Node.js 侧（cleanExtractedText），避免 CDP 编码问题
 */
const EXTRACTION_SCRIPT = `document.body.innerText.slice(0, 8000)`

/**
 * Node.js 侧噪声过滤
 * 在提取结果返回后，过滤掉常见的 UI 噪声行
 */
const NOISE_LINE_PATTERNS = [
  /^(登录|注册|下载|客户端|设为首页|加入VIP|版权|备案|举报|反馈|意见|关闭|同意|接受|拒绝|更多|换一换|相关搜索|大家还在搜|搜索发现)/,
  /^(本网站|本站|免责|隐私|使用条款|用户协议|ICP|京公网|工商)/,
]

function cleanExtractedText(raw: string): string {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.length < 500)
    .filter((line) => !NOISE_LINE_PATTERNS.some((p) => p.test(line)))
    .join('\n')
}

/**
 * BrowserService
 * 基于 Electron webContents 的浏览器自动化服务
 * v6.0.1: 从 CDP 重构为 executeJavaScript
 * - 移除 CDP debugger attach/detach（解决编码问题）
 * - 使用 Electron 原生 executeJavaScript（正确的错误处理 + 无编码问题）
 * - 复用 Electron 自带 Chromium，0 额外体积
 */
export class BrowserCDPService {
  private window: BrowserWindow | null = null
  private autoCloseTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * 检查 URL 是否在白名单中
   */
  isUrlAllowed(url: string, whitelist: readonly string[] = BROWSER_DOMAIN_WHITELIST): boolean {
    try {
      const hostname = new URL(url).hostname
      return whitelist.some((domain) => hostname === domain || hostname.endsWith('.' + domain))
    } catch {
      return false
    }
  }

  /**
   * 重置自动关闭计时器
   */
  private resetAutoCloseTimer(): void {
    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer)
      this.autoCloseTimer = null
    }
    this.autoCloseTimer = setTimeout(() => {
      logInfo('browser', 'autoClose.idle', {})
      this.close().catch(() => {})
    }, AUTO_CLOSE_IDLE_MS)
  }

  /**
   * 清除自动关闭计时器
   */
  private clearAutoCloseTimer(): void {
    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer)
      this.autoCloseTimer = null
    }
  }

  /**
   * 打开网页并提取内容
   */
  async browse(options: BrowseOptions): Promise<BrowseResult> {
    const { url, timeout = 15000 } = options

    // 1. URL 校验
    try {
      new URL(url)
    } catch {
      return { success: false, title: '', url, text: '', error: BrowserError.INVALID_URL }
    }

    // 2. 白名单校验
    if (!this.isUrlAllowed(url)) {
      return { success: false, title: '', url, text: '', error: BrowserError.NOT_WHITELISTED }
    }

    // 3. 检查是否已有窗口在运行，先关闭
    if (this.window) {
      await this.close()
    }

    logInfo('browser', 'browse.start', { url })

    try {
      // 4. 创建隐藏窗口
      this.window = new BrowserWindow({
        width: 1280,
        height: 800,
        show: false,
        webPreferences: {
          offscreen: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      })

      // 5. 导航到目标 URL
      const loadPromise = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(BrowserError.TIMEOUT))
        }, timeout)

        this.window!.webContents.once('did-finish-load', () => {
          clearTimeout(timer)
          resolve()
        })

        this.window!.webContents.once('did-fail-load', (_event, _errorCode, errorDescription) => {
          clearTimeout(timer)
          reject(new Error(errorDescription || BrowserError.NAVIGATION_FAILED))
        })
      })

      await this.window.loadURL(url)
      await loadPromise

      // 6. 智能等待 SPA 内容渲染
      // did-finish-load 只表示初始 HTML 加载完成，SPA 页面的 JS 渲染需要额外时间
      // 轮询检测 body 文本长度，内容出现即提前返回，避免不必要的等待
      const MAX_CONTENT_WAIT_MS = 5000
      const POLL_INTERVAL_MS = 500
      const pollStart = Date.now()
      let contentReady = false

      while (!contentReady && (Date.now() - pollStart) < MAX_CONTENT_WAIT_MS) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        try {
          const textLength = await this.window!.webContents.executeJavaScript(
            'document.body.innerText.length'
          )
          if (textLength > 0) {
            contentReady = true
            logInfo('browser', 'browse.contentReady', {
              url,
              textLength,
              waitMs: Date.now() - pollStart,
            })
          }
        } catch {
          // 轮询失败继续等待
        }
      }

      if (!contentReady) {
        logInfo('browser', 'browse.contentTimeout', {
          url,
          waitMs: Date.now() - pollStart,
        })
      }

      // 7. 提取标题
      const title = this.window.webContents.getTitle()

      // 8. 通过 executeJavaScript 提取内容
      // 相比 CDP Runtime.evaluate：
      // - 无编码问题（Electron 原生 API，正确处理 UTF-8）
      // - 有错误处理（脚本抛错会 reject Promise）
      // - 不需要 attach/detach CDP debugger
      const rawText = await this.window.webContents.executeJavaScript(EXTRACTION_SCRIPT)
      const text = cleanExtractedText(rawText || '')

      logInfo('browser', 'browse.success', { url, title, textLength: text.length })

      this.resetAutoCloseTimer()

      return {
        success: true,
        title,
        url,
        text,
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logError('browser', 'browse.error', { url, error: errorMsg })
      await this.close()
      return { success: false, title: '', url, text: '', error: errorMsg }
    }
  }

  /**
   * 截图
   */
  async screenshot(): Promise<ScreenshotResult> {
    if (!this.window) {
      return { success: false, dataUrl: '', error: '浏览器窗口未打开' }
    }

    try {
      const image = await this.window.webContents.capturePage()
      const dataUrl = image.toDataURL()
      logInfo('browser', 'screenshot.success', { size: dataUrl.length })
      this.resetAutoCloseTimer()
      return { success: true, dataUrl }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logError('browser', 'screenshot.error', { error: errorMsg })
      return { success: false, dataUrl: '', error: errorMsg }
    }
  }

  /**
   * 关闭浏览器窗口并清理资源
   */
  async close(): Promise<void> {
    this.clearAutoCloseTimer()

    if (this.window) {
      this.window.destroy()
      this.window = null
    }

    logInfo('browser', 'close.done', {})
  }
}

/** 单例实例 */
export const browserService = new BrowserCDPService()
