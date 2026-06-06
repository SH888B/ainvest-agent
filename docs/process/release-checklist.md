# AInvest 发布流程规范

> 版本：v1.0
> 日期：2026-06-06
> 适用范围：所有 minor/major 版本发布

---

## 一、目的

防止再次出现 **v4.0.0 发布遗漏** 事故：代码已合并、文档已就绪，但 `package.json` 版本号和 `CHANGELOG.md` 未更新，导致版本混乱。

---

## 二、角色职责

| 角色 | 发布相关职责 |
|------|-------------|
| **Developer** | 1. 在最后一个功能 Module 中同步更新版本号<br>2. 编写 CHANGELOG 条目<br>3. 确保代码中硬编码版本号同步更新（如 `PROMPT_VERSION`） |
| **Reviewer** | 1. 在最终 Review 时检查版本号和 CHANGELOG<br>2. 标记 [BLOCKER] 如版本号未更新 |
| **PM** | 1. 在 PRD 中标注目标版本号<br>2. 在发布前核对 PRD 与实际版本一致性 |
| **Team Lead** | 1. 最终发布前执行本 Checklist<br>2. 确认所有条目勾选后方可发布 |

---

## 三、发布前 Checklist

### 3.1 版本号一致性（必须在最后一个开发 Module 中完成）

- [ ] `package.json` 的 `version` 字段已更新为目标版本
- [ ] `package-lock.json` 已同步更新（运行 `npm install` 自动生成）
- [ ] 代码中硬编码版本号已同步（全局搜索 `'v3.0.0'` / `'v4.0.0'` / `PROMPT_VERSION`）
- [ ] PRD 文档头部的版本号与实际一致
- [ ] 架构文档头部的版本号与实际一致

### 3.2 变更日志

- [ ] `CHANGELOG.md` 已新增目标版本的条目
- [ ] CHANGELOG 包含：新增功能、优化、修复、技术规范
- [ ] 所有变更均与实际 git diff 对应

### 3.3 文档归档

- [ ] 开发计划（`docs/arch/v*-development-plan.md`）状态更新为"已完成"
- [ ] Review 报告已归档到 `docs/reviews/`
- [ ] 测试报告已归档到 `docs/test/`（如适用）

### 3.4 质量门禁

- [ ] TypeScript 编译零报错
- [ ] ESLint 零错误
- [ ] 评测集通过率不低于基线
- [ ] 核心功能回归测试通过

### 3.5 自动化发布

- [ ] 运行 `node scripts/release.cjs [patch|minor|major]` 自动完成版本更新
- [ ] 脚本输出确认：package.json、lock、CHANGELOG、PROMPT_VERSION 全部更新
- [ ] commit message 包含版本号（如 `release: v4.0.0`）
- [ ] 已打 git tag（如 `git tag v4.0.0`）
- [ ] 手动执行 `git push origin main && git push origin v4.0.0`

---

## 四、发布流程图

```
最后一个功能 Module 开发中
    ↓
Developer 同步更新：
  ├─ package.json version
  ├─ 代码中硬编码版本号
  └─ CHANGELOG.md（草稿）
    ↓
Developer 提交 Review 请求（含版本号变更说明）
    ↓
Reviewer 审核：
  ├─ 功能正确性
  ├─ 版本号一致性 ← 新增重点
  └─ CHANGELOG 完整性 ← 新增重点
    ↓
Reviewer 标记通过
    ↓
Team Lead 执行发布 Checklist（本节 3.1~3.5）
    ↓
Team Lead 确认通过
    ↓
打 git tag + 推送
    ↓
发布完成
```

---

## 五、历史事故记录

### 事故：v4.0.0 发布遗漏

- **时间**：2026-06-06
- **现象**：`V4 final` commit（a6fff33）已合并到 main，代码完整实现，但：
  - `package.json` version 仍为 `"3.0.0"`
  - `CHANGELOG.md` 无 v4 条目
  - `PROMPT_VERSION` 常量未确认是否更新
- **影响**：团队成员（包括 AI Agent）误判当前版本为 v3，导致后续版本规划混乱
- **根因**：Developer 在最后一个 Module 中未执行版本号更新；Reviewer 未将版本号一致性列入检查项
- **修复**：补更新 package.json / CHANGELOG / 代码常量
- **预防**：建立本发布流程规范，将版本号一致性纳入 Reviewer 必检项

---

## 六、快速参考

### 需要更新版本号的文件清单

| 文件 | 搜索关键词 | 示例 |
|------|-----------|------|
| `package.json` | `"version"` | `"version": "4.0.0"` |
| `package-lock.json` | `"version"` | 运行 `npm install` 自动同步 |
| `src/renderer/services/agent/prompts.ts` | `PROMPT_VERSION` | `export const PROMPT_VERSION = 'v4.0.0'` |
| `docs/prd/v*-prd.md` | `版本：v*` | `版本：v4.0.0` |
| `docs/arch/v*-development-plan.md` | `版本：v*` | `版本：v4.0.0` |
| `docs/arch/v*-*.md` | `版本：v*` | 所有架构子文档 |
| `CHANGELOG.md` | `## [x.y.z]` | `## [4.0.0] - 2026-06-06` |

---

*文档版本：v1.0*
*最后更新：2026-06-06*
