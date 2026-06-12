# AInvest Agent v6 PRD

> 版本：v6.0.0
> 日期：2026-06-11
> 状态：需求评审中
> 目标：修复核心体验问题 + 让 Agent "能上网"

---

## 一、产品概述

v6 聚焦两个主题：
1. **修复 v5.1.1 遗留的 3 个核心体验 Bug**（P0）：Session 创建卡顿、流式输出界面冻结、多轮对话消息丢失
2. **浏览器自动化能力**（P1）：让 Agent 能打开网页、提取内容、截图分析，实现"联网查资料"

v6 不改 UI 布局，Bug 修复对用户无感知，浏览器能力通过聊天面板自然语言驱动。

---

## 二、版本目标

**"Agent 不再卡顿，还能上网查资料"**

---

## 三、用户故事

### P0 — Bug 修复

#### US-601：新建 Session 应该立即响应
> 作为用户，当我点击"新建 Session"按钮时，应该在 200ms 内看到新 Session 出现在列表中并自动切换，而不是点击多次后才批量创建。

#### US-602：流式输出完成后应该正常显示
> 作为用户，当 Agent 的流式回复完成后，我应该能直接看到完整内容，不需要手动切换 Session 再切回来才能刷新界面。

#### US-603：连续多轮对话后新消息应该正常显示
> 作为用户，当我连续发送 5-10 条消息后，每一条都应该即时出现在消息列表中，而不是只有切换 Session 后才能看到之前发送的消息。

### P1 — 浏览器自动化

#### US-604：我想让 Agent 帮我查网页资料
> 作为用户，当我问"宁德时代最近有什么研报"时，Agent 应该能打开雪球或东方财富的网页，提取相关研报标题和摘要，然后基于这些信息回答我。

#### US-605：Agent 浏览网页前应该让我知道
> 作为用户，当 Agent 准备访问一个网页时，我应该在聊天界面看到它正在访问哪个网站，并可以选择取消。

#### US-606：我想看到 Agent 浏览的网页截图
> 作为用户，当 Agent 访问网页后，我希望能在聊天记录里看到网页截图，这样我不用自己再打开浏览器验证。

#### US-607：Agent 不应该访问任意网站
> 作为用户，我不希望 Agent 被诱导访问钓鱼网站或恶意网站。Agent 只能访问我信任的金融信息网站。

---

## 四、功能列表

### 4.1 Bug 修复（P0）

#### 4.1.1 Session 创建竞态修复

**问题描述**：`useSessionStore` 或 ChatPanel 中新建 Session 的 handler 存在 debounce/async 竞态，多次点击后延迟批量创建多个 Session。

**修复方案**：
1. **移除 debounce**：新建 Session 是低频操作（用户不会每秒点击），不需要 debounce
2. **添加 loading 状态**：点击后立即设置 `isCreatingSession = true`，禁用按钮，防止重复提交
3. **同步创建 + 异步持久化**：Session 对象在内存中同步创建并切换，持久化到文件系统走异步，不阻塞 UI
4. **乐观更新**：先更新 UI 再写文件，写文件失败时回滚并提示用户

**改动范围**：
- `src/renderer/stores/useSessionStore.ts`：创建逻辑
- `src/renderer/features/session/SessionSidebar.tsx`：按钮 loading 状态

**验收标准**：
- 连续快速点击 10 次"新建 Session"，只创建 1 个 Session
- 从点击到 Session 出现在列表中 < 200ms

#### 4.1.2 流式输出界面冻结修复

**问题描述**：流式输出完成后，React 未触发 re-render，界面卡住显示不完整内容，切换 Session 再切回才正常。

**修复方案**：
1. **修复 zustand subscribe 时序**：流式输出结束时，确保 `streamContent` 的最后一次更新被 React 感知
2. **强制 flush**：流式结束后调用 `flushSync` 或强制触发一次 re-render
3. **检查 ChatStore 的 setState 闭包**：确保流式回调中引用的 state 是最新的，不是 stale closure

**根因分析**：
- `useChatStore` 的 `debounced persist`（800ms）可能导致 React 组件未能及时感知 `messages` 状态变化
- 流式输出的 `onChunk` 回调可能闭包了旧的 `messages` 数组，导致新消息未被正确追加

**改动范围**：
- `src/renderer/stores/useChatStore.ts`：流式状态更新逻辑
- `src/renderer/services/llm/llmService.ts`：流式回调的闭包处理

**验收标准**：
- 流式输出完成后 500ms 内，界面自动显示完整内容
- 不需要切换 Session 就能正常显示
- 连续 10 次对话，每次流式结束后界面都正常渲染

#### 4.1.3 多轮对话消息丢失修复

**问题描述**：连续多轮对话后，新消息界面不显示，切换 Session 再切回才正常。

