#!/usr/bin/env node

/**
 * 自动化发布脚本
 * 用法：node scripts/release.js [patch|minor|major]
 * 默认：patch
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf-8'))
}

function writeJson(file, data) {
  fs.writeFileSync(path.join(ROOT, file), JSON.stringify(data, null, 2) + '\n')
}

function bumpVersion(current, type) {
  const [major, minor, patch] = current.split('.').map(Number)
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
    default:
      return `${major}.${minor}.${patch + 1}`
  }
}

function getToday() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function run(cmd) {
  console.log(`> ${cmd}`)
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' })
}

function main() {
  const releaseType = process.argv[2] || 'patch'
  if (!['patch', 'minor', 'major'].includes(releaseType)) {
    console.error(`未知版本类型: ${releaseType}`)
    console.error('用法: node scripts/release.cjs [patch|minor|major]')
    process.exit(1)
  }

  // 1. 读取当前版本
  const pkg = readJson('package.json')
  const currentVersion = pkg.version
  const newVersion = bumpVersion(currentVersion, releaseType)
  const tagName = `v${newVersion}`

  console.log(`\n准备发布: ${currentVersion} -> ${newVersion} (${releaseType})\n`)

  // 2. 确认分支
  const branch = execSync('git branch --show-current', { cwd: ROOT, encoding: 'utf-8' }).trim()
  if (branch !== 'main') {
    console.error(`错误: 当前分支是 ${branch}，发布必须在 main 分支执行`)
    console.error('请先合并到 main 再运行发布脚本')
    process.exit(1)
  }

  // 3. 检查工作树是否干净
  try {
    execSync('git diff --quiet', { cwd: ROOT })
  } catch {
    console.error('错误: 工作树不干净，请先提交或暂存所有变更')
    process.exit(1)
  }

  // 4. 更新 package.json
  pkg.version = newVersion
  writeJson('package.json', pkg)
  console.log(`✓ package.json 版本更新为 ${newVersion}`)

  // 5. 同步 package-lock.json
  run('npm install')
  console.log('✓ package-lock.json 已同步')

  // 6. 更新 CHANGELOG 日期（如果最近条目日期不对）
  const changelogPath = path.join(ROOT, 'CHANGELOG.md')
  let changelog = fs.readFileSync(changelogPath, 'utf-8')
  const today = getToday()
  // 自动修正最近一个未发布条目的日期占位符
  changelog = changelog.replace(
    /## \[(\d+\.\d+\.\d+)\] - (TBD|待发布|YYYY-MM-DD)/,
    `## [$1] - ${today}`
  )
  fs.writeFileSync(changelogPath, changelog)
  console.log(`✓ CHANGELOG 日期已更新为 ${today}`)

  // 7. 检查代码中硬编码版本号（PROMPT_VERSION）
  const promptsPath = path.join(ROOT, 'src/renderer/services/agent/prompts.ts')
  if (fs.existsSync(promptsPath)) {
    let prompts = fs.readFileSync(promptsPath, 'utf-8')
    const oldPromptVersion = `v${currentVersion}`
    const newPromptVersion = `v${newVersion}`
    if (prompts.includes(oldPromptVersion)) {
      prompts = prompts.replace(oldPromptVersion, newPromptVersion)
      fs.writeFileSync(promptsPath, prompts)
      console.log(`✓ PROMPT_VERSION 已更新为 ${newPromptVersion}`)
    }
  }

  // 8. Git commit
  run(`git add -A`)
  run(`git commit -m "release: ${tagName}"`)
  console.log(`✓ Git commit 已创建: release: ${tagName}`)

  // 9. Git tag
  run(`git tag ${tagName}`)
  console.log(`✓ Git tag 已创建: ${tagName}`)

  // 10. 推送
  console.log('\n推送命令（请手动执行以确认）:')
  console.log(`  git push origin main`)
  console.log(`  git push origin ${tagName}`)
  console.log(`\n发布准备完成！`)
}

main()
