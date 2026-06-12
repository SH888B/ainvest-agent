import { registerTool } from './registry'
import { ToolDefinition } from '@shared/types'
import { BROWSER_DOMAIN_WHITELIST } from '@shared/constants'
import { logInfo, logError } from '../logger/logger'

/**
 * 浏览器自动化工具
 * 通过 CDP 打开网页并提取内容
 * v6.0.0 新增
 * v6.0.1: 重构为"搜索优先"模式，LLM 生成搜索关键词而非完整 URL
 */

/** 浏览器工具定义 */
export const BROWSER_TOOL_DEFINITION: ToolDefinition = {
  name: 'browser.open',
  description: '搜索或打开金融网站并提取内容，用于获取实时信息。默认通过百度搜索获取最全面的结果，也支持雪球、东方财富等金融网站。',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: '要访问的网页 URL（如果已知完整 URL）',
      },
      query: {
        type: 'string',
        description: '搜索关键词（如"宁德时代 研报"），系统自动构造搜索 URL',
      },
      domain: {
        type: 'string',
        description: '目标网站域名（如 xueqiu.com、eastmoney.com）',
      },
      action: {
        type: 'string',
        enum: ['snapshot', 'screenshot'],
        description: '提取方式：snapshot(文本) 或 screenshot(截图)',
      },
    },
  },
}

/** 站内搜索 URL 模板 */
const SEARCH_URL_TEMPLATES: Record<string, string> = {
  'baidu.com':     'https://www.baidu.com/s?wd={query}',
  'xueqiu.com':    'https://xueqiu.com/k?q={query}',
  'eastmoney.com': 'https://so.eastmoney.com/news/s?keyword={query}',
  'cls.cn':        'https://www.cls.cn/search?keyword={query}',
  'sina.com.cn':   'https://search.sina.com.cn/?q={query}',
  '10jqka.com.cn': 'https://www.10jqka.com.cn/search?q={query}',
  'cninfo.com.cn': 'https://www.cninfo.com.cn/search?keyword={query}',
  'cs.com.cn':     'https://www.cs.com.cn/search?q={query}',
  'hexun.com':     'https://so.hexun.com/?q={query}',
}

/** 默认搜索域名（百度搜索：SSR 渲染，提取最可靠） */
const DEFAULT_SEARCH_DOMAIN = 'baidu.com'

/**
 * 根据搜索关键词和域名构造搜索 URL
 */
export const buildSearchUrl = (query: string, domain?: string): string => {
  const targetDomain = domain && SEARCH_URL_TEMPLATES[domain] ? domain : DEFAULT_SEARCH_DOMAIN
  const template = SEARCH_URL_TEMPLATES[targetDomain]
  const encodedQuery = encodeURIComponent(query)
  return template.replace('{query}', encodedQuery)
}

/**
 * 执行浏览器工具
 */
export const executeBrowserTool = async (args: {
  url?: string
  query?: string
  domain?: string
  action?: 'snapshot' | 'screenshot'
}): Promise<string> => {
  // 确定最终 URL：优先用 url，其次用 query 构造搜索 URL，最后兜底
  let finalUrl = args.url || ''
  const action = args.action || 'snapshot'

  if (!finalUrl) {
    // 如果 LLM 提取了 query，用 query 构造搜索 URL
    // 如果 query 也没有，返回错误（agentEngine 层已有兜底，不应该走到这里）
    const query = args.query
    if (query) {
      finalUrl = buildSearchUrl(query, args.domain)
      logInfo('browser', 'tool.searchUrl', { query, domain: args.domain, searchUrl: finalUrl })
    }
  }

  // 如果仍然没有 URL，返回错误
  if (!finalUrl) {
    return '错误：无法确定要访问的网址，请尝试更具体的描述。'
  }

  logInfo('browser', 'tool.start', { url: finalUrl, action })

  // 1. 安全检查：域名白名单
  let hostname: string
  try {
    hostname = new URL(finalUrl).hostname
  } catch {
    return `错误：URL 格式不正确：${finalUrl}`
  }

  const allowed = BROWSER_DOMAIN_WHITELIST.some(
    (domain) => hostname === domain || hostname.endsWith('.' + domain)
  )
  if (!allowed) {
    logError('browser', 'tool.notWhitelisted', { url: finalUrl, hostname })
    return `错误：域名 ${hostname} 不在允许访问列表中。支持的网站：${BROWSER_DOMAIN_WHITELIST.join('、')}`
  }

  // 2. 执行浏览
  try {
    const result = await window.browser.open({ url: finalUrl })
    if (!result.success) {
      logError('browser', 'tool.failed', { url: finalUrl, error: result.error })
      return `浏览失败：${result.error || '未知错误'}`
    }

    // 3. 根据 action 返回结果
    if (action === 'screenshot') {
      const screenshot = await window.browser.screenshot()

      if (!screenshot.success) {
        await window.browser.close()
        return `已访问 ${result.title}，但截图失败：${screenshot.error}`
      }

      await window.browser.close()
      logInfo('browser', 'tool.screenshot.done', { url: finalUrl, title: result.title })
      return `已访问 ${result.title}\n网页内容摘要：\n${result.text.slice(0, 500)}...\n[截图已生成]`
    }

    await window.browser.close()
    logInfo('browser', 'tool.snapshot.done', { url: finalUrl, title: result.title, textLength: result.text.length })
    return `已访问 ${result.title} (${result.url})\n\n提取内容：\n${result.text}`
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logError('browser', 'tool.error', { url: finalUrl, error: errorMsg })
    // 确保清理
    try { await window.browser.close() } catch { /* ignore */ }
    return `浏览失败：${errorMsg}`
  }
}

// 注册工具
registerTool(
  'web.browse',
  'browser.open',
  '搜索或打开金融网站并提取内容（如雪球、东方财富等金融网站）',
  async (args: Record<string, unknown>) => {
    return executeBrowserTool({
      url: args.url ? String(args.url) : undefined,
      query: args.query ? String(args.query) : undefined,
      domain: args.domain ? String(args.domain) : undefined,
      action: (args.action as 'snapshot' | 'screenshot') || 'snapshot',
    })
  }
)
