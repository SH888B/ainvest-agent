# 09. 关键交互时序图与架构决策汇总

> **目标**：读完本文档，你能理解每个关键场景下，数据是怎么在进程、Store、组件之间流转的。同时看到所有架构决策的汇总。

---

## 一、应用启动流程

```
时间 →

主进程 (Main)              渲染进程 (Renderer)
  │                              │
  │  1. app.whenReady()          │
  │     创建 BrowserWindow       │
  │     加载 Preload 脚本        │
  │─────────────────────────────→│
  │                              │
  │                              │  2. 渲染进程加载
  │                              │     ReactDOM.createRoot()
  │                              │
  │                              │  3. App.tsx 挂载
  │                              │     ├─ useSessionStore 初始化
  │                              │     │   └─ localStorage 恢复 sessions
  │                              │     ├─ usePreferenceStore 初始化
  │                              │     │   └─ localStorage 恢复偏好
  │                              │     ├─ useMarketStore 初始化
  │                              │     │   └─ localStorage 恢复 watchlist
  │                              │     │
  │     4. IPC 请求同步数据      │
  │  ←───────────────────────────│
  │     ipc: listSessions        │
  │                              │
  │  5. 读取 meta.json           │
  │     返回 SessionMeta[]       │
  │─────────────────────────────→│
  │                              │
  │                              │  6. 对比 Store vs 磁盘数据
  │                              │     如有差异，以磁盘为准
  │                              │     loadSessions(diskData)
  │                              │
  │                              │  7. 三栏布局渲染
  │                              │     ├─ MarketPanel (行情总览)
  │                              │     ├─ ChatPanel (空消息列表)
  │                              │     └─ SessionSidebar (列表)
  │                              │
  │                              │  8. MarketOverview 加载 Mock 数据
  │                              │     ├─ queryIndices() → 指数
  │                              │     ├─ queryWatchlist() → 自选股
  │                              │     └─ newsSearch() → 热点新闻
  │                              │
  │                              │  【启动完成，用户可交互】
```

**关键点**：
- localStorage 恢复优先级高，因为不需要 IPC，启动快
- IPC 同步是"校验"步骤，确保内存和磁盘一致
- 如果用户第一次打开，Store 和 meta.json 都是空的，展示空状态

---

## 二、用户发送消息完整流程

