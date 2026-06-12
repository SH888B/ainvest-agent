/**
 * v6.1 浏览器智能操作模式单元测试
 * 覆盖：isActionSafe 安全检查、buildFinalUrl URL 构造、Prompt 注入防护、AXTree 过滤
 * 直接运行：node test/browser-agent.test.mjs
 */

let pass = 0
let fail = 0

function assert(name, condition) {
  if (condition) {
    console.log(`  ✅ ${name}`)
    pass++
  } else {
    console.log(`  ❌ ${name}`)
    fail++
  }
}

// ═══════════════════════════════════════
// 1. isActionSafe 安全检查逻辑
// ═══════════════════════════════════════

// 复制源码中的 DANGEROUS_ELEMENT_PATTERNS
const DANGEROUS_ELEMENT_PATTERNS = [
  /登录|注册|下载|购买|支付|删除|退出|注销|签约/i,
]

// 复制 isActionSafe 逻辑
const isActionSafe = (decision, axTree) => {
  if (decision.action !== 'click' || !decision.nodeId) return true
  const target = axTree.find((n) => n.nodeId === decision.nodeId)
  if (!target) return true
  if (DANGEROUS_ELEMENT_PATTERNS.some((p) => p.test(target.name))) return false
  return true
}

const mockAXTree = [
  { nodeId: '1', role: 'link', name: '中际旭创2024Q3业绩超预期' },
  { nodeId: '2', role: 'link', name: '中际旭创深度报告' },
  { nodeId: '3', role: 'button', name: '登录' },
  { nodeId: '4', role: 'button', name: '注册' },
  { nodeId: '5', role: 'button', name: '下载APP' },
  { nodeId: '6', role: 'link', name: '购买VIP' },
  { nodeId: '7', role: 'button', name: '搜索' },
  { nodeId: '8', role: 'textbox', name: '搜索关键词' },
]

console.log('\n🛡️  isActionSafe 安全检查测试\n')

// --- 非 click 操作始终安全 ---
console.log('--- 非 click 操作 ---')
assert('type 操作 → 安全', isActionSafe({ action: 'type', nodeId: '3' }, mockAXTree) === true)
assert('scroll 操作 → 安全', isActionSafe({ action: 'scroll', direction: 'down' }, mockAXTree) === true)
assert('extract 操作 → 安全', isActionSafe({ action: 'extract' }, mockAXTree) === true)
assert('done 操作 → 安全', isActionSafe({ action: 'done' }, mockAXTree) === true)

// --- 无 nodeId 的 click ---
console.log('\n--- 无 nodeId 的 click ---')
assert('click 无 nodeId → 安全', isActionSafe({ action: 'click' }, mockAXTree) === true)
assert('click nodeId 为空 → 安全', isActionSafe({ action: 'click', nodeId: '' }, mockAXTree) === true)

// --- AXTree 中找不到对应节点 ---
console.log('\n--- 找不到节点 ---')
assert('click 不存在的 nodeId → 安全（让 clickElement 自行处理）', isActionSafe({ action: 'click', nodeId: '999' }, mockAXTree) === true)

// --- 危险按钮拦截 ---
console.log('\n--- 危险按钮拦截 ---')
assert('click "登录" → 拦截', isActionSafe({ action: 'click', nodeId: '3' }, mockAXTree) === false)
assert('click "注册" → 拦截', isActionSafe({ action: 'click', nodeId: '4' }, mockAXTree) === false)
assert('click "下载APP" → 拦截', isActionSafe({ action: 'click', nodeId: '5' }, mockAXTree) === false)
assert('click "购买VIP" → 拦截', isActionSafe({ action: 'click', nodeId: '6' }, mockAXTree) === false)

// --- 正常链接放行 ---
console.log('\n--- 正常链接放行 ---')
assert('click 研报链接 → 放行', isActionSafe({ action: 'click', nodeId: '1' }, mockAXTree) === true)
assert('click 深度报告链接 → 放行', isActionSafe({ action: 'click', nodeId: '2' }, mockAXTree) === true)
assert('click "搜索" 按钮 → 放行', isActionSafe({ action: 'click', nodeId: '7' }, mockAXTree) === true)
assert('click 搜索框 → 放行', isActionSafe({ action: 'click', nodeId: '8' }, mockAXTree) === true)

// --- 危险关键词覆盖度 ---
console.log('\n--- 危险关键词覆盖度 ---')
const dangerousNames = ['登录', '注册', '下载客户端', '购买会员', '支付订单', '删除记录', '退出登录', '注销账号', '签约协议']
for (const name of dangerousNames) {
  const blocked = DANGEROUS_ELEMENT_PATTERNS.some((p) => p.test(name))
  assert(`"${name}" → ${blocked ? '拦截' : '漏放！'}`, blocked === true)
}

