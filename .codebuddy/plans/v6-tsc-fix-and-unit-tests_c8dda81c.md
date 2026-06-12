---
name: v6-tsc-fix-and-unit-tests
overview: 修复剩余 3 个 TSC 错误，并补充 v6 新增功能的单元测试
---

现在我已掌握制定计划所需的全部上下文信息。接下来我将对其进行总结：

**待处理任务：**

1. 修复 3 个 TSC 错误：

- `memory.ts:22` - `topK` 类型为 `unknown`，在条件重新赋值后需要类型断言
- `vectorStore.ts:195` - `Record<string, unknown>` 与 Vectra 的 `MetadataTypes` 不兼容
- `memoryExtractor.ts:223` - `extractFallbackFragment` 已声明但从未使用

2. 为 v6.0 新增/修改的模块编写单元测试：

- BrowserCDPService 白名单校验逻辑 (`isUrlAllowed`)
- ChatStore debounced storage 逻辑
- SessionStore 创建和状态管理
- Browser tool 安全检查逻辑

<plan_result>
<req>

## 产品概述

继续执行 v6.0 未完成的测试任务：修复 3 个 TSC 编译错误，并为 v6.0 新增/修改的核心模块编写单元测试。

## 核心功能

- 修复 3 个 TSC 编译错误，使 `tsc --noEmit` 零报错
- 编写 BrowserCDPService 白名单校验单元测试（isUrlAllowed 逻辑）
- 编写 ChatStore debounced storage 单元测试（防抖写入、flush、数据不丢失）
- 编写 SessionStore 状态管理单元测试（创建/切换/删除/命名）
- 编写 Browser Tool 安全检查单元测试（域名白名单、URL 格式校验）
</req>

<tech>

## 技术栈

- 测试框架：Node.js 直接运行 `.mjs` 测试文件（复用项目现有模式，不依赖 vitest）
- 断言：自定义 `assert` 函数（与现有 `test/*.test.mjs` 风格一致）
- TypeScript：项目使用 `tsc --noEmit` 做类型检查

## 实现方案

### TSC 错误修复

1. **`src/main/ipcHandlers/memory.ts:22`** — `topK` 参数类型为 `unknown`，条件赋值后 TSC 仍视为 `unknown`。修复：将 `topK` 默认值逻辑改为 `const topKNum = typeof topK === 'number' ? topK : 5`，传 `topKNum` 给 `queryItems`。

2. **`src/main/services/vectorStore.ts:195`** — `metadata: Record<string, unknown>` 不能赋给 Vectra 的 `MetadataTypes`。修复：将 `upsertItem` 的 `metadata` 参数类型改为 `Record<string, string | number | boolean>` 并在调用处 `as any` 断言，或在 `upsertItem` 内部 `as any`。最简修复：`await idx.upsertItem({ id, vector, metadata: metadata as any })`。

3. **`src/renderer/services/agent/memoryExtractor.ts:223`** — `extractFallbackFragment` 声明但未使用。该函数仅作为兼容接口调用 `extractFallbackFragments`。修复：添加 `// @ts-expect-error -- retained for backward compat` 或直接删除该函数（它没被任何代码引用），但更安全的做法是添加 `@ts-expect-error` 注释。

### 单元测试设计

所有测试沿用项目现有 `.mjs` + 自定义 assert 模式，直接 `node test/xxx.test.mjs` 运行。

#### 1. `test/browser-whitelist.test.mjs` — 浏览器白名单校验测试

- 复制 `BrowserCDPService.isUrlAllowed` 的核心逻辑（hostname 匹配 + 白名单）
- 测试用例：
- 精确域名匹配（`https://xueqiu.com/S/SH600519` → allowed）
- 子域名匹配（`https://stock.xueqiu.com/xxx` → allowed）
- 非白名单域名拒绝（`https://evil.com` → denied）
- 无效 URL 拒绝（`not-a-url` → denied）
- 空字符串拒绝
- 相似但不同域名拒绝（`xueqiu.com.evil.com` → denied，因为 hostname 不是 `xueqiu.com` 也不以其结尾）
- IP 地址 URL 拒绝
- 自定义白名单参数测试