```
时间 →

用户                ChatInputArea        ChatPanel          ChatStore        AgentEngine        MockService        ChatStore
  │                      │                   │                  │                 │                 │                 │
  │  1. 输入文字        │                   │                  │                 │                 │                 │
  │     点击发送        │                   │                  │                 │                 │                 │
  │────────────────────→│                   │                  │                 │                 │                 │
  │                      │                   │                  │                 │                 │                 │
  │                      │  2. onSend(text)  │                  │                 │                 │                 │
  │                      │──────────────────→│                  │                 │                 │                 │
  │                      │                   │                  │                 │                 │                 │
  │                      │                   │ 3. processUserInput(text)
  │                      │                   │──────────────────→│                 │                 │                 │
  │                      │                   │                  │                 │                 │                 │
  │                      │                   │                  │ 4. addUserMessage(text)
  │                      │                   │                  │──────────────────────────────────────────────────────→│
  │                      │                   │                  │                 │                 │                 │
  │                      │                   │                  │                 │                 │                 │ 5. 用户消息渲染
  │                      │                   │                  │                 │                 │                 │    ChatMessageList
  │                      │                   │                  │                 │                 │                 │    自动滚动到底部
  │                      │                   │                  │                 │                 │                 │
  │                      │                   │                  │ 6. addAgentMessage()
  │                      │                   │                  │    status: 'thinking'
  │                      │                   │                  │──────────────────────────────────────────────────────→│
  │                      │                   │                  │                 │                 │                 │
  │                      │                   │                  │                 │                 │                 │ 7. Agent 气泡出现
  │                      │                   │                  │                 │                 │                 │    显示"思考中..."
  │                      │                   │                  │                 │                 │                 │
  │                      │                   │                  │ 8. intentRecognizer.recognize(text)
  │                      │                   │                  │    → { toolId: 'market.query', params: { symbol } }
  │                      │                   │                  │                 │                 │                 │
  │                      │                   │                  │ 9. setMessageThinking(msgId, '识别到意图...')
  │                      │                   │                  │──────────────────────────────────────────────────────→│
  │                      │                   │                  │                 │                 │                 │
  │                      │                   │                  │                 │                 │                 │ 10. 思考过程展示
  │                      │                   │                  │                 │                 │                 │     （可折叠区域）
  │                      │                   │                  │                 │                 │                 │
  │                      │                   │                  │ 11. 需要工具调用
  │                      │                   │                  │     updateMessage(status: 'tool_calling')
  │                      │                   │                  │──────────────────────────────────────────────────────→│
  │                      │                   │                  │                 │                 │                 │
  │                      │                   │                  │                 │                 │                 │
  │                      │                   │                  │ 12. addToolCall(msgId, { toolId, params, status: 'pending' })
  │                      │                   │                  │──────────────────────────────────────────────────────→│
  │                      │                   │                  │                 │                 │                 │
  │                      │                   │                  │                 │                 │                 │ 13. 展示工具调用卡片
  │                      │                   │                  │                 │                 │                 │     "正在调用 [行情查询]..."
  │                      │                   │                  │                 │                 │                 │
  │                      │                   │                  │ 14. getTool('market.query')
  │                      │                   │                  │     → marketQuery({ symbol })
  │                      │                   │                  │──────────────────────────────────────────────────────────→
  │                      │                   │                  │                 │                 │
  │                      │                   │                  │                 │                 │ 15. Mock 数据生成
  │                      │                   │                  │                 │                 │     模拟 100-300ms 延迟
  │                      │                   │                  │                 │                 │     返回 MarketData
  │                      │                   │                  │                 │                 │
  │                      │                   │                  │ 16. updateToolCallResult(msgId, toolId, result)
  │                      │                   │                  │←──────────────────────────────────────────────────────────
  │                      │                   │                  │                 │                 │
  │                      │                   │                  │                 │                 │
  │                      │                   │                  │ 17. updateMessage(msgId, {
  │                      │                   │                  │       content: summaryText,
  │                      │                   │                  │       status: 'completed'
  │                      │                   │                  │     })
  │                      │                   │                  │──────────────────────────────────────────────────────→│
  │                      │                   │                  │                 │                 │                 │
  │                      │                   │                  │                 │                 │                 │ 18. Agent 回复更新
  │                      │                   │                  │                 │                 │                 │     展示总结文本 + 结果卡片
  │                      │                   │                  │                 │                 │                 │
  │                      │                   │                  │ 19. touchSession(sessionId)
  │                      │                   │                  │     setIsTyping(false)
  │                      │                   │                  │──────────────────────────────────────────────────────→│
  │                      │                   │                  │                 │                 │                 │
  │                      │                   │                  │                 │                 │                 │ 20. 消息变化触发 useEffect
  │                      │                   │                  │                 │                 │                 │     setTimeout 1s 后
  │                      │                   │                  │                 │                 │                 │     ipcFileService.saveSessionMessages()
  │                      │                   │                  │                 │                 │                 │
  │                      │                   │                  │                 │                 │                 │ 21. IPC 调用主进程
  │                      │                   │                  │                 │                 │                 │     session:save
  │                      │                   │                  │                 │                 │                 │
  │                      │                   │                  │                 │                 │                 │
  │  22. 写入磁盘        │                   │                  │                 │                 │                 │
  │     sessions/{id}.json                │                  │                 │                 │                 │
  │     meta.json (更新 updatedAt)         │                  │                 │                 │                 │
  │←──────────────────────────────────────────────────────────────────────────────────────────────────────────────────│
```

