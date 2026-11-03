import type { CheckStatus, Level } from '../core/types'

export const STATUS_TEXT: Record<CheckStatus, string> = { pass: '通过', warning: '警告', error: '错误', skipped: '已跳过', partial: '待配置' }
export const LEVEL_TEXT: Record<Level, string> = { error: '错误', warning: '警告', info: '提示' }

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')

export const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1)
export const dirName = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')

/** 状态：一个小圆点加一个字。圆点的形状（实心 / 空心）和文字都在，不只靠颜色 */
export function StatusDot({ status, label = true }: { status: CheckStatus | Level; label?: boolean }) {
  const text = status === 'info' ? '提示' : status in STATUS_TEXT ? STATUS_TEXT[status as CheckStatus] : (LEVEL_TEXT as Record<string, string>)[status]
  return (
    <span className="state">
      <i className={`dot ${status}`} aria-hidden="true" />
      {label ? text : <span className="sr-only">{text}</span>}
    </span>
  )
}

/** 弥散光：背景里几团又大又淡的色晕，慢慢漂。纯装饰，对读屏隐藏 */
export function Aura({ tone }: { tone?: 'error' | 'pass' }) {
  return (
    <div className={`aura${tone ? ` ${tone}` : ''}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </div>
  )
}
