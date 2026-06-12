---
name: v2-agent-development-plan
overview: 从零搭建 AInvest Electron 应用，完成 v1 基础框架 + v2 LLM Agent 升级，分 5 个 Phase 开发，每个 Phase 含验收测试节点。
design:
  architecture:
    framework: react
    component: shadcn
  styleKeywords:
    - Codex IDE
    - Dark Theme
    - Professional
    - Card-based
    - Minimalist
  fontSystem:
    fontFamily: PingFang SC
    heading:
      size: 18px
      weight: 600
    subheading:
      size: 14px
      weight: 500
    body:
      size: 13px
      weight: 400
  colorSystem:
    primary:
      - "#0EA5E9"
      - "#0284C7"
    background:
      - "#0F172A"
      - "#1E293B"
      - "#334155"
    text:
      - "#F1F5F9"
      - "#CBD5E1"
      - "#94A3B8"
    functional:
      - "#22C55E"
      - "#EF4444"
      - "#F59E0B"
todos:
  - id: init-project
    content: 初始化 Electron + Vite + React + TS 项目框架
    status: completed
  - id: setup-layout
    content: 搭建三栏布局（行情/聊天/Session）和基础路由
    status: completed
    dependencies:
      - init-project
  - id: v1-market-mock
    content: 实现行情看板（Mock 数据：总览、自选股、个股详情）
    status: completed
    dependencies:
      - setup-layout
  - id: v1-session-chat
    content: 实现 Session 管理和 Chat 面板基础（Mock 对话）
    status: completed
    dependencies:
      - setup-layout
  - id: v1-test
    content: v1 集成测试：验证三栏布局、Session 切换、Mock 对话闭环
    status: completed
    dependencies:
      - v1-market-mock
      - v1-session-chat
  - id: llm-service
    content: 实现 LLMService（Kimi API 封装：流式/非流式/验证）
    status: completed
    dependencies:
      - v1-test
  - id: llm-config-ui
    content: 实现大模型配置 UI（API Key、模型、Temperature）和引导横幅
    status: completed
    dependencies:
      - llm-service
  - id: intent-classifier
    content: 实现意图识别器（LLM 分类 + 正则兜底）
    status: completed
    dependencies:
      - llm-service
  - id: memory-system
    content: 实现短期记忆（Session 上下文）和长期记忆（memory.json）
    status: completed
    dependencies:
      - llm-service
  - id: agent-engine-v2
    content: 升级 Agent 引擎：LLM 驱动回复 + Function Calling 工具调用
    status: completed
    dependencies:
      - intent-classifier
      - memory-system
      - llm-config-ui
  - id: preference-extract
    content: 实现"总结今日偏好"Mock 按钮和偏好提炼流程
    status: completed
    dependencies:
      - memory-system
  - id: v2-test
    content: v2 集成测试：验证 LLM 对话、意图识别、工具调用、记忆加载
    status: completed
    dependencies:
      - agent-engine-v2
      - preference-extract
---

## 产品概述

AInvest CLI Agent 是一款面向投资研究的桌面 Agent 工作台。v2 阶段核心目标是将 Agent 从 Mock 回复 + 硬编码意图识别升级为大模型驱动 + 动态记忆，使聊天窗口真正可用。

## 核心功能

- 大模型配置：用户可在设置中配置 Kimi API Key、模型选择、Temperature
- 智能 Agent 对话：大模型实时流式生成自然语言回复
- 意图识别：大模型分类用户意图到 8 种预设类型（market.query/news.search/strategy.backtest/stock.profile/general.chat/session.manage/preference.update/unknown）
- 短期记忆：Session 内对话历史作为上下文保留最近 10 轮
- 长期记忆：从对话中提炼用户偏好（风险偏好、关注板块、常问问题）并持久化到 memory.json
- 工具调用：类 Function Calling 模式，LLM 决定调用时机和参数
- 降级策略：LLM 失败时本地正则兜底，保证基础功能可用
- 偏好提炼：提供"总结今日偏好"Mock 按钮手动触发

## 验收标准