**修复方案**：
1. **缩短 debounce 间隔**：`useChatStore` 的 persist debounce 从 800ms 缩短到 100ms
2. **关键操作绕过 debounce**：发送消息、接收消息等关键操作立即触发 persist，不等待 debounce
3. **消息添加后强制更新**：`addMessage` 后确保 `messagesBySession` 的引用变化触发 React re-render
4. **检查 immer 使用**：确保使用 immer 时返回的是新对象，不是 mutated 原对象

**改动范围**：
- `src/renderer/stores/useChatStore.ts`：debounce 策略和 persist 逻辑
- `src/renderer/features/chat/ChatPanel.tsx`：消息列表的渲染优化

**验收标准**：
- 连续发送 20 条消息，每一条都即时出现在消息列表中
- 关闭应用重启后，消息完整保留

---

### 4.2 浏览器自动化（P1）

#### 4.2.1 网页内容提取

**功能描述**：Agent 识别 `browser.open` 意图，通过主进程 CDP 打开网页并提取结构化内容。

**意图识别**：
- 新增意图类型：`web.search` / `web.browse`
- 本地正则兜底：匹配"查一下...网站"、"打开...看看"、"搜索..."等模式
- LLM 分类：判断是否需要打开网页获取实时信息

**工具定义**：
```typescript
interface BrowseToolParams {
  url: string;           // 目标 URL
  action: 'snapshot' | 'screenshot';  // 提取方式
  waitFor?: string;      // 可选：等待元素出现（CSS selector）
}
```

**内容提取策略**：
1. **文本提取**：使用 `document.body.innerText`，过滤导航栏、广告、页脚等噪声
2. **结构化提取**：对已知金融网站（雪球、东方财富），预定义提取规则（标题、摘要、日期、作者）
3. **内容截断**：提取内容限制 8000 字符，超出截断并提示"内容已截断"

**IPC 通道**：
```
renderer                  main
  │                        │
  ├── browser:open ───────→│ 创建 BrowserWindow（隐藏，400x600）
  │   { url }              │ 附加 debugger
  │                        │ 等待 load 事件
  │                        │ 执行 JS 提取内容
  │←── browser:result ─────┤ 返回 { title, text, url }
  │                        │
  ├── browser:screenshot ─→│ 截图
  │←── browser:result ─────┤ 返回 { imageBase64 }
  │                        │
  ├── browser:close ──────→│ 关闭窗口
```

**改动范围**：
- `src/main/services/browserCDP.ts`：CDP 封装（新建）
- `src/main/ipcHandlers/browser.ts`：IPC handler（新建）
- `src/preload/index.ts`：暴露 `browserAPI`
- `src/renderer/services/tools/browser.ts`：工具定义（新建）
- `src/renderer/services/agent/intentClassifier.ts`：新增 web 意图
- `src/renderer/services/agent/prompts.ts`：浏览器能力说明

#### 4.2.2 安全策略

**域名白名单**：
- 默认允许：
  - `xueqiu.com`（雪球）
  - `eastmoney.com`（东方财富）
  - `cls.cn`（财联社）
  - `10jqka.com.cn`（同花顺）
  - `sina.com.cn`（新浪财经）
  - `cninfo.com.cn`（巨潮资讯）
- 不在白名单的域名：拒绝访问，Agent 回复"该网站不在允许访问列表中"

**用户确认**：
- 首次访问白名单中的域名：不需要确认（已信任）
- 访问非白名单域名：拒绝（不需要确认，直接拒绝）
- 用户可在设置页管理白名单（添加/删除域名）

**内容安全**：
- 提取内容时过滤 `<script>` 标签
- 禁止执行网页中的 JavaScript（只提取静态内容）
- 截图不包含用户 cookies 或登录态（使用独立窗口，session 隔离）

#### 4.2.3 UI 展示

**浏览工具卡片**：
- 位置：聊天消息列表中，作为 Agent 的"思考步骤"展示
- 内容：显示"正在访问 [网站名]..." → "已提取 N 条信息"
- 展开后：显示提取的文本内容摘要（前 200 字符）

**截图展示**：
- 位置：Agent 回复消息下方，可点击放大
- 尺寸：缩略图 300x200，点击后弹窗展示原图
- 标注：截图上叠加红色高亮框（可选，标出 Agent 关注的内容区域）

**设置页**：
- 新增"浏览器自动化"设置区块
- 白名单域名管理（列表 + 添加/删除）
- 开关：启用/禁用浏览器自动化能力

---

## 五、技术设计

### 5.1 Bug 修复技术方案

#### 5.1.1 ChatStore 重构