const safeNames = ['搜索', '查看更多', '展开', '阅读全文', '点击查看', '获取验证码', '下一步', '确认']
for (const name of safeNames) {
  const blocked = DANGEROUS_ELEMENT_PATTERNS.some((p) => p.test(name))
  assert(`"${name}" → ${blocked ? '误拦！' : '放行'}`, blocked === false)
}

// ═══════════════════════════════════════
// 2. buildFinalUrl URL 构造逻辑
// ═══════════════════════════════════════

const SEARCH_URL_TEMPLATES = {
  'baidu.com': 'https://www.baidu.com/s?wd={query}',
  'xueqiu.com': 'https://xueqiu.com/k?q={query}',
  'eastmoney.com': 'https://so.eastmoney.com/news/s?keyword={query}',
  'cls.cn': 'https://www.cls.cn/search?keyword={query}',
  'sina.com.cn': 'https://search.sina.com.cn/?q={query}',
  '10jqka.com.cn': 'https://www.10jqka.com.cn/search?q={query}',
  'cninfo.com.cn': 'https://www.cninfo.com.cn/search?keyword={query}',
  'cs.com.cn': 'https://www.cs.com.cn/search?q={query}',
  'hexun.com': 'https://so.hexun.com/?q={query}',
}

const buildFinalUrl = (toolArgs) => {
  if (toolArgs.url && typeof toolArgs.url === 'string') {
    return toolArgs.url
  }
  const query = toolArgs.query
  const domain = toolArgs.domain
  if (!query) {
    return 'https://www.baidu.com'
  }
  const targetDomain = domain && SEARCH_URL_TEMPLATES[domain] ? domain : 'baidu.com'
  const template = SEARCH_URL_TEMPLATES[targetDomain]
  return template.replace('{query}', encodeURIComponent(query))
}

console.log('\n\n🔗 buildFinalUrl URL 构造测试\n')

// --- 直接 URL ---
console.log('--- 直接 URL ---')
assert('有 url 时直接使用', buildFinalUrl({ url: 'https://xueqiu.com/S/SH600519' }) === 'https://xueqiu.com/S/SH600519')
assert('url 优先于 query', buildFinalUrl({ url: 'https://example.com', query: '测试' }) === 'https://example.com')

// --- 搜索 URL 构造 ---
console.log('\n--- 搜索 URL 构造 ---')
assert('百度搜索', buildFinalUrl({ query: '宁德时代', domain: 'baidu.com' }) === 'https://www.baidu.com/s?wd=%E5%AE%81%E5%BE%B7%E6%97%B6%E4%BB%A3')
assert('雪球搜索', buildFinalUrl({ query: '贵州茅台', domain: 'xueqiu.com' }) === 'https://xueqiu.com/k?q=%E8%B4%B5%E5%B7%9E%E8%8C%85%E5%8F%B0')
assert('东方财富搜索', buildFinalUrl({ query: '研报', domain: 'eastmoney.com' }) === 'https://so.eastmoney.com/news/s?keyword=%E7%A0%94%E6%8A%A5')

// --- 默认搜索域名 ---
console.log('\n--- 默认搜索域名 ---')
assert('无 domain → 默认百度', buildFinalUrl({ query: '测试' }) === 'https://www.baidu.com/s?wd=%E6%B5%8B%E8%AF%95')
assert('未知 domain → 默认百度', buildFinalUrl({ query: '测试', domain: 'unknown.com' }) === 'https://www.baidu.com/s?wd=%E6%B5%8B%E8%AF%95')

// --- 无 query 兜底 ---
console.log('\n--- 无 query 兜底 ---')
assert('无 url 无 query → 百度首页', buildFinalUrl({}) === 'https://www.baidu.com')
assert('只有 domain 无 query → 百度首页', buildFinalUrl({ domain: 'xueqiu.com' }) === 'https://www.baidu.com')

// --- 中文编码 ---
console.log('\n--- 中文编码 ---')
const cnUrl = buildFinalUrl({ query: '中际旭创 研报 最新', domain: 'baidu.com' })
assert('中文关键词被正确编码', cnUrl.includes('%E4%B8%AD%E9%99%85%E6%97%AD%E5%88%9B'))
assert('编码后 URL 可解析', (() => { try { new URL(cnUrl); return true } catch { return false } })())

