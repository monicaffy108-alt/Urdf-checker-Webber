import { countLevels } from './summary'
import type { Analysis } from './run'
import { CHECKS, type CheckStatus } from './types'

const STATUS: Record<CheckStatus, string> = { pass: '通过', warning: '警告', error: '错误', skipped: '跳过', partial: '待配置' }
const LEVEL = { error: '错误', warning: '警告', info: '提示' } as const

export interface ReportEntry {
  path: string
  analysis: Analysis
}

const cell = (s: string) => s.replace(/\|/g, '\\|')

/** 把整个文件夹的检查结果写成一份 Markdown 报告 */
export function buildReport(label: string, fileCount: number, entries: ReportEntry[], now = new Date()): string {
  const out: string[] = ['# URDF 检查报告', '']
  out.push(`- 生成时间：${now.toLocaleString('zh-CN', { hour12: false })}`)
  out.push(`- 来源：${label}（${fileCount} 个文件，${entries.length} 个 URDF）`, '')

  out.push('## 总览', '')
  out.push(`| 文件 | ${CHECKS.map((c) => `${c.no} ${c.title}`).join(' | ')} | 错误 | 警告 |`)
  out.push(`|${' --- |'.repeat(CHECKS.length + 3)}`)
  for (const { path, analysis } of entries) {
    const c = countLevels(analysis)
    const st = CHECKS.map((m) => STATUS[analysis.results.find((r) => r.id === m.id)?.status ?? 'skipped'])
    out.push(`| ${cell(path)} | ${st.join(' | ')} | ${c.error} | ${c.warning} |`)
  }

  for (const { path, analysis } of entries) {
    out.push('', `## ${path}`, '')
    if (analysis.stats) {
      out.push(`robot：${analysis.robot ?? '(未命名)'}；${analysis.stats.links} 个 link、${analysis.stats.joints} 个 joint；根 link：${analysis.stats.root ?? '无'}`, '')
    }
    for (const m of CHECKS) {
      const r = analysis.results.find((x) => x.id === m.id)
      if (!r) continue
      out.push(`### ${m.no}. ${m.title}　[${STATUS[r.status]}]`, '', r.summary, '')
      for (const i of r.issues) {
        const where = [i.line ? `第 ${i.line} 行` : '', i.target ?? ''].filter(Boolean).join(' · ')
        out.push(`- **${LEVEL[i.level]}**${where ? `（${where}）` : ''}：${i.message}${i.hint ? `　→ ${i.hint}` : ''}`)
      }
      if (r.issues.length) out.push('')
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}
