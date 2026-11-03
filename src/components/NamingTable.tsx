import type { NamingEntry } from '../core/config'
import { cx } from './common'

interface Props {
  entries: NamingEntry[]
  names: { links: string[]; joints: string[] }
}

function Chip({ name, ok, optional }: { name: string; ok: boolean; optional?: boolean }) {
  const kind = ok ? 'ok' : optional ? 'optional' : 'missing'
  return (
    <code className={cx('chip', ok ? 'ok' : optional ? 'opt' : 'miss')}>
      <i className={`dot ${kind}`} aria-hidden="true" />
      {name}
      <span className="sr-only">{ok ? '（有）' : optional ? '（可选，没有）' : '（缺失）'}</span>
    </code>
  )
}

/** 命名标准对照表：和结构图是同一份信息的表格版本 */
export function NamingTable({ entries, names }: Props) {
  const links = new Set(names.links)
  const joints = new Set(names.joints)
  const groups: [string, NamingEntry[]][] = []
  for (const e of entries) {
    const g = groups.find(([name]) => name === e.group)
    if (g) g[1].push(e)
    else groups.push([e.group, [e]])
  }
  return (
    <div className="naming" aria-label="命名标准对照">
      <p className="naming-note">标准里的每个名字，文件里有没有。实心圆点是有；红色虚线圈是没有（缺失，或者被写成了别的名字）；灰色虚线圈是可选，没有也不算错。</p>
      <div className="ngrid">
        {groups.map(([group, es]) => (
          <div key={group} className="ngroup">
            <h4>{group}</h4>
            <table>
              <thead>
                <tr>
                  <th>部件</th>
                  <th>LINK</th>
                  <th>JOINT</th>
                </tr>
              </thead>
              <tbody>
                {es.map((e, i) => (
                  <tr key={`${e.link}:${i}`}>
                    <td>{e.part}</td>
                    <td>
                      <Chip name={e.link} ok={links.has(e.link)} optional={e.optional} />
                    </td>
                    <td>{e.joint ? <Chip name={e.joint} ok={joints.has(e.joint)} optional={e.optional} /> : <span className="chip opt">无</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}
