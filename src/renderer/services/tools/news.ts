import { registerTool } from './registry'
import { mockNewsSearch } from '../mocks'

/**
 * 新闻搜索工具
 */
registerTool(
  'news.search',
  'news.search',
  '搜索股票或行业新闻',
  (args: Record<string, unknown>) => {
    const keyword = String(args.keyword || '')
    const limit = typeof args.limit === 'number' ? args.limit : 5

    if (!keyword) {
      return '请提供搜索关键词'
    }

    const news = mockNewsSearch(keyword, limit)
    if (news.length === 0) {
      return `未找到与 "${keyword}" 相关的新闻`
    }

    return news
      .map(
        (item, index) =>
          `${index + 1}. ${item.title}\n   来源：${item.source} | ${item.time}\n   ${item.summary}`
      )
      .join('\n\n')
  }
)