- 大模型配置：可配置 Key/模型/Temperature，保存后即时生效
- 流式对话：输入后 3s 内开始输出，逐字显示
- 意图识别：常见查询意图准确率 > 80%
- 工具调用：能正确触发工具并展示结果卡片
- 短期记忆：同一 Session 内可追问指代
- 长期记忆：新 Session 加载偏好，回答贴合用户关注点
- 降级策略：LLM 失败时可用本地规则兜底

## Tech Stack Selection

- **Frontend Framework**: React 18 + TypeScript
- **Desktop Shell**: Electron (渲染进程直接 fetch 调用 Kimi API)
- **Build Tool**: Vite
- **State Management**: Zustand
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **LLM API**: Kimi (OpenAI-compatible API)

## Implementation Approach

项目从零开始，分阶段实现 v1 基础框架 + v2 LLM Agent 升级。采用"底座先行、逐层叠加"策略：先搭建 Electron + React 基础框架和三栏布局，再实现 v1 的 Mock 功能验证交互闭环，最后接入 LLM 服务完成 v2 升级。每个阶段完成后立即测试，确保质量门通过后再进入下一阶段。

## Implementation Notes

- 渲染进程直接 `fetch` 调用 Kimi API，流式响应通过 `ReadableStream` 直接驱动 React UI，无需 IPC 中转
- API Key 存储在 `localStorage`（v2 阶段），长期记忆存储在 `userData/ainvest/memory.json`
- 意图识别采用 LLM 为主 + 本地正则兜底的双层策略，确保 LLM 不可用时的 robustness
- 工具调用采用类 Function Calling 模式，与 OpenAI/Kimi 官方规范对齐，后续迁移成本低
- 上下文保留最近 10 轮完整对话，超过时截断早期对话

## Architecture Design

系统分为四个层次：