**总耗时估算**：
- 意图识别：~1ms（本地正则）
- Mock 工具调用：~200ms（模拟延迟）
- 消息渲染：~16ms（一帧）
- **端到端：~300ms 内完成**（符合 PRD < 3 秒要求）

---

## 三、个股联动交互流程

```
时间 →

用户                AgentMessageBubble        useMessageParser        StockLink        useMarketStore        MarketPanel        StockDetail
  │                        │                        │                   │                  │                  │               │
  │  1. 查看 Agent 回复     │                        │                   │                  │                  │               │
  │     看到【贵州茅台】    │                        │                   │                  │                  │               │
  │                        │                        │                   │                  │                  │               │
  │                        │  2. AgentMessageBubble  │                   │                  │                  │               │
  │                        │     渲染时调用 useMessageParser(content)
  │                        │────────────────────────→│                   │                  │                  │               │
  │                        │                        │                   │                  │                  │               │
  │                        │                        │ 3. 正则匹配【(.+?)】│                  │                  │               │
  │                        │                        │    返回解析后的 parts
  │                        │                        │    [text, stock, text]
  │                        │←───────────────────────│                   │                  │                  │               │
  │                        │                        │                   │                  │                  │               │
  │                        │  4. 渲染消息内容        │                   │                  │                  │               │
  │                        │     parts.map()        │                   │                  │                  │               │
  │                        │     type='stock' → StockLink               │                  │                  │               │
  │                        │                        │                   │                  │                  │               │
  │  5. 点击【贵州茅台】    │                        │                   │                  │                  │               │
  │────────────────────────→│                        │                   │                  │                  │               │
  │                        │                        │                   │                  │                  │               │
  │                        │                        │                   │ 6. onClick        │                  │               │
  │                        │                        │                   │    switchToStockDetail('600519.SH')
  │                        │                        │                   │──────────────────→│                  │               │
  │                        │                        │                   │                  │                  │               │
  │                        │                        │                   │                  │ 7. Store 更新      │               │
  │                        │                        │                   │                  │    currentView = 'stockDetail'
  │                        │                        │                   │                  │    activeSymbol = '600519.SH'
  │                        │                        │                   │                  │                  │               │
  │                        │                        │                   │                  │                  │               │
  │                        │                        │                   │                  │ 8. MarketPanel 重新渲染
  │                        │                        │                   │                  │    检测到 currentView 变化
  │                        │                        │                   │                  │    渲染 StockDetail
  │                        │                        │                   │                  │──────────────────→│               │
  │                        │                        │                   │                  │                  │               │
  │                        │                        │                   │                  │                  │ 9. StockDetail 加载数据
  │                        │                        │                   │                  │                  │    marketQuery(symbol)
  │                        │                        │                   │                  │                  │    stockProfileQuery(symbol)
  │                        │                        │                   │                  │                  │    getStockNews(symbol)
  │                        │                        │                   │                  │                  │               │
  │                        │                        │                   │                  │                  │ 10. 展示个股详情
  │                        │                        │                   │                  │                  │     价格、财务指标、新闻
  │                        │                        │                   │                  │                  │←──────────────│
  │                        │                        │                   │                  │                  │
  │                        │                        │                   │                  │ 11. 聊天面板继续可用
  │                        │                        │                   │                  │     用户可继续对话
  │                        │                        │                   │                  │     （互不阻塞）
```

**关键点**：
- 个股联动**不经过任何 IPC**，纯渲染进程内状态管理
- 解析正则表达式 `【(.+?)】` 在渲染时执行，不影响性能
- StockLink 用 `<button>` 而非 `<a>`，因为不是跳转外部链接

---

## 四、Session 切换流程

