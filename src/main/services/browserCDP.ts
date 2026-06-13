import { BrowserWindow } from 'electron'
import { BROWSER_DOMAIN_WHITELIST } from '@shared/constants'
import type { AXNode, CDPOperationResult } from '@shared/types'
import { logInfo, logWarn, logError } from './logger'

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
  /** CDP debugger 是否已 attach */
  private cdpAttached = false

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

      // 拦截新窗口打开（防止链接点击触发系统浏览器弹窗）
      // 不拦截 will-navigate，因为 Agent Loop 的 click 操作可能需要页面内导航
      this.window.webContents.setWindowOpenHandler(() => {
        return { action: 'deny' }
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

  // ──────────────────────────────────────────────
  // v6.1 CDP 智能操作模式方法
  // 基于 POC 验证结果：AXTree 走 CDP，点击/输入走 executeJavaScript 定位 + CDP Input
  // ──────────────────────────────────────────────

  /** AXTree 中排除的无语义 role */
  private static readonly EXCLUDED_ROLES = new Set([
    'generic', 'presentation', 'none', 'Ignored', 'LineBreak',
  ])

  /** AXTree 中优先保留的交互 role */
  private static readonly INTERACTIVE_ROLES = new Set([
    'button', 'link', 'textbox', 'combobox', 'searchbox',
    'checkbox', 'radio', 'tab', 'menuitem', 'option',
  ])

  /** AXTree 简化后最大节点数 */
  private static readonly MAX_AX_NODES = 50

  /**
   * 启用 CDP debugger（智能操作模式前置条件）
   * POC 验证：attach 后 executeJavaScript 仍正常
   * v6.1.1: 修复静默成功 BUG — window 为 null 或 CDP 冲突时必须抛异常
   * @returns cdpAttached 是否成功 attach（false 表示已 attached，无需重复操作）
   */
  async attachCDP(): Promise<{ cdpAttached: boolean }> {
    if (!this.window) {
      throw new Error('浏览器窗口未打开，无法 attach CDP')
    }

    // 已 attach：返回状态但不重复操作
    if (this.cdpAttached) {
      logInfo('browser', 'cdp.alreadyAttached', {})
      return { cdpAttached: true }
    }

    await this.window.webContents.debugger.attach('1.3')
    this.cdpAttached = true
    logInfo('browser', 'cdp.attached', {})
    return { cdpAttached: true }
  }

  /**
   * 关闭 CDP debugger
   */
  async detachCDP(): Promise<void> {
    if (!this.window || !this.cdpAttached) return
    try {
      await this.window.webContents.debugger.detach()
    } finally {
      this.cdpAttached = false
    }
    logInfo('browser', 'cdp.detached', {})
  }

  /**
   * 获取简化 Accessibility Tree
   * POC 验证：中文内容正常，AXTree 返回结构化 JSON 无编码问题
   */
  async getAXTree(): Promise<AXNode[]> {
    if (!this.window || !this.cdpAttached) {
      throw new Error('CDP not attached')
    }

    const result = await this.window.webContents.debugger.sendCommand(
      'Accessibility.getFullAXTree'
    )

    // 简化：过滤无语义节点 + 排序（交互元素优先）+ 截断
    const nodes: AXNode[] = result.nodes
      .filter((n: Record<string, unknown>) => {
        const role = (n.role as Record<string, string>)?.value || ''
        const name = (n.name as Record<string, string>)?.value || ''
        return !BrowserCDPService.EXCLUDED_ROLES.has(role) && name.length > 0
      })
      .map((n: Record<string, unknown>) => ({
        nodeId: String(n.nodeId || ''),
        role: (n.role as Record<string, string>)?.value || 'unknown',
        name: (n.name as Record<string, string>)?.value || '',
        value: (n.value as Record<string, string>)?.value || undefined,
      }))
      .sort((a: AXNode, b: AXNode) => {
        const aInteractive = BrowserCDPService.INTERACTIVE_ROLES.has(a.role) ? 0 : 1
        const bInteractive = BrowserCDPService.INTERACTIVE_ROLES.has(b.role) ? 0 : 1
        return aInteractive - bInteractive
      })
      .slice(0, BrowserCDPService.MAX_AX_NODES)

    logInfo('browser', 'axTree.simplified', {
      totalNodes: result.nodes.length,
      simplifiedNodes: nodes.length,
    })

    return nodes
  }

  /**
   * 点击指定元素
   * 策略：从 AXTree 获取 name+role → 在 DOM 中文本匹配定位 → CDP 模拟点击
   * POC 验证：AXTree nodeId 无法直接映射到 DOM，改用文本匹配（POC 方案 A 验证可行）
   *
   * @param nodeId AXTree 节点 ID（用于日志）
   * @param name AXTree 节点的可访问性名称（用于 DOM 文本匹配）
   * @param role AXTree 节点的 role（用于 DOM 角色匹配）
   */
  async clickElement(nodeId: string, name?: string, role?: string): Promise<CDPOperationResult> {
    if (!this.window) {
      return { success: false, error: '浏览器窗口未打开' }
    }

    try {
      // 方案 A: executeJavaScript 文本匹配定位 + CDP 点击
      // 根据 AXTree 的 name 和 role，在 DOM 中查找最匹配的可交互元素
      const sanitizedName = (name || '').replace(/[`'"\\]/g, '')
      const sanitizedRole = role || ''

      const target = await this.window.webContents.executeJavaScript(`
        (function() {
          const targetName = ${JSON.stringify(sanitizedName)};
          const targetRole = ${JSON.stringify(sanitizedRole)};
          const interactiveSelectors = 'a, button, input, select, textarea, [role="button"], [role="link"], [role="searchbox"], [role="textbox"]';
          const elements = document.querySelectorAll(interactiveSelectors);
          let bestMatch = null;
          let bestScore = -1;

          for (const el of elements) {
            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;

            const text = (el.textContent || el.value || el.getAttribute('aria-label') || '').trim();
            const elRole = el.getAttribute('role') || el.type || '';
            const elTag = el.tagName.toLowerCase();

            // 计算匹配分数
            let score = 0;

            // 文本匹配（最重要）
            if (targetName && text) {
              if (text === targetName) {
                score += 100;  // 完全匹配
              } else if (text.includes(targetName)) {
                score += 80;   // 文本包含
              } else if (targetName.includes(text)) {
                score += 60;   // 被包含
              } else if (text.startsWith(targetName.slice(0, 10))) {
                score += 40;   // 前缀匹配
              }
            }

            // role 匹配
            if (targetRole) {
              const roleMap = {
                'link': ['a', 'link'],
                'button': ['button', 'submit', 'button'],
                'textbox': ['text', 'search', 'textbox', 'searchbox'],
                'searchbox': ['search', 'searchbox'],
              };
              const expectedTags = roleMap[targetRole] || [targetRole];
              if (expectedTags.includes(elTag) || expectedTags.includes(elRole)) {
                score += 30;
              }
            }

            // 优先选择可见区域内的元素
            if (rect.top >= 0 && rect.top < window.innerHeight) {
              score += 10;
            }

            if (score > bestScore) {
              bestScore = score;
              bestMatch = {
                tag: elTag,
                text: text.slice(0, 100),
                x: rect.x + rect.width / 2,
                y: rect.y + rect.height / 2,
                href: el.href || '',
                role: elRole,
                score
              };
            }
          }

          return bestMatch;
        })()
      `)

      if (!target || target.x === undefined || target.y === undefined) {
        logWarn('browser', 'clickElement.notFound', { nodeId, name: sanitizedName, role: sanitizedRole })
        return { success: false, error: `无法定位元素: nodeId=${nodeId}, name="${sanitizedName}"` }
      }

      // 匹配分数太低时拒绝点击（避免误操作）
      if (target.score < 30) {
        logWarn('browser', 'clickElement.lowScore', { nodeId, name: sanitizedName, score: target.score })
        return { success: false, error: `元素匹配度太低: score=${target.score}, name="${sanitizedName}"` }
      }

      // CDP 点击
      if (this.cdpAttached) {
        await this.window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x: target.x,
          y: target.y,
          button: 'left',
          clickCount: 1,
        })
        await this.window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x: target.x,
          y: target.y,
          button: 'left',
          clickCount: 1,
        })
      } else {
        // fallback: 用 JS click（POC 验证可行，但可能被 preventDefault 拦截）
        await this.window.webContents.executeJavaScript(`
          (function() {
            const els = document.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="link"]');
            for (const el of els) {
              const text = (el.textContent || el.value || el.getAttribute('aria-label') || '').trim();
              if (text.includes(${JSON.stringify(sanitizedName.slice(0, 30))})) {
                el.click();
                return true;
              }
            }
            return false;
          })()
        `)
      }

      // 等待页面响应
      await new Promise((resolve) => setTimeout(resolve, 1000))

      logInfo('browser', 'clickElement.success', {
        nodeId,
        name: sanitizedName,
        role: sanitizedRole,
        tag: target.tag,
        matchedText: (target.text || '').slice(0, 30),
        score: target.score,
        x: Math.round(target.x),
        y: Math.round(target.y),
      })

      return { success: true }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logError('browser', 'clickElement.error', { nodeId, error: errorMsg })
      return { success: false, error: errorMsg }
    }
  }

  /**
   * 在指定元素中输入文本
   * 策略：从 AXTree 获取 name+role → 在 DOM 中文本匹配定位 input → 聚焦 + CDP 输入
   *
   * @param nodeId AXTree 节点 ID（用于日志）
   * @param text 要输入的文本
   * @param name AXTree 节点的可访问性名称（用于 DOM 定位 input）
   * @param role AXTree 节点的 role
   */
  async typeText(nodeId: string, text: string, name?: string, _role?: string): Promise<CDPOperationResult> {
    if (!this.window) {
      return { success: false, error: '浏览器窗口未打开' }
    }

    try {
      const sanitizedName = (name || '').replace(/[`'"\\]/g, '')

      // 用 JS 找到匹配的输入框并聚焦
      const found = await this.window.webContents.executeJavaScript(`
        (function() {
          const targetName = ${JSON.stringify(sanitizedName)};
          const inputs = document.querySelectorAll('input[type="text"], input[type="search"], input:not([type]), textarea, [role="searchbox"], [role="textbox"]');
          let bestInput = null;
          let bestScore = -1;

          for (const input of inputs) {
            let score = 0;
            const ariaLabel = input.getAttribute('aria-label') || '';
            const placeholder = input.getAttribute('placeholder') || '';
            const title = input.getAttribute('title') || '';
            const inputText = [ariaLabel, placeholder, title].join(' ');

            if (targetName && inputText) {
              if (inputText.includes(targetName) || targetName.includes(inputText)) {
                score += 80;
              }
            }

            // 优先选择可见的输入框
            const rect = input.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              score += 20;
              if (rect.top >= 0 && rect.top < window.innerHeight) {
                score += 10;
              }
            }

            if (score > bestScore) {
              bestScore = score;
              bestInput = input;
            }
          }

          // 如果没有匹配到，尝试第一个可见 input
          if (!bestInput) {
            for (const input of inputs) {
              const rect = input.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                bestInput = input;
                break;
              }
            }
          }

          if (bestInput) {
            bestInput.focus();
            bestInput.value = '';
            return true;
          }
          return false;
        })()
      `)

      if (!found) {
        logWarn('browser', 'typeText.inputNotFound', { nodeId, name: sanitizedName })
        return { success: false, error: `未找到输入框: name="${sanitizedName}"` }
      }

      // 用 CDP 输入文本
      if (this.cdpAttached) {
        await this.window.webContents.debugger.sendCommand('Input.insertText', { text })
      } else {
        // fallback: 用 executeJavaScript 输入
        await this.window.webContents.executeJavaScript(`
          (function() {
            const active = document.activeElement;
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
              active.value = ${JSON.stringify(text)};
              active.dispatchEvent(new Event('input', { bubbles: true }));
              active.dispatchEvent(new Event('change', { bubbles: true }));
            }
          })()
        `)
      }

      logInfo('browser', 'typeText.success', { nodeId, name: sanitizedName, textLength: text.length })

      return { success: true }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logError('browser', 'typeText.error', { nodeId, error: errorMsg })
      return { success: false, error: errorMsg }
    }
  }

  /**
   * 滚动页面
   */
  async scrollPage(direction: 'up' | 'down'): Promise<CDPOperationResult> {
    if (!this.window) {
      return { success: false, error: '浏览器窗口未打开' }
    }

    try {
      const deltaY = direction === 'down' ? 500 : -500

      if (this.cdpAttached) {
        await this.window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
          type: 'mouseWheel',
          x: 640,
          y: 400,
          deltaX: 0,
          deltaY,
        })
      } else {
        // fallback: 用 JS 滚动
        await this.window.webContents.executeJavaScript(
          `window.scrollBy(0, ${deltaY})`
        )
      }

      // 等待滚动动画
      await new Promise((resolve) => setTimeout(resolve, 500))

      logInfo('browser', 'scrollPage.success', { direction })

      return { success: true }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logError('browser', 'scrollPage.error', { direction, error: errorMsg })
      return { success: false, error: errorMsg }
    }
  }

  /**
   * 提取当前页面文本（智能操作模式专用）
   * 在 Agent Loop 中使用，不需要关闭窗口
   */
  async extractCurrentPageText(): Promise<string> {
    if (!this.window) {
      return ''
    }

    try {
      // 等待一下让页面内容稳定
      await new Promise((resolve) => setTimeout(resolve, 500))

      const rawText = await this.window.webContents.executeJavaScript(EXTRACTION_SCRIPT)
      const text = cleanExtractedText(rawText || '')

      logInfo('browser', 'extractCurrentPage.success', { textLength: text.length })

      return text
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logError('browser', 'extractCurrentPage.error', { error: errorMsg })
      return ''
    }
  }

  /**
   * 关闭浏览器窗口并清理资源
   * v6.1: 增加 CDP detach 清理
   */
  async close(): Promise<void> {
    this.clearAutoCloseTimer()

    if (this.window) {
      // 先 detach CDP（如果已 attach）
      if (this.cdpAttached) {
        try {
          await this.detachCDP()
        } catch {
          // detach 失败不阻塞关闭
        }
      }
      this.window.destroy()
      this.window = null
    }

    logInfo('browser', 'close.done', {})
  }
}

/** 单例实例 */
export const browserService = new BrowserCDPService()
