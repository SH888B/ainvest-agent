# AInvest Agent v6.0 开发计划

> 版本：v6.0.0
> 日期：2026-06-11
> 状态：已完成
> 对应 PRD：`docs/prd/v6-prd.md`
> 对应技术方案：`docs/tech/v6-technical-design.md`

---

## 一、总体排期

| Phase | 内容 | 天数 | 起止 |
|-------|------|------|------|
| Phase 1 | Bug 修复 | 2 天 | Day 1-2 |
| Phase 2 | 浏览器自动化 | 3 天 | Day 3-5 |
| Phase 3 | 测试与发布 | 1 天 | Day 6 |
| **合计** | | **6 天** | |

---

## 二、Phase 1：Bug 修复（Day 1-2）

### 2.1 任务清单

| 序号 | 任务 | 文件 | 负责人 | 估时 | 依赖 |
|------|------|------|--------|------|------|
| 1.1 | MessageList 订阅修复：改为 zustand 直接选择器 | `MessageList.tsx` | Dev | 2h | — |
| 1.2 | ChatPanel messages 引用修复 | `ChatPanel.tsx` | Dev | 1h | 1.1 |
| 1.3 | 全局搜索 `getMessages` 滥用，统一修复 | 全局 | Dev | 2h | 1.1 |
| 1.4 | ChatStore debounce 800ms → 100ms | `useChatStore.ts` | Dev | 1h | — |
| 1.5 | 添加 `beforeunload` flush | `useChatStore.ts` | Dev | 1h | 1.4 |
| 1.6 | SessionSidebar 添加 `isCreating` loading 态 | `SessionSidebar.tsx` | Dev | 2h | — |
| 1.7 | 集成测试：验证 3 个 Bug 已修复 | — | Tester | 4h | 1.1-1.6 |

### 2.2 验收标准

- [ ] TC-01：连续点击 10 次新建 Session，只创建 1 个
- [ ] TC-02：流式输出完成后 500ms 内界面正常
- [ ] TC-03：连续发送 20 条消息，每条即时显示
- [ ] TC-04：重启应用后消息完整保留
- [ ] TC-05：`npx tsc --noEmit` 零报错
- [ ] TC-06：`npm run lint` 零错误

### 2.3 关键检查点

**Day 1 下班前**：
- MessageList 订阅修复完成，自测通过
- ChatStore debounce 调整完成

**Day 2 下班前**：
- SessionSidebar loading 态完成
- 集成测试通过，Phase 1 验收完毕

---

## 三、Phase 2：浏览器自动化（Day 3-5）

### 3.1 任务清单

| 序号 | 任务 | 文件 | 负责人 | 估时 | 依赖 |
|------|------|------|--------|------|------|
| 2.1 | BrowserCDPService 核心实现 | `src/main/services/browserCDP.ts` | Dev | 4h | — |
| 2.2 | IPC handlers | `src/main/ipcHandlers/browser.ts` | Dev | 2h | 2.1 |
| 2.3 | Preload API 暴露 | `src/preload/index.ts` | Dev | 1h | 2.2 |
| 2.4 | 渲染进程工具定义 | `src/renderer/services/tools/browser.ts` | Dev | 2h | 2.3 |
| 2.5 | 工具注册 | `src/renderer/services/tools/index.ts` | Dev | 0.5h | 2.4 |
| 2.6 | 意图识别扩展 | `intentClassifier.ts`、`prompts.ts` | Dev | 2h | — |
| 2.7 | 类型扩展 | `src/shared/types/index.ts`、`constants.ts` | Dev | 1h | 2.4, 2.6 |
| 2.8 | BrowserToolCard UI | `BrowserToolCard.tsx` | Dev | 3h | 2.4 |
| 2.9 | 设置页浏览器区块 | `SettingsPage.tsx` | Dev | 2h | 2.7 |
| 2.10 | Agent Engine 集成 | `agentEngine.ts` | Dev | 2h | 2.5, 2.6 |
| 2.11 | 主进程注册 IPC | `src/main/index.ts` | Dev | 0.5h | 2.2 |
| 2.12 | 集成测试：浏览器功能 | — | Tester | 4h | 2.1-2.11 |