// --- 所有搜索模板可用 ---
console.log('\n--- 所有搜索模板 ---')
for (const domain of Object.keys(SEARCH_URL_TEMPLATES)) {
  const url = buildFinalUrl({ query: 'test', domain })
  assert(`${domain} 模板可构造 URL`, url.startsWith('https://'))
}

// ═══════════════════════════════════════
// 3. Prompt 注入防护
// ═══════════════════════════════════════

const sanitizeUserInput = (input) => input.replace(/[{}]/g, '')

console.log('\n\n🔒 Prompt 注入防护测试\n')

assert('正常输入不变', sanitizeUserInput('查一下宁德时代的研报') === '查一下宁德时代的研报')
assert('花括号被移除', sanitizeUserInput('{userInput}') === 'userInput')
assert('双花括号被移除', sanitizeUserInput('{{inject}}') === 'inject')
assert('混合花括号', sanitizeUserInput('test{url}test') === 'testurltest')
assert('只有花括号', sanitizeUserInput('{}') === '')
assert('空字符串不变', sanitizeUserInput('') === '')
assert('注入 {url} 占位符', sanitizeUserInput('{url}') === 'url')
assert('注入 {title} 占位符', sanitizeUserInput('{title}') === 'title')
assert('注入 {axTree} 占位符', sanitizeUserInput('{axTree}') === 'axTree')
assert('注入 {steps} 占位符', sanitizeUserInput('{steps}') === 'steps')

// ═══════════════════════════════════════
// 4. AXTree 简化过滤逻辑
// ═══════════════════════════════════════

const EXCLUDED_ROLES = new Set(['generic', 'presentation', 'none', 'Ignored', 'LineBreak'])
const INTERACTIVE_ROLES = new Set(['button', 'link', 'textbox', 'combobox', 'searchbox', 'checkbox', 'radio', 'tab', 'menuitem', 'option'])
const MAX_AX_NODES = 50

const simplifyAXTree = (rawNodes) => {
  return rawNodes
    .filter((n) => {
      const role = n.role?.value || ''
      const name = n.name?.value || ''
      return !EXCLUDED_ROLES.has(role) && name.length > 0
    })
    .map((n) => ({
      nodeId: String(n.nodeId || ''),
      role: n.role?.value || 'unknown',
      name: n.name?.value || '',
      value: n.value?.value || undefined,
    }))
    .sort((a, b) => {
      const aI = INTERACTIVE_ROLES.has(a.role) ? 0 : 1
      const bI = INTERACTIVE_ROLES.has(b.role) ? 0 : 1
      return aI - bI
    })
    .slice(0, MAX_AX_NODES)
}

console.log('\n\n🌳 AXTree 简化过滤测试\n')

// --- 过滤无语义节点 ---
console.log('--- 过滤无语义节点 ---')
const rawNodes = [
  { nodeId: '1', role: { value: 'link' }, name: { value: '研报链接' } },
  { nodeId: '2', role: { value: 'generic' }, name: { value: '容器' } },
  { nodeId: '3', role: { value: 'presentation' }, name: { value: '装饰' } },
  { nodeId: '4', role: { value: 'none' }, name: { value: '隐藏' } },
  { nodeId: '5', role: { value: 'button' }, name: { value: '搜索' } },
  { nodeId: '6', role: { value: 'Ignored' }, name: { value: '忽略' } },
  { nodeId: '7', role: { value: 'link' }, name: { value: '' } },  // 无名称
  { nodeId: '8', role: { value: 'LineBreak' }, name: { value: '换行' } },
]

const simplified = simplifyAXTree(rawNodes)
assert('过滤 generic', !simplified.find(n => n.role === 'generic'))
assert('过滤 presentation', !simplified.find(n => n.role === 'presentation'))
assert('过滤 none', !simplified.find(n => n.role === 'none'))
assert('过滤 Ignored', !simplified.find(n => n.role === 'Ignored'))
assert('过滤 LineBreak', !simplified.find(n => n.role === 'LineBreak'))
assert('过滤无名称节点', !simplified.find(n => n.name === ''))
assert('保留有名称的 link', !!simplified.find(n => n.name === '研报链接'))
assert('保留有名称的 button', !!simplified.find(n => n.name === '搜索'))
assert('简化后只有 2 个节点', simplified.length === 2)

