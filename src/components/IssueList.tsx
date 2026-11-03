import { Crosshair, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { focusMatches } from '../core/structure'
import { CHECKS, type CheckId, type CheckResult } from '../core/types'
import type { Focus } from './HandMap'
import { LEVEL_TEXT } from './common'

const FOLD = 3

interface Props {
  results: CheckResult[]
  filter: CheckId | 'all'
  activeKey: string | null
  onPick: (key: string, line: number | null) => void
  focus: Focus | null
  onClearFocus: () => void
}

/**
 * 问题列表：没有卡片、没有边框，只有细分隔线。每一项默认只显示前 3 条，其余折叠，
 * 因为首屏要留白。一旦筛选（点了便当格或结构图），就全部展开，用户已经表明想看这一部分。
 */
export function IssueList({ results, filter, activeKey, onPick, focus, onClearFocus }: Props) {
  const [open, setOpen] = useState<Set<CheckId>>(() => new Set())
  const filtered = filter !== 'all' || focus !== null

  // 换文件或换筛选时，之前手动展开的状态不再有意义
  useEffect(() => {
    setOpen(new Set())
  }, [results])

  const groups = CHECKS.filter((m) => filter === 'all' || m.id === filter).flatMap((m) => {
    const r = results.find((x) => x.id === m.id)
    if (!r) return []
    // key 用问题在原数组里的下标，筛选之后也不变，源码视图和高亮才对得上
    const rows = r.issues.map((issue, n) => ({ issue, key: `${r.id}:${n}` })).filter(({ issue }) => !focus || focusMatches(issue, focus.names))
    return focus && rows.length === 0 ? [] : [{ m, r, rows }]
  })

  return (
    <div aria-label="问题列表">
      {focus && (
        <div className="focusbar">
          <Crosshair size={16} aria-hidden="true" />
          <span>只看</span>
          <code>{focus.label}</code>
          <button type="button" className="btn sm" onClick={onClearFocus}>
            <X size={14} aria-hidden="true" />
            清除筛选
          </button>
        </div>
      )}
      {focus && groups.length === 0 && <p className="isum">没有发现和 {focus.label} 有关的问题。</p>}
      {groups.map(({ m, r, rows }) => {
        const expanded = filtered || open.has(m.id)
        const shown = expanded ? rows : rows.slice(0, FOLD)
        const hidden = rows.length - shown.length
        return (
          <section key={m.id} className="issue-group">
            <h3>
              <span className="no">0{m.no}</span>
              {m.title}
            </h3>
            <p className="isum">{r.summary}</p>
            {shown.length > 0 && (
              <ul className="issues">
                {shown.map(({ issue: i, key }) => (
                  <li key={key}>
                    <button type="button" className={`issue ${i.level}${activeKey === key ? ' active' : ''}`} onClick={() => onPick(key, i.line ?? null)}>
                      <i className={`dot ${i.level}`} aria-hidden="true" />
                      <span className="body">
                        <span className="sr-only">{LEVEL_TEXT[i.level]}：</span>
                        {i.target && <code className="target">{i.target}</code>}
                        <span className="msg">{i.message}</span>
                        {i.hint && <span className="hint">{i.hint}</span>}
                      </span>
                      {i.line !== undefined && <span className="ln">第 {i.line} 行</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {hidden > 0 && (
              <button type="button" className="btn sm more" onClick={() => setOpen((s) => new Set(s).add(m.id))}>
                再显示 {hidden} 条
              </button>
            )}
          </section>
        )
      })}
    </div>
  )
}
