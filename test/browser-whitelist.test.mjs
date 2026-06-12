/**
 * 浏览器白名单校验单元测试
 * 测试 BrowserCDPService.isUrlAllowed 的域名白名单逻辑
 * 直接运行：node test/browser-whitelist.test.mjs
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

// 白名单（与 src/shared/constants/index.ts 保持一致）
const BROWSER_DOMAIN_WHITELIST = [
  'xueqiu.com',
  'eastmoney.com',
  'cls.cn',
  '10jqka.com.cn',
  'sina.com.cn',
  'cninfo.com.cn',
  'cs.com.cn',
  'hexun.com',
]

// 复制 isUrlAllowed 逻辑
function isUrlAllowed(url, whitelist = BROWSER_DOMAIN_WHITELIST) {
  try {
    const hostname = new URL(url).hostname
    return whitelist.some((domain) => hostname === domain || hostname.endsWith('.' + domain))
  } catch {
    return false
  }
}

console.log('\n🌐 浏览器白名单校验 Tests\n')

// === 白名单内域名 ===
console.log('--- 白名单内域名 ---')
assert('雪球主域名', isUrlAllowed('https://xueqiu.com/S/SH600519'))
assert('雪球子域名', isUrlAllowed('https://stock.xueqiu.com/v5/stock/chart/kanban.json'))
assert('东方财富主域名', isUrlAllowed('https://eastmoney.com/a/123.html'))
assert('东方财富子域名', isUrlAllowed('https://finance.eastmoney.com/a/202401.html'))
assert('财联社主域名', isUrlAllowed('https://cls.cn/telegraph'))
assert('同花顺主域名', isUrlAllowed('https://10jqka.com.cn/'))
assert('新浪财经主域名', isUrlAllowed('https://sina.com.cn/'))
assert('新浪子域名', isUrlAllowed('https://finance.sina.com.cn/stock/'))
assert('巨潮资讯主域名', isUrlAllowed('https://cninfo.com.cn/'))
assert('上海证券报主域名', isUrlAllowed('https://cs.com.cn/'))
assert('和讯主域名', isUrlAllowed('https://hexun.com/'))

// === 非白名单域名 ===
console.log('\n--- 非白名单域名 ---')
assert('百度拒绝', !isUrlAllowed('https://www.baidu.com'))
assert('谷歌拒绝', !isUrlAllowed('https://www.google.com'))
assert('知乎拒绝', !isUrlAllowed('https://www.zhihu.com'))
assert('GitHub 拒绝', !isUrlAllowed('https://github.com'))
assert('钓鱼网站拒绝', !isUrlAllowed('https://evil-phishing.com/login'))

// === 边界情况 ===
console.log('\n--- 边界情况 ---')
assert('无效 URL 返回 false', !isUrlAllowed('not-a-url'))
assert('空字符串返回 false', !isUrlAllowed(''))
assert('纯域名字符串返回 false', !isUrlAllowed('xueqiu.com'))
assert('http 协议白名单域名通过', isUrlAllowed('http://xueqiu.com/'))
assert('https 协议白名单域名通过', isUrlAllowed('https://xueqiu.com/'))
assert('带端口白名单域名通过', isUrlAllowed('https://xueqiu.com:443/'))
assert('带路径白名单域名通过', isUrlAllowed('https://xueqiu.com/path/to/page?query=1'))

// === 子域名精确匹配 ===
console.log('\n--- 子域名匹配 ---')
assert('非子域名但包含白名单字符串拒绝', !isUrlAllowed('https://fakexueqiu.com/'))
assert('类似域名 but different TLD 拒绝', !isUrlAllowed('https://xueqiu.evil.com/'))
assert('深层子域名通过', isUrlAllowed('https://a.b.c.eastmoney.com/page'))

// === 自定义白名单 ===
console.log('\n--- 自定义白名单 ---')
assert('自定义白名单 - 包含', isUrlAllowed('https://custom.com/', ['custom.com']))
assert('自定义白名单 - 不包含', !isUrlAllowed('https://other.com/', ['custom.com']))
assert('空白名单全部拒绝', !isUrlAllowed('https://xueqiu.com/', []))

console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败\n`)
process.exit(fail > 0 ? 1 : 0)
