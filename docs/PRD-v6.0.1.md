# AInvest Agent 产品需求文档

> **当前版本**：v6.0.1  
> **日期**：2026-06-12  
> **状态**：已发布  
> **本文档是唯一活 PRD，历史版本见 Git**

---

## 一、产品概述

AInvest Agent 是一个 **LLM 驱动的桌面智能投研助手**，用户通过自然语言对话即可完成股票行情查询、金融网站实时信息抓取、策略回测、个股档案查看等投研任务。

v6 核心目标：**"Agent 不再卡顿，还能上网查资料"**

- v6.0.0：修复 3 个核心体验 Bug + 浏览器自动化能力
- v6.0.1：修复 15 个集成测试问题，浏览器自动化重构为"搜索优先"模式

---

## 二、用户故事

### P0 — 核心体验

| ID | 用户故事 | 状态 |
|----|---------|------|
| US-601 | 点击"新建 Session"应立即响应，不重复创建 | ✅ 已修复 |
| US-602 | 流式输出完成后应正常显示，不需切换 Session | ✅ 已修复 |
| US-603 | 连续多轮对话后新消息应即时显示 | ✅ 已修复 |

### P1 — 浏览器自动化

| ID | 用户故事 | 状态 |
|----|---------|------|
| US-604 | 问"宁德时代研报"→ Agent 自动搜索并返回内容 | ✅ 已修复 |
| US-605 | Agent 访问网页前展示进度和目标网站 | ✅ 已实现 |
| US-606 | Agent 浏览后可展示截图 | ✅ 已实现 |
| US-607 | Agent 只能访问白名单中的金融网站 | ✅ 已实现 |
| US-608 | 说"东方财富搜一下"→ 用东方财富而非百度 | ✅ 已修复 |
| US-609 | 说"搜新闻"→ 打开真实网站而非 mock 数据 | ✅ 已修复 |
| US-610 | 说"我之前关注哪些公司"→ 检索记忆回答 | ✅ 已修复 |

---

## 三、功能列表

### 3.1 Bug 修复记录（v6.0.1）

| BUG | 问题 | 修复方案 | 状态 |
|-----|------|---------|------|
| BUG-01 | 自动归档与创建竞态 | 新增 `autoArchiveOnNewSession` 开关（默认关闭） | ✅ |
| BUG-02 | 重启后恢复旧 Session | `onRehydrateStorage` 重置 `currentSessionId` | ✅ |
| BUG-03 | 设置弹窗关闭后输入框失焦 | `requestAnimationFrame(() => inputRef.focus())` | ✅ |
| BUG-04 | web.browse 参数提取返回空 | "搜索优先"重构：LLM 生成 query+domain，本地构造 URL | ✅ |
| BUG-05 | zustand selector 无限 re-render | `EMPTY_MESSAGES` 常量 + `??` 运算符 | ✅ |
| BUG-06 | createSession 按钮无响应 | 移除 `setCreating`，由 `createSession` 内部管理 | ✅ |
| BUG-07 | SPA 页面内容提取为空 | 智能轮询（500ms 间隔，5s 超时） | ✅ |
| BUG-08 | 意图分类首匹配优先 | 改为最高置信度匹配 | ✅ |
| BUG-09 | CDP 编码问题导致所有网站提取为空 | `Runtime.evaluate` → `executeJavaScript` | ✅ |
| BUG-10 | 新 Session 自动命名不触发 | `createSession()` 后用 `getState()` 获取最新 sessions | ✅ |
| BUG-11 | 浏览器 toggle 状态未持久化 | 迁移到 `usePreferenceStore` | ✅ |
| BUG-12 | 用户指定域名但 fallback 用百度 | `detectDomainFromInput()` 检测用户输入中的域名 | ✅ |
| BUG-13 | web.browse 不匹配"搜"和"资讯" | 正则加"搜"和"资讯" | ✅ |
| BUG-14 | news.search 返回 mock 数据 | 合并 news.search → web.browse | ✅ |
| BUG-15 | preference.update 误匹配查询意图 | 精确化正则，只匹配明确更新意图 | ✅ |

### 3.2 浏览器自动化（搜索优先模式）

#### 架构

```
用户输入 → 意图识别(web.browse) → 工具参数提取(LLM → query+domain)
  → 本地构造搜索 URL(SEARCH_URL_TEMPLATES)
  → 主进程 executeJavaScript 提取内容
  → LLM 基于工具结果生成回复
```