#### 2. `test/chatstore-debounce.test.mjs` — ChatStore 防抖存储测试

- 复制 `createDebouncedStorage` 核心逻辑，用模拟的 localStorage
- 测试用例：
- 初始 getItem 返回 null
- setItem 后 debounce 期间 getItem 返回旧值
- debounce 到期后 localStorage 写入
- 连续 setItem 只写入最后一次值（防抖合并）
- flushStorage 事件立即写入
- removeItem 直接删除
- debounce 值自定义（非默认 100ms）

#### 3. `test/session-store.test.mjs` — SessionStore 状态管理测试

- 复制 `useSessionStore` 的核心状态逻辑（不依赖 zustand）
- 测试用例：
- 创建 Session 后列表长度 +1，currentSessionId 更新
- 连续创建多个 Session，最新在列表首位
- 切换 Session 更新 currentSessionId
- 删除当前 Session 自动切到第一个
- 删除非当前 Session 不影响 currentSessionId
- 删除最后一个 Session 后 currentSessionId 为 null
- renameSession 更新标题和 isCustomNamed
- autoRenameSession 仅在未自定义且标题为"新对话"时生效
- generateSessionName 截断到 10 字符加 "..."
- generateSessionName 空字符串返回"新对话"

#### 4. `test/browser-tool.test.mjs` — Browser Tool 安全检查测试

- 复制 `executeBrowserTool` 中的白名单检查逻辑
- 测试用例：
- 白名单域名返回正常消息
- 非白名单域名返回错误提示
- 无效 URL 格式返回错误
- 空字符串 URL 返回错误
- 验证错误消息包含域名信息

## 实现注意事项

- TSC 修复需最小化改动，不重构逻辑
- 测试文件复制源码核心逻辑而非 import，因为 .mjs 无法直接 import .ts 文件
- `isUrlAllowed` 的 `hostname.endsWith('.' + domain)` 逻辑需严格测试，防止 `xueqiu.com.evil.com` 绕过
- `createDebouncedStorage` 的 flush 行为是 v6 修复消息丢失的关键，需重点覆盖

## 目录结构

```
test/
├── browser-whitelist.test.mjs    # [NEW] 浏览器白名单校验单元测试
├── chatstore-debounce.test.mjs   # [NEW] ChatStore 防抖存储单元测试
├── session-store.test.mjs        # [NEW] SessionStore 状态管理单元测试
├── browser-tool.test.mjs         # [NEW] Browser Tool 安全检查单元测试
├── run-tsc.mjs                   # [MODIFY] 已创建的 TSC 运行脚本

src/
├── main/
│   ├── ipcHandlers/
│   │   └── memory.ts             # [MODIFY] 修复 topK unknown → number 类型错误
│   └── services/
│       └── vectorStore.ts        # [MODIFY] 修复 metadata 类型不兼容
└── renderer/
    └── services/
        └── agent/
            └── memoryExtractor.ts # [MODIFY] 修复 extractFallbackFragment 未使用警告
```

</tech>

<todolist>
<item id="fix-tsc-errors" deps="">修复 3 个 TSC 编译错误（memory.ts topK 类型、vectorStore.ts metadata 类型、memoryExtractor.ts 未使用函数）</item>
<item id="test-browser-whitelist" deps="fix-tsc-errors">编写并运行 browser-whitelist.test.mjs 浏览器白名单校验测试</item>
<item id="test-chatstore-debounce" deps="fix-tsc-errors">编写并运行 chatstore-debounce.test.mjs 防抖存储测试</item>
<item id="test-session-store" deps="fix-tsc-errors">编写并运行 session-store.test.mjs Session 状态管理测试</item>
<item id="test-browser-tool" deps="fix-tsc-errors">编写并运行 browser-tool.test.mjs 浏览器工具安全检查测试</item>
<item id="tsc-final-verify" deps="test-browser-whitelist,test-chatstore-debounce,test-session-store,test-browser-tool">运行 tsc --noEmit 最终验证零错误，汇总全部测试结果</item>
</todolist>
</plan_result>