// --- 排序：交互元素优先 ---
console.log('\n--- 排序：交互元素优先 ---')
const mixedNodes = [
  { nodeId: '1', role: { value: 'heading' }, name: { value: '标题' } },
  { nodeId: '2', role: { value: 'link' }, name: { value: '链接' } },
  { nodeId: '3', role: { value: 'StaticText' }, name: { value: '静态文本' } },
  { nodeId: '4', role: { value: 'button' }, name: { value: '按钮' } },
  { nodeId: '5', role: { value: 'textbox' }, name: { value: '输入框' } },
]

const sorted = simplifyAXTree(mixedNodes)
assert('交互元素排在前面', sorted[0].role === 'link' || sorted[0].role === 'button' || sorted[0].role === 'textbox')
assert('非交互元素排在后面', sorted[sorted.length - 1].role === 'heading' || sorted[sorted.length - 1].role === 'StaticText')

// --- 截断 ---
console.log('\n--- 截断 ---')
const manyNodes = Array.from({ length: 100 }, (_, i) => ({
  nodeId: String(i),
  role: { value: 'link' },
  name: { value: `链接${i}` },
}))
const truncated = simplifyAXTree(manyNodes)
assert('超过 50 节点时截断', truncated.length === 50)
assert('截断保留前 50 个', truncated[0].name === '链接0')

// --- 空输入 ---
console.log('\n--- 空输入 ---')
assert('空数组返回空', simplifyAXTree([]).length === 0)

// --- 缺失字段 ---
console.log('\n--- 缺失字段 ---')
const missingFieldNodes = [
  { nodeId: '1', role: { value: 'link' } },  // 无 name 字段
  { nodeId: '2', name: { value: '无名角色' } },  // 无 role 字段 → role 为 undefined → role?.value 为 undefined → 变成 'unknown'
  { nodeId: '3', role: { value: 'button' }, name: { value: '正常按钮' } },
]
const withMissing = simplifyAXTree(missingFieldNodes)
// nodeId:1 无 name → name?.value = undefined → name.length 报错 → 被 filter 过滤
// nodeId:2 有 name='无名角色' 但 role 为 undefined → role?.value = undefined → 映射为 'unknown'，但 name.length > 0 → 保留
// nodeId:3 正常 → 保留
assert('无 name 的节点被过滤（undefined.value）', !withMissing.find(n => n.nodeId === '1'))
assert('有 name 无 role 的节点保留（role→unknown）', !!withMissing.find(n => n.nodeId === '2' && n.role === 'unknown'))
assert('正常节点保留', !!withMissing.find(n => n.name === '正常按钮'))

// ═══════════════════════════════════════
// 5. detectDomainFromInput 域名检测
// ═══════════════════════════════════════

const DOMAIN_KEYWORDS = [
  { keywords: ['东方财富', '东方财富网', 'eastmoney'], domain: 'eastmoney.com' },
  { keywords: ['雪球', 'xueqiu'], domain: 'xueqiu.com' },
  { keywords: ['同花顺', '10jqka'], domain: '10jqka.com.cn' },
  { keywords: ['财联社', 'cls'], domain: 'cls.cn' },
  { keywords: ['新浪', 'sina'], domain: 'sina.com.cn' },
  { keywords: ['巨潮', 'cninfo'], domain: 'cninfo.com.cn' },
  { keywords: ['百度', 'baidu'], domain: 'baidu.com' },
]

const detectDomainFromInput = (input) => {
  for (const { keywords, domain } of DOMAIN_KEYWORDS) {
    if (keywords.some((kw) => input.includes(kw))) {
      return domain
    }
  }
  return 'baidu.com'
}

console.log('\n\n🌐 detectDomainFromInput 域名检测测试\n')

assert('东方财富 → eastmoney.com', detectDomainFromInput('在东方财富搜一下') === 'eastmoney.com')
assert('东方财富网 → eastmoney.com', detectDomainFromInput('打开东方财富网') === 'eastmoney.com')
assert('eastmoney → eastmoney.com', detectDomainFromInput('用eastmoney搜索') === 'eastmoney.com')
assert('雪球 → xueqiu.com', detectDomainFromInput('雪球上看茅台') === 'xueqiu.com')
assert('同花顺 → 10jqka.com.cn', detectDomainFromInput('同花顺查一下') === '10jqka.com.cn')
assert('财联社 → cls.cn', detectDomainFromInput('财联社快讯') === 'cls.cn')
assert('新浪 → sina.com.cn', detectDomainFromInput('新浪财经') === 'sina.com.cn')
assert('巨潮 → cninfo.com.cn', detectDomainFromInput('巨潮资讯') === 'cninfo.com.cn')
assert('百度 → baidu.com', detectDomainFromInput('百度搜') === 'baidu.com')
assert('无关键词 → baidu.com', detectDomainFromInput('帮我查一下宁德时代') === 'baidu.com')
assert('优先匹配第一个', detectDomainFromInput('东方财富和雪球') === 'eastmoney.com')