#### 工具参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `url` | string? | 已知完整 URL（直接访问） |
| `query` | string? | 搜索关键词（如"宁德时代 研报"） |
| `domain` | string? | 目标域名（如 `eastmoney.com`），默认 `baidu.com` |
| `action` | string? | `snapshot`（文本）或 `screenshot`（截图），默认 `snapshot` |

#### 参数处理优先级

1. LLM 返回有效 `url` → 直接访问
2. LLM 返回 `query` + `domain` → 构造搜索 URL
3. LLM 返回 `query` 无 `domain` → `detectDomainFromInput` 补充
4. LLM 返回空 → `extractFallbackBrowseQuery` 兜底 + `detectDomainFromInput`
5. 兜底也为空 → 降级为 `general.chat`

#### 域名检测映射

| 用户输入关键词 | 映射域名 |
|--------------|---------|
| 东方财富 / eastmoney | eastmoney.com |
| 雪球 / xueqiu | xueqiu.com |
| 同花顺 / 10jqka | 10jqka.com.cn |
| 财联社 / cls | cls.cn |
| 新浪 / sina | sina.com.cn |
| 百度 / baidu | baidu.com |
| 未指定 | baidu.com（默认，SSR 渲染最可靠） |

#### 搜索 URL 模板

| 域名 | URL 模板 |
|------|---------|
| baidu.com | `https://www.baidu.com/s?wd={query}` |
| xueqiu.com | `https://xueqiu.com/k?q={query}` |
| eastmoney.com | `https://so.eastmoney.com/news/s?keyword={query}` |
| cls.cn | `https://www.cls.cn/search?keyword={query}` |
| sina.com.cn | `https://search.sina.com.cn/?q={query}` |
| 10jqka.com.cn | `https://www.10jqka.com.cn/search?q={query}` |
| cninfo.com.cn | `https://www.cninfo.com.cn/search?keyword={query}` |
| cs.com.cn | `https://www.cs.com.cn/search?q={query}` |
| hexun.com | `https://so.hexun.com/?q={query}` |

#### 安全策略

- **域名白名单**：仅允许 `BROWSER_DOMAIN_WHITELIST` 中的域名
- **内容安全**：使用独立隐藏窗口（session 隔离），不执行网页 JS
- **超时控制**：单页面加载 15s 超时
- **资源清理**：操作后强制 `close()`，空闲 60s 自动关闭

---

## 四、意图分类规则（v6.0.1 当前状态）

| 意图 | 触发模式 | 置信度 |
|------|---------|--------|
| `market.query` | 行情关键词 + 股票代码/名称 | 0.75–0.9 |
| `web.browse` | 搜/搜索/查/看看 + 网站/研报/新闻/资讯/东方财富等 | 0.75–0.85 |
| `strategy.backtest` | 回测/策略/历史回测 | 0.85 |
| `stock.profile` | 档案/基本面/公司简介 + 股票 | 0.8 |
| `session.manage` | 新建/删除/切换/重命名 + 对话/会话 | 0.9 |
| `shell.execute` | 运行/执行 + python/node/npm 等 | 0.85–0.9 |
| `preference.update` | 设置/更新/修改 + 偏好/关注/风险；或"我喜欢/我关注"开头 | 0.85–0.9 |
| `general.chat` | 问候/闲聊/投资咨询 | 0.7–0.95 |

> 注：`news.search` 已合并到 `web.browse`，不再是独立意图

---

## 五、验收标准

| TC | 验收项 | 状态 |
|----|--------|------|
| TC-01 | 连续点击 10 次新建 Session，只创建 1 个 | ✅ |
| TC-02 | 流式输出完成后 500ms 内界面正常 | ✅ |
| TC-03 | 连续发送 20 条消息，每条即时显示 | ✅ |
| TC-04 | 重启应用后消息完整保留 | ✅ |
| TC-05 | web.browse 搜索并提取内容成功 | ✅ |
| TC-06 | 非白名单域名被拒绝访问 | ✅ |
| TC-07 | 设置弹窗关闭后输入框可输入 | ✅ |
| TC-08 | 浏览器 toggle 状态持久化 | ✅ |
| TC-09 | "东方财富搜一下"正确使用东方财富域名 | ✅ |
| TC-10 | "我之前关注哪些公司"走记忆检索而非 preference.update | ✅ |

---

## 六、v6.1 迭代方向

- 白名单动态增删 + 持久化
- LLM fetch 超时控制（AbortController）
- `news.search` 工具注册清理
- `BrowserCDPService` 重命名为 `BrowserService`
- `validateConfig` 自动触发
- 多模态记忆（截图、PDF 关联）
- API Key 加密存储