### 3.2 验收标准

- [ ] TC-07：Agent 能正确识别"查网页"意图（评测集通过率 >= 80%）
- [ ] TC-08：打开雪球网并提取内容 < 5s
- [ ] TC-09：截图功能正常，图片可展示
- [ ] TC-10：非白名单域名被拒绝访问
- [ ] TC-11：浏览器窗口不干扰用户操作（隐藏/离屏）
- [ ] TC-12：关闭应用后浏览器进程不残留

### 3.3 关键检查点

**Day 3 下班前**：
- BrowserCDPService 核心实现完成
- IPC handlers 注册完成
- 主进程可独立测试浏览功能

**Day 4 下班前**：
- 渲染进程工具链打通（工具定义 → IPC → CDP）
- 意图识别扩展完成
- Agent 可正确触发浏览器工具

**Day 5 下班前**：
- UI 组件（BrowserToolCard、设置页）完成
- 集成测试通过，Phase 2 验收完毕

---

## 四、Phase 3：测试与发布（Day 6）

### 4.1 任务清单

| 序号 | 任务 | 负责人 | 估时 |
|------|------|--------|------|
| 3.1 | 完整集成测试（Bug 修复 + 浏览器） | Tester | 4h |
| 3.2 | 代码审查 | Reviewer | 2h |
| 3.3 | 更新 CHANGELOG | Dev | 0.5h |
| 3.4 | 打包发布 | Dev | 1h |

### 4.2 发布检查清单

- [ ] 所有测试用例通过
- [ ] 代码审查通过，无阻塞问题
- [ ] CHANGELOG.md 已更新 v6.0.0 条目
- [ ] package.json 版本号已更新为 6.0.0
- [ ] `npm run build` 成功
- [ ] 便携版 ZIP 已生成
- [ ] Git commit + tag 已创建

---

## 五、资源与依赖

### 5.1 人员

| 角色 | 职责 | 投入 |
|------|------|------|
| Dev | 代码实现 | 全程 |
| Tester | 测试执行 | Phase 1.7, 2.12, 3.1 |
| Reviewer | 代码审查 | Phase 3.2 |

### 5.2 外部依赖

| 依赖 | 状态 | 说明 |
|------|------|------|
| Electron v42 | 已就绪 | 当前使用版本 |
| 智谱 GLM API | 已就绪 | 意图识别和 LLM 回复 |
| CDP API | 已就绪 | Electron 内置，无需额外安装 |

### 5.3 文档依赖

| 文档 | 路径 | 用途 |
|------|------|------|
| v6 PRD | `docs/prd/v6-prd.md` | 需求依据 |
| v6 技术方案 | `docs/tech/v6-technical-design.md` | 技术实现依据 |
| v5 技术选型 | `docs/tech/v5-technology-selection-analysis.md` | 浏览器方案背景 |

---

## 六、风险管控

| 风险 | 影响 | 概率 | 应对 | 责任人 |
|------|------|------|------|--------|
| Phase 1 Bug 修复引入回归 | 其他功能异常 | 低 | 改动范围小，补充单元测试 | Dev |
| CDP API 行为不稳定 | 浏览器功能时好时坏 | 中 | 添加重试机制 + Mock 降级 | Dev |
| 网页反爬虫导致提取失败 | 浏览器功能不可用 | 中 | 通用提取策略 + 用户提示 | Dev |
| 开发进度延迟 | 发布延期 | 低 | Phase 2 可裁剪截图功能保文本提取 | PM |

---

## 七、附录

### A.1 每日站会模板

```
昨日完成：
- 

今日计划：
- 

阻塞/风险：
- 
```

### A.2 代码提交规范

```
feat: 新增浏览器自动化能力
fix: 修复 MessageList 订阅模式错误
chore: 更新 CHANGELOG
```

### A.3 测试环境要求

- OS：Windows 11 x64
- Node.js：v20+
- 网络：可访问智谱 API、可访问测试用金融网站
- 屏幕分辨率：1920x1080（截图测试需要）