```
时间 →

用户                SessionItem        SessionSidebar        sessionManager        ChatStore        MarketStore        IPC
  │                      │                   │                      │               │                  │          │
  │  1. 点击 Session B   │                   │                      │               │                  │          │
  │─────────────────────→│                   │                      │               │                  │          │
  │                      │                   │                      │               │                  │          │
  │                      │  2. onClick()     │                      │               │                  │          │
  │                      │    调用 switchSession(sessionBId)
  │                      │──────────────────→│                      │               │                  │          │
  │                      │                   │                      │               │                  │          │
  │                      │                   │  3. switchSession()  │               │                  │          │
  │                      │                   │──────────────────────→│               │                  │          │
  │                      │                   │                      │               │                  │          │
  │                      │                   │                      │ 4. 保存当前消息  │                  │          │
  │                      │                   │                      │    saveSessionMessages(currentId, messages)
  │                      │                   │                      │────────────────────────────────────────────────→
  │                      │                   │                      │               │                  │          │
  │                      │                   │                      │               │                  │          │ 5. 写入磁盘
  │                      │                   │                      │               │                  │          │    sessions/{currentId}.json
  │                      │                   │                      │               │                  │          │
  │                      │                   │                      │ 6. setCurrentSession(B)
  │                      │                   │                      │────────────────→│               │          │
  │                      │                   │                      │               │                  │          │
  │                      │                   │                      │               │                  │          │
  │                      │                   │                      │ 7. loadMessages(B)
  │                      │                   │                      │    IPC 读取 B 的消息
  │                      │                   │                      │────────────────────────────────────────────────→
  │                      │                   │                      │               │                  │          │
  │                      │                   │                      │               │                  │          │ 8. 读取磁盘
  │                      │                   │                      │               │                  │          │    sessions/{B}.json
  │                      │                   │                      │               │                  │          │
  │                      │                   │                      │ 9. ChatStore.loadMessages(data)
  │                      │                   │                      │←────────────────────────────────────────────────
  │                      │                   │                      │               │                  │          │
  │                      │                   │                      │               │                  │          │
  │                      │                   │                      │               │ 10. switchToOverview()
  │                      │                   │                      │               │──────────────────→│          │
  │                      │                   │                      │               │                  │          │
  │                      │                   │                      │               │                  │ 11. MarketPanel
  │                      │                   │                      │               │                  │     切回总览
  │                      │                   │                      │               │                  │          │
  │                      │                   │                      │               │                  │          │
  │  12. 界面更新         │                   │                      │               │                  │          │
  │     Session B 高亮    │                   │                      │               │                  │          │
  │     聊天内容切换      │                   │                      │               │                  │          │
  │     行情看板回总览    │                   │                      │               │                  │          │
```

---

## 五、行情看板视图切换流程

```
时间 →

用户                WatchlistRow / StockLink        useMarketStore        MarketPanel        MarketOverview / StockDetail
  │                              │                        │                  │                        │
  │  1. 点击自选股               │                        │                  │                        │
  │     或点击聊天中的个股链接    │                        │                  │                        │
  │─────────────────────────────→│                        │                  │                        │
  │                              │                        │                  │                        │
  │                              │  2. switchToStockDetail(symbol)
  │                              │────────────────────────→│                  │                        │
  │                              │                        │                  │                        │
  │                              │                        │ 3. Store 更新     │                  │                        │
  │                              │                        │    currentView = 'stockDetail'
  │                              │                        │    activeSymbol = symbol
  │                              │                        │                  │                        │
  │                              │                        │                  │ 4. MarketPanel 重新渲染
  │                              │                        │                  │    currentView === 'stockDetail'
  │                              │                        │                  │    渲染 <StockDetail symbol={activeSymbol} />
  │                              │                        │                  │                        │
  │                              │                        │                  │                        │ 5. StockDetail useEffect
  │                              │                        │                  │                        │    加载个股数据
  │                              │                        │                  │                        │    展示详情
  │                              │                        │                  │                        │
  │  6. 查看个股详情             │                        │                  │                        │
  │                              │                        │                  │                        │
  │  7. 点击"返回"按钮           │                        │                  │                        │
  │─────────────────────────────→│                        │                  │                        │
  │                              │  8. switchToOverview()  │                  │                        │
  │                              │────────────────────────→│                  │                        │
  │                              │                        │                  │                        │
  │                              │                        │ 9. Store 更新     │                  │                        │
  │                              │                        │    currentView = 'overview'
  │                              │                        │    activeSymbol = null
  │                              │                        │                  │                        │
  │                              │                        │                  │ 10. MarketPanel 重新渲染
  │                              │                        │                  │     渲染 <MarketOverview />
```