```typescript
// useChatStore.ts 关键变更
interface ChatState {
  messagesBySession: Record<string, ChatMessage[]>;
  // 移除 debounced persist，改用按需持久化
  persistSession: (sessionId: string) => Promise<void>;
}

// 发送消息时：立即更新内存 + 立即持久化，不走 debounce
addMessage: (sessionId, message) => {
  set((state) => {
    const messages = [...(state.messagesBySession[sessionId] || []), message];
    return { messagesBySession: { ...state.messagesBySession, [sessionId]: messages } };
  });
  // 立即持久化，不等待 debounce
  get().persistSession(sessionId);
},

// 流式输出时：每收到 chunk 更新内存，流式结束后一次性持久化
appendStreamChunk: (sessionId, chunk) => {
  set((state) => {
    const messages = state.messagesBySession[sessionId] || [];
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'assistant') {
      lastMessage.content += chunk;
      return { messagesBySession: { ...state.messagesBySession, [sessionId]: [...messages] } };
    }
    return {};
  });
},
```

#### 5.1.2 SessionStore 创建优化

```typescript
// useSessionStore.ts 关键变更
interface SessionState {
  isCreating: boolean;
  createSession: () => Promise<void>;
}

createSession: async () => {
  const { isCreating } = get();
  if (isCreating) return; // 防止重复创建

  set({ isCreating: true });
  
  const newSession = { id: crypto.randomUUID(), name: '新会话', createdAt: Date.now() };
  
  // 乐观更新：立即更新 UI
  set((state) => ({
    sessions: [newSession, ...state.sessions],
    currentSessionId: newSession.id,
    isCreating: false,
  }));
  
  // 异步持久化
  await persistSessionMeta(state.sessions);
},
```

### 5.2 浏览器自动化技术方案

#### 5.2.1 架构

```
┌─────────────────────────────────────────────────────────────┐
│                        主进程 (Main)                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           BrowserCDP Service (新建)                     │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌───────────────┐  │  │
│  │  │ 隐藏窗口管理 │  │ CDP Session │  │ 内容提取引擎   │  │  │
│  │  │ BrowserWin  │  │ debugger    │  │ (文本/截图)   │  │  │
│  │  └─────────────┘  └─────────────┘  └───────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                   │
│  ┌───────────────────────┼───────────────────────────────┐  │
│  │         IPC Handlers  │  browser:open                 │  │
│  │                       │  browser:snapshot             │  │
│  │                       │  browser:screenshot           │  │
│  │                       │  browser:close                │  │
│  └───────────────────────┴───────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────┘
                            │ IPC
┌───────────────────────────┼─────────────────────────────────┐
│                      渲染进程 (Renderer)                       │
│  ┌────────────────────────┼─────────────────────────────┐   │
│  │      Agent Engine      │                             │   │
│  │  意图识别 → browser.open│                             │   │
│  │  调用工具 → 展示结果    │                             │   │
│  └────────────────────────┴─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

#### 5.2.2 CDP 实现

```typescript
// src/main/services/browserCDP.ts
import { BrowserWindow } from 'electron';

class BrowserCDPService {
  private window: BrowserWindow | null = null;
  private debugger: any = null;

  async open(url: string): Promise<{ title: string; text: string }> {
    // 1. 创建隐藏窗口
    this.window = new BrowserWindow({
      width: 400,
      height: 600,
      show: false, // 隐藏窗口
      webPreferences: { offscreen: true }, // 离屏渲染
    });

    // 2. 附加 CDP
    this.debugger = this.window.webContents.debugger;
    await this.debugger.attach('1.1');

    // 3. 导航并等待加载
    await this.window.loadURL(url);
    await this.waitForLoad();

    // 4. 提取内容
    const result = await this.extractContent();
    return result;
  }

  async screenshot(): Promise<string> {
    const image = await this.window.webContents.capturePage();
    return image.toDataURL();
  }

