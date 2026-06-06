/**
 * E2E 评测脚本（简化版）
 * 批量跑 e2e-eval.json，验证意图分类正确性
 *
 * 运行方式：npx tsx test/eval/run-e2e-eval.ts
 */

import { quickClassify } from '../../src/renderer/services/agent/agentEngine'
import { IntentType } from '../../src/shared/types'
import evalData from './e2e-eval.json'

interface EvalCase {
  id: string
  input: string
  expected_intent: IntentType
  expected_contains: string[]
  expected_tool_called: string | null
  tags: string[]
}

interface EvalResult {
  id: string
  input: string
  expected: IntentType
  actual: IntentType
  passed: boolean
  tags: string[]
}

const runEval = (): void => {
  const tests = evalData.tests as EvalCase[]
  const results: EvalResult[] = []
  const byTag: Record<string, { total: number; passed: number }> = {}

  for (const test of tests) {
    const actualIntent = quickClassify(test.input)
    const passed = actualIntent === test.expected_intent

    results.push({
      id: test.id,
      input: test.input,
      expected: test.expected_intent,
      actual: actualIntent,
      passed,
      tags: test.tags,
    })

    for (const tag of test.tags) {
      if (!byTag[tag]) byTag[tag] = { total: 0, passed: 0 }
      byTag[tag].total++
      if (passed) byTag[tag].passed++
    }
  }

  const total = results.length
  const passed = results.filter((r) => r.passed).length
  const accuracy = ((passed / total) * 100).toFixed(1)

  console.log('# E2E 评测报告\n')
  console.log(`**评测时间**: ${new Date().toLocaleString()}`)
  console.log(`**总用例数**: ${total}`)
  console.log(`**通过数**: ${passed}`)
  console.log(`**准确率**: ${accuracy}%\n`)

  console.log('## 按标签统计\n')
  console.log('| 标签 | 用例数 | 通过数 | 准确率 |')
  console.log('|------|--------|--------|--------|')
  for (const [tag, stat] of Object.entries(byTag)) {
    const acc = ((stat.passed / stat.total) * 100).toFixed(1)
    console.log(`| ${tag} | ${stat.total} | ${stat.passed} | ${acc}% |`)
  }

  console.log('\n## 详细结果\n')
  console.log('| ID | 输入 | 期望 | 实际 | 结果 |')
  console.log('|----|------|------|------|------|')
  for (const r of results) {
    const status = r.passed ? 'PASS' : 'FAIL'
    const inputShort = r.input.length > 20 ? r.input.slice(0, 20) + '...' : r.input
    console.log(`| ${r.id} | ${inputShort} | ${r.expected} | ${r.actual} | ${status} |`)
  }

  console.log('\n---')
  console.log(`**结论**: ${Number(accuracy) >= 80 ? '通过' : '未通过'} (准确率 ${accuracy}%)`)
}

runEval()
