import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Analysis } from '../core/run'
import { countLevels, verdict } from '../core/summary'
import { baseName, dirName } from './common'

interface Props {
  items: { path: string; analysis: Analysis }[]
  current: string | null
  sourceLabel: string | null
  busy: boolean
  onSelect: (path: string) => void
  onFiles: () => void
  onDemo: () => void
}

/** 文件切换下拉。键盘：打开后 ↑↓ 移动、Enter 选择、Esc 关闭。菜单底部还有“选择文件…”和“加载示例” */
export function FilePicker({ items, current, sourceLabel, busy, onSelect, onFiles, onDemo }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const cur = items.findIndex((i) => i.path === current)
  const [cursor, setCursor] = useState(Math.max(0, cur))

  useEffect(() => {
    if (!open) return
    setCursor(Math.max(0, cur))
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, cur])

  useEffect(() => {
    if (open) list.current?.querySelectorAll<HTMLElement>('[role=option]')[cursor]?.focus()
  }, [open, cursor])

  const toButton = () => root.current?.querySelector<HTMLElement>('.picker-btn')?.focus()
  const pick = (path: string) => {
    onSelect(path)
    setOpen(false)
    toButton()
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
      toButton()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(items.length - 1, c + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(0, c - 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setCursor(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setCursor(items.length - 1)
    }
  }

  const active = items[cur] ?? items[0]
  // 所有文件都在同一个目录时，每行重复写目录只是噪音
  const showDir = new Set(items.map((i) => dirName(i.path))).size > 1
  return (
    <div className="picker" ref={root}>
      <button type="button" className="picker-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)} title={active?.path}>
        <span className={`dot ${active ? verdict(active.analysis).kind : ''}`} aria-hidden="true" />
        <span>{active ? baseName(active.path) : '选择文件'}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="menu" onKeyDown={onKey}>
          <div role="listbox" aria-label="URDF 文件" ref={list}>
            {items.map(({ path, analysis }, i) => {
              const v = verdict(analysis)
              const c = countLevels(analysis)
              const sub = c.error ? `${c.error} 个错误` : c.warning ? `${c.warning} 个警告` : v.kind === 'pass' ? '全部通过' : '有未完成的检查'
              return (
                <button key={path} type="button" role="option" aria-selected={path === current} tabIndex={i === cursor ? 0 : -1} className="menu-item" onClick={() => pick(path)}>
                  <span className={`dot ${v.kind}`} aria-hidden="true" />
                  <span className="nm" title={path}>
                    {baseName(path)}
                    {showDir && dirName(path) && <span className="sub"> · {dirName(path)}</span>}
                  </span>
                  <span className="sub">{sub}</span>
                </button>
              )
            })}
          </div>
          <div className="menu-foot">
            <span>
              {sourceLabel && <>来源 {sourceLabel} · </>}共 {items.length} 个
            </span>
            <span className="menu-acts">
              <button
                type="button"
                className="link"
                disabled={busy}
                onClick={() => {
                  setOpen(false)
                  onFiles()
                }}
              >
                选择文件…
              </button>
              <button
                type="button"
                className="link"
                disabled={busy}
                onClick={() => {
                  setOpen(false)
                  onDemo()
                }}
              >
                加载示例
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