1. **UI 层**：三栏布局（行情看板 40% + 聊天面板 40% + Session 列表 20%），基于 React + Tailwind
2. **状态管理层**：Zustand Store（useChatStore / useSessionStore / usePreferenceStore / useMemoryStore）
3. **服务层**：LLMService（Kimi API 封装）、IntentClassifier（意图识别）、AgentEngine（对话处理）、ToolRegistry（工具注册与执行）
4. **持久化层**：localStorage（配置、Session 元数据）、JSON 文件（userData/ainvest/memory.json、userData/ainvest/sessions/*.json）

数据流：用户输入 -> ChatStore -> AgentEngine -> IntentClassifier -> LLMService -> Kimi API -> 流式响应 -> ChatPanel 逐字渲染。工具调用时：LLM 返回 tool_calls -> 前端执行工具 -> 结果回传 LLM -> 生成最终回复。

## Directory Structure

```
c:/Users/sun/codes/ths-project/
├── docs/
│   ├── prd/v1-prd.md
│   ├── prd/v2-prd.md
│   └── arch/v2-agent-llm-upgrade.md
├── src/
│   ├── main/                          # Electron 主进程
│   │   ├── index.ts                   # [NEW] 主进程入口，窗口管理
│   │   └── services/
│   │       └── persistence.ts         # [NEW] 文件读写服务（memory.json、Session 数据）
│   ├── preload/                       # [NEW] Preload 脚本
│   │   └── index.ts
│   ├── renderer/                      # Electron 渲染进程
│   │   ├── main.tsx                   # [NEW] React 入口
│   │   ├── App.tsx                    # [NEW] 根组件，三栏布局
│   │   ├── index.css                  # [NEW] Tailwind 入口
│   │   ├── stores/                    # Zustand 状态管理
│   │   │   ├── useChatStore.ts        # [NEW] 聊天状态（消息、LLM 上下文转换）
│   │   │   ├── useSessionStore.ts     # [NEW] Session 管理（新建/切换/重命名/删除）
│   │   │   ├── usePreferenceStore.ts  # [NEW] 用户偏好 + 大模型配置
│   │   │   └── useMemoryStore.ts      # [NEW] 长期记忆（加载/提炼/保存）
│   │   ├── services/                  # 业务服务层
│   │   │   ├── llm/
│   │   │   │   ├── llmService.ts      # [NEW] Kimi API 封装（流式/非流式/验证）
│   │   │   │   └── types.ts           # [NEW] ChatMessage/ToolCall/ToolDefinition 类型
│   │   │   ├── agent/
│   │   │   │   ├── agentEngine.ts     # [NEW] Agent 核心引擎（v2 LLM 驱动流程）
│   │   │   │   ├── intentClassifier.ts # [NEW] 意图识别器（LLM + 正则兜底）
│   │   │   │   └── prompts.ts         # [NEW] System Prompt 构建（含记忆注入）
│   │   │   ├── tools/
│   │   │   │   ├── registry.ts        # [NEW] 工具注册表
│   │   │   │   ├── market.ts          # [NEW] 行情查询工具（Mock）
│   │   │   │   ├── news.ts            # [NEW] 新闻检索工具（Mock）
│   │   │   │   ├── strategy.ts        # [NEW] 策略回测工具（Mock）
│   │   │   │   └── stock.ts           # [NEW] 个股档案工具（Mock）
│   │   │   └── mocks/                 # Mock 数据
│   │   │       └── index.ts           # [NEW] 行情/新闻/股票 Mock 数据
│   │   ├── features/                  # 功能模块（按页面/区域组织）
│   │   │   ├── layout/
│   │   │   │   └── MainLayout.tsx     # [NEW] 三栏布局容器
│   │   │   ├── market/
│   │   │   │   ├── MarketPanel.tsx    # [NEW] 行情看板（总览/自选股/个股详情）
│   │   │   │   ├── MarketOverview.tsx # [NEW] 行情总览
│   │   │   │   ├── WatchList.tsx      # [NEW] 自选股列表
│   │   │   │   └── StockDetail.tsx    # [NEW] 个股详情
│   │   │   ├── chat/
│   │   │   │   ├── ChatPanel.tsx      # [NEW] 聊天面板（含 API Key 引导横幅）
│   │   │   │   ├── MessageList.tsx    # [NEW] 消息列表
│   │   │   │   ├── MessageItem.tsx    # [NEW] 单条消息（用户/Agent/工具卡片）
│   │   │   │   └── ChatInput.tsx      # [NEW] 输入框
│   │   │   ├── session/
│   │   │   │   ├── SessionSidebar.tsx # [NEW] Session 侧边栏（含"总结今日偏好"按钮）
│   │   │   │   └── SessionItem.tsx    # [NEW] Session 列表项
│   │   │   └── settings/
│   │   │       ├── SettingsPage.tsx   # [NEW] 设置页
│   │   │       ├── LLMSettings.tsx    # [NEW] 大模型配置
│   │   │       └── PreferenceSettings.tsx # [NEW] 个人偏好查看/修改
│   │   └── components/ui/             # [NEW] 通用 UI 组件（shadcn/ui）
│   ├── package.json                   # [NEW]
│   ├── tsconfig.json                  # [NEW]
│   ├── vite.config.ts                 # [NEW]
│   ├── tailwind.config.js             # [NEW]
│   └── electron.vite.config.ts        # [NEW] Electron + Vite 构建配置
├── index.html                         # [NEW]
└── electron-builder.yml               # [NEW] Electron 打包配置
```

## Key Code Structures

```typescript
// src/renderer/services/llm/types.ts
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
}
```

## 设计架构

采用 React + TypeScript + Tailwind CSS + shadcn/ui 构建桌面应用 UI。

## 设计风格

参考 Codex IDE 风格，简约现代的金融投研平台。深色主题为主，强调专业感和信息密度。使用卡片式布局区分功能区块，清晰的视觉层级引导用户注意力。

## 页面规划

- **主界面**：三栏布局（左 40% 行情看板、中 40% 聊天面板、右 20% Session 列表）
- **设置页**：模态框或独立页面，包含大模型配置和个人偏好

## 单页区块设计

### 主界面

1. **顶部导航栏**：应用标题、当前 Session 名称、设置入口
2. **左侧行情看板**：顶部导航切换（总览/自选股/个股详情），下方展示对应内容
3. **中间聊天面板**：消息列表（用户/Agent/工具卡片）、底部输入框、API Key 未配置时顶部横幅提示
4. **右侧 Session 列表**：Session 列表、新建按钮、底部"总结今日偏好"Mock 按钮

### 设置页

1. **大模型配置区块**：API Key 输入（带显示/隐藏）、Base URL、模型下拉选择、Temperature 滑块、验证并保存按钮
2. **个人偏好区块**：风险偏好下拉、关注板块标签（可增删）、常问问题展示