import { X } from 'lucide-react'
import { useRef, type KeyboardEvent } from 'react'
import type { Config } from '../core/config'
import type { Analysis } from '../core/run'
import type { Level } from '../core/types'
import { NamingTable } from './NamingTable'
import { SourceView } from './SourceView'
import { useDialog } from './useDialog'

export type DrawerTab = 'source' | 'table'

const TABS: { id: DrawerTab; label: string }[] = [
  { id: 'source', label: '源码' },
  { id: 'table', label: '对照表' },
]

interface Props {
  tab: DrawerTab
  onTab: (t: DrawerTab) => void
  onClose: () => void
  analysis: Analysis
  path: string
  config: Config
  line: number | null
  marks: ReadonlyMap<number, Level>
}

/** 右侧滑出的玻璃抽屉：源码和命名对照表都放在这里，不再常驻页面。Esc 或点遮罩关闭，键盘焦点锁在抽屉里 */
export function Drawer({ tab, onTab, onClose, analysis, path, config, line, marks }: Props) {
  const root = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  useDialog(root, onClose, closeRef)
  const names = analysis.names
  const enabled = (t: DrawerTab) => t === 'source' || !!names

  const onTabKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const usable = TABS.filter((t) => enabled(t.id))
    const at = usable.findIndex((t) => t.id === tab)
    const next = usable[(at + (e.key === 'ArrowRight' ? 1 : usable.length - 1)) % usable.length]
    e.preventDefault()
    onTab(next.id)
    document.getElementById(`dtab-${next.id}`)?.focus()
  }

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <aside ref={root} className="drawer" role="dialog" aria-modal="true" aria-label="源码与对照表">
        <div className="drawer-head">
          <div className="drawer-tabs" role="tablist" aria-label="查看方式" onKeyDown={onTabKey}>
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`dtab-${id}`}
                aria-selected={tab === id}
                aria-controls="drawer-panel"
                aria-disabled={!enabled(id)}
                tabIndex={tab === id ? 0 : -1}
                className="drawer-tab"
                onClick={() => enabled(id) && onTab(id)}
                title={enabled(id) ? undefined : 'XML 解析失败，没有名字可显示'}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="grow" />
          <button ref={closeRef} type="button" className="btn icon ghost" onClick={onClose} aria-label="关闭">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className={tab === 'table' ? 'drawer-body pad' : 'drawer-body'} role="tabpanel" id="drawer-panel" aria-labelledby={`dtab-${tab}`}>
          {tab === 'source' && <SourceView path={path} text={analysis.text} line={line} marks={marks} />}
          {tab === 'table' && names && <NamingTable entries={config.naming.entries} names={names} />}
        </div>
      </aside>
    </>
  )
}