// ═══════════════════════════════════════
// 6. extractFallbackBrowseQuery 兜底查询提取
// ═══════════════════════════════════════

const extractFallbackBrowseQuery = (input) => {
  let text = input
  const platformNames = ['东方财富网', '东方财富', '雪球', '同花顺', '财联社', '新浪财经', '新浪', '百度', '东方']
  for (const name of platformNames) {
    text = text.replace(new RegExp(name, 'g'), ' ')
  }
  const directivePatterns = [
    /搜[一一下]*索?/g,
    /查[一一下]*/g,
    /找[一一下]*/g,
    /看[一一下看]*/g,
    /浏览/g,
    /打开/g,
    /帮[我咱]/g,
    /给[我咱]/g,
    /请/g,
    /能否/g,
    /可以/g,
    /我想/g,
    /想要/g,
    /并给/g,
    /并[做出提写]/g,
    /总结[一一下]*/g,
    /汇总/g,
    /梳理/g,
    /归纳/g,
    /整理[一一下]*/g,
  ]
  for (const pattern of directivePatterns) {
    text = text.replace(pattern, ' ')
  }
  text = text
    .replace(/[，。！？、；：""''（）\[\]【】]/g, ' ')
    .replace(/和[给出]/g, ' ')
    .replace(/^的|的$/gm, ' ')
  const segments = text
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 20)
  const noiseWords = new Set([
    '一下', '然后', '之后', '接着', '那个', '这个', '什么', '怎么',
    '如何', '为啥', '为什么', '多少', '几', '吗', '呢', '吧', '啊',
    '的', '了', '着', '过', '在', '是', '有', '不', '也', '都',
    '还', '就', '又', '把', '被', '让', '到', '很', '会', '能', '要',
  ])
  const keywords = segments.filter((s) => !noiseWords.has(s))
  const unique = [...new Set(keywords)]
  if (unique.length === 0) {
    const fallback = input.replace(/[，。！？、；：""''（）\[\]【】]/g, ' ').trim()
    return fallback.length >= 2 ? fallback.slice(0, 30) : input.slice(0, 20)
  }
  return unique.join(' ')
}

console.log('\n\n🔍 extractFallbackBrowseQuery 兜底提取测试\n')

assert('"帮我查宁德时代" → "宁德时代"', extractFallbackBrowseQuery('帮我查宁德时代') === '宁德时代')
assert('"请搜索茅台研报" → "茅台研报"', extractFallbackBrowseQuery('请搜索茅台研报') === '茅台研报')
assert('"在东方财富搜索中际旭创" → "中际旭创"', extractFallbackBrowseQuery('在东方财富搜索中际旭创') === '中际旭创')
assert('"雪球搜一下中际旭创的最新催化，给我总结一下，并给催化观察和出投资建议" 包含关键词', (() => {
  const r = extractFallbackBrowseQuery('雪球搜一下中际旭创的最新催化，给我总结一下，并给催化观察和出投资建议')
  return r.includes('中际旭创') && r.includes('催化') && r.includes('投资建议')
})())
assert('"最新财经新闻" → "最新财经新闻"', extractFallbackBrowseQuery('最新财经新闻') === '最新财经新闻')
assert('"最近有什么好股票" → "最近有什么好股票"', extractFallbackBrowseQuery('最近有什么好股票') === '最近有什么好股票')
assert('"百度搜宁德时代研报" → "宁德时代研报"', extractFallbackBrowseQuery('百度搜宁德时代研报') === '宁德时代研报')
assert('"帮我查一下中际旭创的最新催化" 包含关键词', (() => {
  const r = extractFallbackBrowseQuery('帮我查一下中际旭创的最新催化')
  return r.includes('中际旭创') && r.includes('催化')
})())
assert('"东方财富搜贵州茅台新闻" → "贵州茅台新闻"', extractFallbackBrowseQuery('东方财富搜贵州茅台新闻') === '贵州茅台新闻')
assert('空输入 → 空字符串', extractFallbackBrowseQuery('') === '')

// ═══════════════════════════════════════
// 结果汇总
// ═══════════════════════════════════════

console.log(`\n\n📊 测试结果: ${pass} 通过, ${fail} 失败\n`)

if (fail > 0) {
  console.log('⚠️  有测试未通过，请检查！')
} else {
  console.log('🎉 全部测试通过！')
}

process.exit(fail > 0 ? 1 : 0)
