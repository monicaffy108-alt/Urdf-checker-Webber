import { useEffect, useMemo, useRef } from 'react'
import { highlightXml } from '../core/highlight'
import type { Level } from '../core/types'

const MAX_LINES = 2500
const WINDOW = 600

interface Props {
  path: string
  text: string
  /** 当前选中的问题所在的行 */
  line: number | null
  /** 有问题的行 → 这一行里最严重的级别 */
  marks: ReadonlyMap<number, Level>
}

export function SourceView({ path, text, line, marks }: Props) {
  const lines = useMemo(() => highlightXml(text), [text])
  const box = useRef<HTMLDivElement>(null)

  // 文件特别长时只渲染选中行附近，避免页面卡住
  const [from, to] = useMemo(() => {
    if (lines.length <= MAX_LINES) return [0, lines.length]
    const start = Math.max(0, Math.min(lines.length - WINDOW, (line ?? 1) - 1 - WINDOW / 2))
    return [start, start + WINDOW]
  }, [lines.length, line])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const row = el.querySelector<HTMLElement>('[data-hl]')
    el.scrollTop = row ? Math.max(0, row.offsetTop - el.clientHeight / 2 + row.offsetHeight / 2) : 0
  }, [path, line, from])

  const bad = [...marks.values()].filter((l) => l === 'error').length
  const warn = [...marks.values()].filter((l) => l === 'warning').length

  return (
    <div className="source" aria-label="URDF 源码">
      <div className="source-head">
        <code className="src-name">{path}</code>
        <span className="spacer" />
        {bad > 0 && (
          <span className="mk">
            <i className="dot error" aria-hidden="true" />
            {bad} 行有错误
          </span>
        )}
        {warn > 0 && (
          <span className="mk">
            <i className="dot warning" aria-hidden="true" />
            {warn} 行有警告
          </span>
        )}
        <span>共 {lines.length} 行</span>
      </div>
      {to - from < lines.length && (
        <div className="source-note">
          文件较长，只显示第 {from + 1}–{to} 行
        </div>
      )}
      <div className="code" ref={box} tabIndex={0}>
        {lines.slice(from, to).map((toks, i) => {
          const n = from + i + 1
          const hl = n === line
          const mark = marks.get(n)
          return (
            <div key={n} className={['row', mark && `m-${mark}`, hl && 'hl'].filter(Boolean).join(' ')} {...(hl ? { 'data-hl': '1' } : {})}>
              <span className="n">{n}</span>
              <span className="t">
                {toks.length === 0
                  ? ' '
                  : toks.map((k, j) =>
                      k.t === 'txt' ? (
                        k.s
                      ) : (
                        <span key={j} className={`t-${k.t}`}>
                          {k.s}
                        </span>
                      ),
                    )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
