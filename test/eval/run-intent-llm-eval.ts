/**
 * LLM 层意图识别评测脚本
 * 批量调用 classifyIntentLLM（真实 API），输出准确率报告
 *
 * 运行方式：
 *   GLM_API_KEY=your-key npx tsx test/eval/run-intent-llm-eval.ts
 *   GLM_API_KEY=your-key npx tsx test/eval/run-intent-llm-eval.ts --model=glm-5.1
 */

import { classifyIntentLLM } from '../../src/renderer/services/agent/intentClassifier'
import { classifyIntentLocal } from '../../src/renderer/services/agent/intentClassifier'
import { IntentType } from '../../src/shared/types'
import evalData from './intent-eval.json'

interface EvalCase {
  id: string
  input: string
  expected_intent: IntentType
  tags: string[]
  difficulty: string
}

interface EvalResult {
  id: string
  input: string
  expected: IntentType
  actual: IntentType
  confidence: number
  passed: boolean
  tags: string[]
  difficulty: string
}

const parseArgs = (): { model: string } => {
  const modelArg = process.argv.find((arg) => arg.startsWith('--model='))
  return {
    model: modelArg ? modelArg.split('=')[1] : 'glm-5.1',
  }
}

const runEval = async (): Promise<void> => {
  const apiKey = process.env.GLM_API_KEY || ''
  const baseUrl = process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4'
  const { model } = parseArgs()

  if (!apiKey) {
    console.error('错误：请设置 GLM_API_KEY 环境变量')
    console.error('示例：GLM_API_KEY=your-key npx tsx test/eval/run-intent-llm-eval.ts')
    process.exit(1)
  }

  const config = { apiKey, baseUrl, model, temperature: 0.1 }
  const tests = evalData.tests as EvalCase[]
  const results: EvalResult[] = []
  const byIntent: Record<string, { total: number; passed: number }> = {}
  const byDifficulty: Record<string, { total: number; passed: number }> = {}

  console.log(`开始 LLM 意图评测（模型: ${model}）...\n`)

  for (const test of tests) {
    try {
      const result = await classifyIntentLLM(test.input, config)
      const passed = result.intent === test.expected_intent

      results.push({
        id: test.id,
        input: test.input,
        expected: test.expected_intent,
        actual: result.intent,
        confidence: result.confidence,
        passed,
        tags: test.tags,
        difficulty: test.difficulty,
      })

      if (!byIntent[test.expected_intent]) {
        byIntent[test.expected_intent] = { total: 0, passed: 0 }
      }
      byIntent[test.expected_intent].total++
      if (passed) byIntent[test.expected_intent].passed++

      if (!byDifficulty[test.difficulty]) {
        byDifficulty[test.difficulty] = { total: 0, passed: 0 }
      }
      byDifficulty[test.difficulty].total++
      if (passed) byDifficulty[test.difficulty].passed++

      // 防止请求过快
      await new Promise((resolve) => setTimeout(resolve, 200))
    } catch (err) {
      console.error(`用例 ${test.id} 调用失败:`, err)
      results.push({
        id: test.id,
        input: test.input,
        expected: test.expected_intent,
        actual: 'unknown',
        confidence: 0,
        passed: false,
        tags: test.tags,
        difficulty: test.difficulty,
      })
    }
  }

  const total = results.length
  const passed = results.filter((r) => r.passed).length
  const accuracy = ((passed / total) * 100).toFixed(1)

  // 计算正则层基线
  const localResults = tests.map((t) => {
    const local = classifyIntentLocal(t.input)
    return local?.intent === t.expected_intent
  })
  const localPassed = localResults.filter(Boolean).length
  const localAccuracy = ((localPassed / total) * 100).toFixed(1)

  // 输出报告
  console.log('# LLM 意图识别评测报告\n')
  console.log(`**评测时间**: ${new Date().toLocaleString()}`)
  console.log(`**评测范围**: LLM 层 (classifyIntentLLM)`)
  console.log(`**模型**: ${model}`)
  console.log(`**总用例数**: ${total}`)
  console.log(`**通过数**: ${passed}`)
  console.log(`**准确率**: ${accuracy}%`)
  console.log(`**正则层基线**: ${localAccuracy}%`)
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
  console.log('| ID | 输入 | 期望 | 实际 | 置信度 | 结果 | 标签 |')
  console.log('|----|------|------|------|--------|------|------|')
  for (const r of results) {
    const status = r.passed ? 'PASS' : 'FAIL'
    const inputShort = r.input.length > 20 ? r.input.slice(0, 20) + '...' : r.input
    console.log(
      `| ${r.id} | ${inputShort} | ${r.expected} | ${r.actual} | ${r.confidence.toFixed(2)} | ${status} | ${r.tags.join(',')} |`
    )
  }

  console.log('\n---')
  console.log(`**结论**: ${Number(accuracy) >= 80 ? '通过' : '未通过'} (准确率 ${accuracy}%)`)
}

runEval().catch((err) => {
  console.error('评测脚本执行失败:', err)
  process.exit(1)
})