  async close(): Promise<void> {
    if (this.debugger) {
      this.debugger.detach();
    }
    if (this.window) {
      this.window.close();
      this.window = null;
    }
  }
}
```

#### 5.2.3 内容提取

```typescript
// 文本提取：执行 JS 获取纯文本
async function extractText(debugger: any): Promise<string> {
  const { result } = await debugger.sendCommand('Runtime.evaluate', {
    expression: `
      (() => {
        // 移除脚本和样式
        const scripts = document.querySelectorAll('script, style, nav, footer, aside');
        scripts.forEach(el => el.remove());
        return document.body.innerText;
      })()
    `,
  });
  return result.value;
}
```

---

## 六、UI/UX 设计

### 6.1 Bug 修复 — 无 UI 变更

纯逻辑修复，用户无感知。唯一可见的是新建 Session 按钮现在有 loading 状态（防重复点击）。

### 6.2 浏览器工具卡片

```
┌────────────────────────────────────────┐
│  🔍 正在访问 雪球网                     │
│  https://xueqiu.com/S/SH600519        │
│                                        │
│  ✓ 已提取 3 条信息                      │
│  ┌────────────────────────────────┐   │
│  │ 宁德时代：2026年Q1营收同比增长... │   │
│  │ 机构：中金公司 | 日期：2026-04-15 │   │
│  │ ...                            │   │
│  └────────────────────────────────┘   │
│                                        │
│  [查看截图] [重新提取]                  │
└────────────────────────────────────────┘
```

### 6.3 设置页 — 浏览器自动化

```
┌────────────────────────────────────────┐
│  ⚙️ 浏览器自动化                        │
├────────────────────────────────────────┤
│  [✓] 启用浏览器自动化能力               │
│                                        │
│  允许访问的网站：                        │
│  ┌────────────────────────────────┐   │
│  │ 雪球 (xueqiu.com)          [删除] │   │
│  │ 东方财富 (eastmoney.com)   [删除] │   │
│  │ 财联社 (cls.cn)            [删除] │   │
│  │ ...                          │   │
│  └────────────────────────────────┘   │
│  [+ 添加网站]                           │
│                                        │
│  截图质量：高清 [标准] 低清             │
└────────────────────────────────────────┘
```

---

## 七、验收标准

### 7.1 Bug 修复

| TC | 验收项 | 验证方式 |
|----|--------|---------|
| TC-01 | 连续点击 10 次新建 Session，只创建 1 个 | 手动测试 |
| TC-02 | 流式输出完成后 500ms 内界面正常 | 手动测试 |
| TC-03 | 连续发送 20 条消息，每条即时显示 | 手动测试 |
| TC-04 | 重启应用后消息完整保留 | 手动测试 |
| TC-05 | lint + tsc 零报错 | 自动化测试 |

### 7.2 浏览器自动化

| TC | 验收项 | 验证方式 |
|----|--------|---------|
| TC-06 | Agent 能正确识别"查网页"意图 | 评测集 |
| TC-07 | 打开雪球网并提取内容 < 5s | 手动测试 |
| TC-08 | 截图功能正常，图片可展示 | 手动测试 |
| TC-09 | 非白名单域名被拒绝访问 | 手动测试 |
| TC-10 | 浏览器窗口不干扰用户操作（隐藏/离屏） | 手动测试 |
| TC-11 | 关闭应用后浏览器进程不残留 | 手动测试 |

---

## 八、风险与应对

| 风险 | 影响 | 概率 | 应对策略 |
|------|------|------|---------|
| CDP API 不稳定 | 浏览器自动化失败 | 中 | 降级为"该功能暂不可用"提示；兜底用本地 Mock 数据 |
| 网页结构变化 | 提取规则失效 | 高 | 文本提取使用通用 `innerText` 策略，不依赖特定选择器；结构化提取作为增强功能 |
| 法律风险 | 抓取金融网站数据违反 ToS | 中 | 只提取公开可见内容；不模拟登录；不频繁请求；提供用户免责声明 |
| Bug 修复引入新问题 | 回归 | 低 | 修复前补充单元测试；修复后跑完整集成测试 |
| 隐藏窗口内存泄漏 | 应用卡顿 | 中 | 每次浏览后强制 `close()`；主进程监听 `window-all-closed` 清理 |

---

## 九、附录

### A.1 意图识别规则（新增）

```typescript
// web.browse 意图正则兜底
const webPatterns = [
  /查.{0,10}(网页|网站|研报|新闻|公告)/,
  /打开.{0,10}(网页|网站|链接)/,
  /搜索.{0,20}(雪球|东方财富|同花顺|财联社)/,
  /看看.{0,10}(最近|最新).{0,10}(研报|新闻|公告)/,
];
```

### A.2 白名单默认配置

```json
{
  "browserWhitelist": [
    "xueqiu.com",
    "eastmoney.com",
    "cls.cn",
    "10jqka.com.cn",
    "sina.com.cn",
    "cninfo.com.cn",
    "cs.com.cn",
    "hexun.com"
  ]
}
```

### A.3 改动文件清单

**Bug 修复**：
- `src/renderer/stores/useChatStore.ts`
- `src/renderer/stores/useSessionStore.ts`
- `src/renderer/features/session/SessionSidebar.tsx`
- `src/renderer/services/llm/llmService.ts`

**浏览器自动化**：
- `src/main/services/browserCDP.ts`（新建）
- `src/main/ipcHandlers/browser.ts`（新建）
- `src/preload/index.ts`
- `src/renderer/services/tools/browser.ts`（新建）
- `src/renderer/services/agent/intentClassifier.ts`
- `src/renderer/services/agent/prompts.ts`
- `src/renderer/features/settings/SettingsPage.tsx`
- `src/renderer/features/chat/ChatPanel.tsx`（工具卡片展示）

### A.4 v6.0 后的迭代方向（C 组功能）

- 记忆过期清理精细化策略
- 多模态记忆（截图、PDF、文件关联）
- API Key 加密存储
- Session 列表拖拽排序、搜索过滤
