# AInvest Agent

> 面向投资研究的桌面 Agent 工作台

## 项目简介

AInvest Agent 是一款基于 Electron + React + TypeScript 的桌面 Agent 应用，集成大语言模型（GLM 5.1 / Kimi）提供智能投研助手能力。支持股票行情查询、新闻搜索、策略回测、个股档案等工具调用，并具备短期记忆（Session 上下文）和长期记忆（用户偏好提炼）能力。

## 技术栈

- **桌面框架**: Electron v42+
- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite + electron-vite
- **状态管理**: Zustand
- **样式方案**: Tailwind CSS
- **UI 图标**: lucide-react
- **LLM API**: 智谱 GLM 5.1（OpenAI-compatible）

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装依赖

```bash
npm install
```

### 配置大模型 API Key

1. 在应用设置页中配置：
   - **API Key**: 你的智谱 API Key（`sk-...`）
   - **Base URL**: `https://open.bigmodel.cn/api/paas/v4`
   - **模型**: `glm-5.1`
2. 点击"验证并保存"

> 或前往 [智谱开放平台](https://open.bigmodel.cn/) 申请 API Key

### 开发模式

```bash
# 纯前端开发（浏览器预览）
npm run dev

# Electron 桌面应用开发
npm run dev:electron
```

### 构建

```bash
# 构建所有进程
npm run build

# 打包 Electron 应用
npm run dist
```

## 项目结构

```
.
├── src/
│   ├── main/              # Electron 主进程
│   ├── preload/           # Preload 脚本（安全桥接）
│   ├── renderer/          # React 渲染进程
│   │   ├── features/      # 功能模块（布局、行情、聊天、Session、设置）
│   │   ├── services/      # 业务服务层（LLM、Agent、工具、日志、记忆）
│   │   ├── stores/        # Zustand 状态管理
│   │   └── components/    # 通用 UI 组件
│   └── shared/            # 共享类型和常量
├── test/eval/             # 评测集和评测脚本
├── docs/                  # 文档（PRD、架构、测试策略）
├── index.html             # 渲染进程入口
├── electron.vite.config.ts
└── package.json
```

## 核心功能

- **智能对话**: 基于 GLM 5.1 的流式对话，支持工具调用
- **行情看板**: Mock 股票数据展示（总览/自选股/个股详情）
- **意图识别**: LLM + 本地正则双层策略，8 种意图类型
- **工具调用**: 行情查询、新闻搜索、策略回测、个股档案
- **短期记忆**: Session 内保留最近 10 轮对话上下文
- **长期记忆**: 自动提炼用户风险偏好、关注板块等偏好
- **评测体系**: 35+ 条意图识别评测集，自动化跑批

## 开发规范

- TypeScript `strict: true`，禁止隐式 `any`
- 函数式组件 + Hooks，PascalCase 命名
- 所有公共函数编写 JSDoc
- Preload 脚本最小暴露原则
- IPC 通道使用命名空间前缀（如 `agent:invokeTool`）

## 测试

```bash
# 意图识别评测（本地正则层）
npx tsx test/eval/run-intent-eval.ts

# E2E 评测
npx tsx test/eval/run-e2e-eval.ts
```

## License

MIT
