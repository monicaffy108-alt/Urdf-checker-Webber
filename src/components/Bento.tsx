import { CHECKS, type CheckId, type CheckResult } from '../core/types'
import { worstCheck } from '../core/summary'
import { StatusDot, cx } from './common'

interface Props {
  results: CheckResult[]
  filter: CheckId | 'all'
  onFilter: (f: CheckId | 'all') => void
}

/**
 * 便当格：6 项检查是 6 个大小不一的圆角块，问题最重的一块做成近黑色，打破单调。
 * 每块最大的字是问题数，不是装饰。点一下只看这一项的问题，再点取消。
 */
export function Bento({ results, filter, onFilter }: Props) {
  const worst = worstCheck(results)
  return (
    <div className="bento" role="group" aria-label="6 项检查">
      {CHECKS.map((m) => {
        const r = results.find((x) => x.id === m.id)
        if (!r) return null
        const n = r.issues.filter((i) => i.level !== 'info').length
        const on = filter === m.id
        return (
          <button key={m.id} type="button" aria-pressed={on} className={cx('tile', `t-${m.no}`, m.id === worst && 'dark')} onClick={() => onFilter(on ? 'all' : m.id)}>
            <span className="row">
              <span className="no">0{m.no}</span>
              <StatusDot status={r.status} />
            </span>
            <h3>{m.title}</h3>
            <span className="tile-foot">
              {n > 0 ? (
                <span className="num">
                  {n}
                  <small>个问题</small>
                </span>
              ) : null}
              <span className="sum">{r.summary}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
