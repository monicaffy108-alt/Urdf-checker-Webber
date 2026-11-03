import { Download, FolderOpen, SlidersHorizontal } from 'lucide-react'
import type { Analysis } from '../core/run'
import { FilePicker } from './FilePicker'

interface Props {
  busy: boolean
  items: { path: string; analysis: Analysis }[]
  current: string | null
  sourceLabel: string | null
  onSelect: (path: string) => void
  onFolder: () => void
  onFiles: () => void
  onDemo: () => void
  onConfig: () => void
  onExport: () => void
}

/**
 * 顶部玻璃栏。落地页上只有品牌和“规则”，因为中间的大按钮已经是入口，不重复；
 * 有结果之后才出现文件下拉、换文件夹、导出。
 */
export function Header({ busy, items, current, sourceLabel, onSelect, onFolder, onFiles, onDemo, onConfig, onExport }: Props) {
  const has = items.length > 0
  return (
    <header className="top">
      <div className="wrap">
        <div className="top-in">
          <div className="brand">
            <b>LinkerBot</b>
            <span>灵心巧手 · URDF 检查</span>
          </div>
          <div className="top-actions">
            {has && <FilePicker items={items} current={current} sourceLabel={sourceLabel} busy={busy} onSelect={onSelect} onFiles={onFiles} onDemo={onDemo} />}
            {has && (
              <button type="button" className="btn ghost sm ico" onClick={onFolder} disabled={busy} aria-label="选择文件夹" title="选择文件夹">
                <FolderOpen size={16} aria-hidden="true" />
                <span className="hide-sm">选择文件夹</span>
              </button>
            )}
            <button type="button" className="btn ghost sm ico" onClick={onConfig} aria-label="规则配置" title="规则配置">
              <SlidersHorizontal size={16} aria-hidden="true" />
              <span className="hide-sm">规则</span>
            </button>
            {has && (
              <button type="button" className="btn solid sm ico" onClick={onExport} aria-label="导出报告" title="导出报告">
                <Download size={16} aria-hidden="true" />
                <span className="hide-sm">导出报告</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
