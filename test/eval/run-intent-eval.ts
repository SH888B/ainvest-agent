/**
 * 意图识别评测脚本
 * 批量跑 intent-eval.json，输出准确率报告
 *
 * 运行方式：npx tsx test/eval/run-intent-eval.ts
 */

import { classifyIntentLocal } from '../../src/renderer/services/agent/intentClassifier'
import { IntentType } from '../../src/shared/types'
import evalData from './intent-eval.json'

interface EvalCase {
  id: string
  input: string
  expected_intent: IntentType
  expected_entities: Record<string, unknown>
  tags: string[]
  difficulty: string
}

interface EvalResult {
  id: string
  input: string
  expected: IntentType
  actual: IntentType
  passed: boolean
  tags: string[]
  difficulty: string
}

const runEval = (): void => {
  const tests = evalData.tests as EvalCase[]
  const results: EvalResult[] = []
  const byIntent: Record<string, { total: number; passed: number }> = {}
  const byDifficulty: Record<string, { total: number; passed: number }> = {}

  for (const test of tests) {
    const actual = classifyIntentLocal(test.input)
    const actualIntent = actual?.intent || 'unknown'
    const passed = actualIntent === test.expected_intent

    results.push({
      id: test.id,
      input: test.input,
      expected: test.expected_intent,
      actual: actualIntent,
      passed,
      tags: test.tags,
      difficulty: test.difficulty,
    })

    // 按意图统计
    if (!byIntent[test.expected_intent]) {
      byIntent[test.expected_intent] = { total: 0, passed: 0 }
    }
    byIntent[test.expected_intent].total++
    if (passed) byIntent[test.expected_intent].passed++

    // 按难度统计
    if (!byDifficulty[test.difficulty]) {
      byDifficulty[test.difficulty] = { total: 0, passed: 0 }
    }
    byDifficulty[test.difficulty].total++
    if (passed) byDifficulty[test.difficulty].passed++
  }

  const total = results.length
  const passed = results.filter((r) => r.passed).length
  const accuracy = ((passed / total) * 100).toFixed(1)

  // 输出报告
  console.log('# 意图识别评测报告\n')
  console.log(`**评测时间**: ${new Date().toLocaleString()}`)
  console.log(`**评测范围**: 本地正则层 (classifyIntentLocal)`)
  console.log(`**总用例数**: ${total}`)
  console.log(`**通过数**: ${passed}`)
  console.log(`**准确率**: ${accuracy}%`)
  console.log(`**阈值要求**: >= 80%\n`)

  console.log('## 按意图类型统计\n')
  console.log('| 意图类型 | 用例数 | 通过数 | 准确率 |')
  console.log('|----------|--------|--------|--------|')
  for (const [intent, stat] of Object.entries(byIntent)) {
    const acc = ((stat.passed / stat.total) * 100).toFixed(1)
    console.log(`| ${intent} | ${stat.total} | ${stat.passed} | ${acc}% |`)
  }

  console.log('\n## 按难度统计\n')
  console.log('| 难度 | 用例数 | 通过数 | 准确率 |')
  console.log('|------|--------|--------|--------|')
  for (const [diff, stat] of Object.entries(byDifficulty)) {
    const acc = ((stat.passed / stat.total) * 100).toFixed(1)
    console.log(`| ${diff} | ${stat.total} | ${stat.passed} | ${acc}% |`)
  }

  console.log('\n## 详细结果\n')
  console.log('| ID | 输入 | 期望 | 实际 | 结果 | 标签 |')
  console.log('|----|------|------|------|------|------|')
  for (const r of results) {
    const status = r.passed ? 'PASS' : 'FAIL'
    const inputShort = r.input.length > 20 ? r.input.slice(0, 20) + '...' : r.input
    console.log(`| ${r.id} | ${inputShort} | ${r.expected} | ${r.actual} | ${status} | ${r.tags.join(',')} |`)
  }

  console.log('\n---')
  console.log(`**结论**: ${Number(accuracy) >= 80 ? '通过' : '未通过'} (准确率 ${accuracy}%)`)
}

runEval()
