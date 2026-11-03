import type { Analysis } from './run'
import { CHECKS, type CheckId, type CheckResult, type Level } from './types'

export function countLevels(a: Analysis): Record<Level, number> {
  const c: Record<Level, number> = { error: 0, warning: 0, info: 0 }
  for (const r of a.results) for (const i of r.issues) c[i.level]++
  return c
}

export type VerdictKind = 'error' | 'warning' | 'incomplete' | 'pass'

/** 没有跑完整的检查（被跳过，或者依赖的规则还没配置）的名字 */
export function unfinished(a: Analysis): string[] {
  return a.results.filter((r) => r.status === 'skipped' || r.status === 'partial').map((r) => CHECKS.find((m) => m.id === r.id)?.title ?? r.id)
}

/** 一句话结论；“没发现问题”不等于“全部通过”，有检查没跑完整时要说出来 */
export function verdict(a: Analysis): { kind: VerdictKind; text: string } {
  const c = countLevels(a)
  if (c.error) return { kind: 'error', text: `发现 ${c.error} 个错误${c.warning ? `、${c.warning} 个警告` : ''}` }
  if (c.warning) return { kind: 'warning', text: `没有错误，有 ${c.warning} 个警告` }
  const todo = unfinished(a)
  if (todo.length) return { kind: 'incomplete', text: `没有发现问题，但「${todo.join('」「')}」没有完整检查` }
  return { kind: 'pass', text: `${CHECKS.length} 项检查全部通过` }
}

/** 结果页首屏的大标题和副标题：大标题只放最重要的一个数字 */
export function headline(a: Analysis): { kind: VerdictKind; big: string; sub: string } {
  const c = countLevels(a)
  const v = verdict(a)
  switch (v.kind) {
    case 'error':
      return { kind: 'error', big: `${c.error} 个错误`, sub: c.warning ? `另有 ${c.warning} 个警告` : '没有警告' }
    case 'warning':
      return { kind: 'warning', big: `${c.warning} 个警告`, sub: '没有错误' }
    case 'incomplete':
      return { kind: 'incomplete', big: '没有发现问题', sub: `但「${unfinished(a).join('」「')}」没有完整检查` }
    default:
      return { kind: 'pass', big: '全部通过', sub: `${CHECKS.length} 项检查都没有发现问题` }
  }
}

/** “6 项检查里，5 项有错误，1 项通过。” 居中说明段的第一行 */
export function statementLine(a: Analysis): string {
  const by = { error: 0, warning: 0, todo: 0, pass: 0 }
  for (const r of a.results) {
    if (r.status === 'error') by.error++
    else if (r.status === 'warning') by.warning++
    else if (r.status === 'partial' || r.status === 'skipped') by.todo++
    else by.pass++
  }
  const n = a.results.length
  if (by.pass === n) return `${n} 项检查全部通过。`
  const parts = [by.error && `${by.error} 项有错误`, by.warning && `${by.warning} 项有警告`, by.todo && `${by.todo} 项没有完整检查`, by.pass && `${by.pass} 项通过`].filter((p): p is string => typeof p === 'string')
  return `${n} 项检查里，${parts.join('，')}。`
}

/** 问题最重的一项（错误数优先，其次警告数），便当格里把它做成深色块。一个问题都没有时返回 null */
export function worstCheck(results: CheckResult[]): CheckId | null {
  let best: CheckId | null = null
  let score = 0
  for (const r of results) {
    const e = r.issues.filter((i) => i.level === 'error').length
    const w = r.issues.filter((i) => i.level === 'warning').length
    const s = e * 1000 + w
    if (s > score) {
      score = s
      best = r.id
    }
  }
  return best
}

/**
 * 水印字号：名字越长字越小，让整个名字大致占满 width。中文按一个字宽 1em、拉丁字符按 0.58em 估算。
 * 水印只是装饰，估得不准最多是多裁掉一点或留一点空。
 */
export function watermarkSize(name: string, width: number, max = 160, min = 64): number {
  const units = [...name].reduce((s, ch) => s + (/[一-鿿]/.test(ch) ? 1 : 0.58), 0) || 1
  return Math.max(min, Math.min(max, Math.floor(width / units)))
}
