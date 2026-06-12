/**
 * Intent Classifier 本地正则测试
 * 对齐源码 src/renderer/services/agent/intentClassifier.ts 中的 LOCAL_RULES
 * 直接运行：node test/intent-classifier.test.mjs
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

// 复制源码中的 LOCAL_RULES（与 intentClassifier.ts 完全对齐）
const LOCAL_RULES = [
  // market.query
  { pattern: /(行情|价格|多少钱|股价|涨跌|涨了|跌了|涨跌幅|市值|市盈率|PE|PB|成交量|走势|K线).*?(\d{6}|[A-Z]{2,5})/, intent: 'market.query', confidence: 0.9 },
  { pattern: /(\d{6}|[A-Z]{2,5}).*?(行情|价格|多少钱|股价|涨跌|涨了|跌了|市值|市盈率|PE|PB|成交量|走势)/, intent: 'market.query', confidence: 0.9 },
  { pattern: /(行情|价格|多少钱|股价|涨跌|涨了|跌了|市值|市盈率|PE|PB|成交量|走势).{0,5}([\u4e00-\u9fa5]{2,6}|[A-Z]{2,5})/, intent: 'market.query', confidence: 0.8 },
  { pattern: /([\u4e00-\u9fa5]{2,6}|[A-Z]{2,5}).{0,5}(行情|价格|多少钱|股价|涨跌|涨了|跌了|市值|市盈率|PE|PB|成交量|走势)/, intent: 'market.query', confidence: 0.8 },
  { pattern: /(看看|查|查询|查一下).{0,5}([\u4e00-\u9fa5]{2,6}|[A-Z]{2,5}).{0,3}(行情|价格|股价|成交量|PE|PB)/, intent: 'market.query', confidence: 0.75 },
  // news.search
  { pattern: /(新闻|资讯|消息|报道|最新消息|热点).{0,5}(\d{6}|[A-Z]{2,5}|[\u4e00-\u9fa5]{2,6})/, intent: 'news.search', confidence: 0.8 },
  { pattern: /(\d{6}|[A-Z]{2,5}|[\u4e00-\u9fa5]{2,6}).{0,5}(新闻|资讯|消息|报道)/, intent: 'news.search', confidence: 0.8 },
  { pattern: /(搜|搜索|查|查找).{0,5}(新闻|资讯|消息)/, intent: 'news.search', confidence: 0.8 },
  { pattern: /(有什么|最新|最近).{0,3}(新闻|资讯|消息)/, intent: 'news.search', confidence: 0.75 },
  // strategy.backtest
  { pattern: /(回测|策略|测试|回测一下|策略测试|历史回测)/, intent: 'strategy.backtest', confidence: 0.85 },
  // stock.profile
  { pattern: /(档案|基本面|公司简介|公司信息|公司是做什么的|做什么业务|简介|介绍|是干什么的).*?(\d{6}|[A-Z]{2,5}|[\u4e00-\u9fa5]{2,6})/, intent: 'stock.profile', confidence: 0.8 },
  { pattern: /(\d{6}|[A-Z]{2,5}|[\u4e00-\u9fa5]{2,6}).*?(档案|基本面|公司简介|公司信息|简介|介绍|是做什么的|是干什么的)/, intent: 'stock.profile', confidence: 0.8 },
  // session.manage
  { pattern: /(新建|创建|新开|新增).{0,3}(对话|会话|聊天)/, intent: 'session.manage', confidence: 0.9 },
  { pattern: /(删除|移除|清除|删掉).{0,3}(对话|会话|聊天|历史)/, intent: 'session.manage', confidence: 0.9 },
  { pattern: /(切换|换到|转到|跳到).{0,10}(对话|会话)/, intent: 'session.manage', confidence: 0.9 },
  { pattern: /(对话|会话).{0,5}(切换|换到|转到|跳到)/, intent: 'session.manage', confidence: 0.9 },
  { pattern: /(重命名|改名|改名字|改名成).{0,10}(对话|会话)/, intent: 'session.manage', confidence: 0.9 },
  { pattern: /(对话|会话).{0,5}(重命名|改名|改名字)/, intent: 'session.manage', confidence: 0.9 },
  // shell.execute
  { pattern: /(运行|执行|调用|跑|跑一下|执行一下).{0,5}(python|node|npm|git|curl)/i, intent: 'shell.execute', confidence: 0.9 },
  { pattern: /(python|node|npm|git|curl).{0,5}(运行|执行|调用|跑|脚本)/i, intent: 'shell.execute', confidence: 0.9 },
  { pattern: /(查看|列出|显示|查一下).{0,5}(文件|目录|文件夹|workspace)/i, intent: 'shell.execute', confidence: 0.85 },
  { pattern: /^(ls|dir|cat|type|grep|find)\s+/i, intent: 'shell.execute', confidence: 0.85 },
  // web.browse
  { pattern: /(查|搜索|看看|打开|浏览).{0,10}(网页|网站|研报|新闻|公告|雪球|东方财富|同花顺|财联社)/, intent: 'web.browse', confidence: 0.85 },
  { pattern: /(雪球|东方财富|同花顺|财联社).{0,10}(查|搜索|看看)/, intent: 'web.browse', confidence: 0.85 },
  { pattern: /(最新|最近).{0,5}(研报|公告|新闻|资讯).{0,5}(哪里|怎么|哪里看|在哪)/, intent: 'web.browse', confidence: 0.8 },
  // preference.update
  { pattern: /(风险偏好|风险|偏好|关注板块|关注|我喜欢|我不喜欢|记住|记住我)/, intent: 'preference.update', confidence: 0.75 },
  // general.chat
  { pattern: /^(你好|您好|嗨|hello|hi|hey|早上好|下午好|晚上好|再见|拜拜|谢谢|感谢|辛苦了|不客气)$/i, intent: 'general.chat', confidence: 0.95 },
  { pattern: /(天气|今天几号|现在几点|吃饭了吗|在吗|有人吗)/, intent: 'general.chat', confidence: 0.9 },
  { pattern: /(投资建议|推荐|买什么|怎么看|好不好|怎么样|值得买吗|能买吗|可以入手吗|帮忙分析).*?(\d{6}|[A-Z]{2,5}|[\u4e00-\u9fa5]{2,6})?/, intent: 'general.chat', confidence: 0.7 },
  { pattern: /(大盘|指数|A股|美股|港股|市场|牛市|熊市).{0,5}(怎么样|如何|走势|看法|观点|分析)?/, intent: 'general.chat', confidence: 0.7 },
  { pattern: /^(好的|OK|嗯|哦|知道了|明白了|了解)$/, intent: 'general.chat', confidence: 0.8 },
]

const classifyIntentLocal = (text) => {
  for (const rule of LOCAL_RULES) {
    if (rule.pattern.test(text)) {
      return { intent: rule.intent, confidence: rule.confidence }
    }
  }
  return null
}

console.log('\n🧠 Intent Classifier Local Rules Tests\n')

// === Shell Execute 意图测试 ===
console.log('--- shell.execute ---')
assert('运行 python test.py', classifyIntentLocal('运行 python test.py')?.intent === 'shell.execute')
assert('跑 node app.js', classifyIntentLocal('跑 node app.js')?.intent === 'shell.execute')
assert('执行 git status', classifyIntentLocal('执行 git status')?.intent === 'shell.execute')
assert('调用 npm install', classifyIntentLocal('调用 npm install')?.intent === 'shell.execute')
assert('查看 workspace 目录', classifyIntentLocal('查看 workspace 目录')?.intent === 'shell.execute')
assert('ls -la', classifyIntentLocal('ls -la')?.intent === 'shell.execute')
assert('dir /workspace', classifyIntentLocal('dir /workspace')?.intent === 'shell.execute')
assert('cat file.txt', classifyIntentLocal('cat file.txt')?.intent === 'shell.execute')

// 误判修复
assert('Elasticsearch 不触发 shell', classifyIntentLocal('Elasticsearch 集群状态')?.intent !== 'shell.execute')

// === Market Query 测试 ===
console.log('\n--- market.query ---')
assert('茅台行情 → market.query', classifyIntentLocal('茅台今天行情怎么样')?.intent === 'market.query')
assert('600519行情', classifyIntentLocal('600519行情')?.intent === 'market.query')

// === News Search 测试 ===
console.log('\n--- news.search ---')
assert('宁德时代新闻 → news.search', classifyIntentLocal('宁德时代有什么新闻')?.intent === 'news.search')
assert('搜索新闻', classifyIntentLocal('搜索新闻')?.intent === 'news.search')

// === Strategy Backtest 测试 ===
console.log('\n--- strategy.backtest ---')
assert('回测策略 → strategy.backtest', classifyIntentLocal('帮我回测一下均线策略')?.intent === 'strategy.backtest')
assert('历史回测', classifyIntentLocal('历史回测')?.intent === 'strategy.backtest')

// === Stock Profile 测试 ===
console.log('\n--- stock.profile ---')
assert('个股档案 → stock.profile', classifyIntentLocal('查看 600519 的档案')?.intent === 'stock.profile')

// === Session Manage 测试 ===
console.log('\n--- session.manage ---')
assert('新建对话 → session.manage', classifyIntentLocal('新建一个对话')?.intent === 'session.manage')
assert('删除会话', classifyIntentLocal('删除会话')?.intent === 'session.manage')

// === Preference Update 测试 ===
console.log('\n--- preference.update ---')
assert('风险偏好 → preference.update', classifyIntentLocal('设置我的风险偏好为稳健')?.intent === 'preference.update')
assert('我喜欢', classifyIntentLocal('我喜欢新能源板块')?.intent === 'preference.update')

// === General Chat 测试 ===
console.log('\n--- general.chat ---')
assert('你好 → general.chat', classifyIntentLocal('你好')?.intent === 'general.chat')
assert('大盘怎么样 → general.chat', classifyIntentLocal('大盘怎么样')?.intent === 'general.chat')

// === Web Browse 测试 ===
console.log('\n--- web.browse ---')
assert('查雪球网页 → web.browse', classifyIntentLocal('查一下雪球网页')?.intent === 'web.browse')
assert('东方财富看看 → web.browse', classifyIntentLocal('在东方财富看看')?.intent === 'web.browse')
assert('最新研报哪里看 → web.browse', classifyIntentLocal('最新研报哪里看')?.intent === 'web.browse')
assert('打开雪球看看 → web.browse', classifyIntentLocal('打开雪球看看')?.intent === 'web.browse')
assert('浏览东方财富 → web.browse', classifyIntentLocal('浏览东方财富研报')?.intent === 'web.browse')

console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败\n`)
process.exit(fail > 0 ? 1 : 0)