---

## 六、架构决策汇总

### 6.1 已确认决策

| # | 决策项 | 选择 | 理由 | 影响范围 |
|---|--------|------|------|---------|
| 1 | Mock 工具层位置 | **渲染进程直接调用** | v1 快速迭代，无 IPC 开销；v2 只替换 service 层 | Mock 服务、Agent 引擎 |
| 2 | 行情看板 ↔ 聊天联动 | **Zustand 全局状态** | 与现有状态管理一致，可追踪、可持久化 | MarketStore、StockLink |
| 3 | 持久化文件组织 | **每 Session 独立 JSON 文件** | 避免单文件膨胀，便于手动备份 | fileService、IPC 处理器 |
| 4 | 技术文档结构 | **按模块拆分** | 维护更新方便，新人可按需阅读 | 文档组织 |
| 5 | 个股链接渲染 | **前端正则解析** | v1 简单可靠，Agent 返回纯文本即可 | AgentMessageBubble |
| 6 | 意图识别方案 | **硬编码正则规则** | v1 无需 AI，3 种意图足够覆盖 MVP | intentRecognizer |
| 7 | Session 切换策略 | **切换时保存旧 + 加载新 + 重置行情** | 保证数据不丢失，状态清晰 | sessionManager |
| 8 | 消息自动保存 | **防抖 1 秒** | 平衡实时性和性能 | ChatPanel useEffect |

### 6.2 v2 预留扩展点

| 扩展点 | 当前实现 | v2 方向 | 迁移成本 |
|--------|---------|---------|---------|
| Mock 服务 | 渲染进程内直接调用 | 主进程 IPC + 真实 API | 低（只改 service 层） |
| 意图识别 | 硬编码正则 | LLM API (OpenAI/Claude) | 中（改 intentRecognizer） |
| 持久化 | JSON 文件 | SQLite | 中（改 fileService） |
| 行情数据源 | Mock 数据 | Wind / Tushare API | 低（只改 marketMock） |
| 个股联动 | Zustand 状态 | 支持拖拽到聊天窗口 | 中（新增拖拽事件） |

### 6.3 风险与应对

| 风险 | 影响 | 应对策略 |
|------|------|---------|
| localStorage 空间不足 | 偏好设置、Session 元数据丢失 | 监控空间使用，超限提示用户清理 |
| JSON 文件损坏 | Session 聊天记录丢失 | 读写时加 try-catch，损坏时返回空数据 |
| Mock 数据不合理 | 演示效果差 | 预设数据贴近真实行情，加随机波动 |
| 新手不理解 Zustand | 代码质量差 | 本文档提供完整示例，Code Review 时检查 |

---

## 七、开发 Checklist

开始编码前，确认以下事项：

- [ ] 已阅读 `01-overview.md`，了解项目目录结构
- [ ] 已阅读 `02-electron-process.md`，了解 IPC 通信规范
- [ ] 已阅读 `03-state-management.md`，了解 Store 接口
- [ ] 已阅读 `04-mock-services.md`，了解工具注册和 Mock 数据
- [ ] 已阅读 `05-market-panel.md`，了解行情看板组件
- [ ] 已阅读 `06-chat-panel.md`，了解聊天面板和 Session 管理
- [ ] 已阅读 `08-persistence.md`，了解数据持久化策略
- [ ] 已阅读本文档，了解关键交互流程

---

> **结束**：至此，v1 完整技术架构文档已输出完毕。开始编码时，以本文档为参考，遇到不确定的地方回来查阅对应章节。
