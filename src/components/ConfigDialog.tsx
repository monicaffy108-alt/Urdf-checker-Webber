import { Download, RotateCcw, Upload, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { defaultConfig, formatConfig, parseConfig, type Config } from '../core/config'
import { download } from '../io/download'
import { useDialog } from './useDialog'

interface Props {
  config: Config
  onApply: (c: Config) => void
  onClose: () => void
}

export function ConfigDialog({ config, onApply, onClose }: Props) {
  const [text, setText] = useState(() => formatConfig(config))
  const parsed = useMemo(() => parseConfig(text), [text])
  const fileRef = useRef<HTMLInputElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const modalRef = useRef<HTMLDivElement>(null)
  useDialog(modalRef, onClose, areaRef)

  const importFile = async (f: File | undefined) => {
    if (f) setText(await f.text())
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="cfg-title">
        <header>
          <h2 id="cfg-title">规则配置</h2>
          <button type="button" className="btn icon ghost" onClick={onClose} aria-label="关闭">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="modal-body">
          <ul className="cfg-help">
            <li>
              <code>naming.entries</code>：命名标准表，一行一个部件。<code>joint</code> 写 <code>null</code> 表示没有 joint；<code>optional</code> 为 true 表示文件里没有也不算缺失。
            </li>
            <li>
              <code>naming.allowExtra</code>：额外允许的名字（正则），比如某个机型特有的 link。
            </li>
            <li>
              <code>limit.signRules</code>：按 joint 名（正则）规定 lower / upper 的取值范围。<code>axis.rules</code>：按 joint 名规定期望的转轴方向。
            </li>
            <li>
              示例规则默认是关闭的（<code>"enabled": false</code>），改成 true 才生效。没有启用 <code>limit.signRules</code> / <code>axis.rules</code> 时，第 4、5 项只检查格式类问题，显示“待配置”，不会显示“通过”。
            </li>
          </ul>
          <textarea ref={areaRef} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label="规则配置 JSON" aria-invalid={!!parsed.error} />
          {parsed.error ? (
            <p className="cfg-msg bad" role="alert">
              {parsed.error}
            </p>
          ) : (
            <p className="cfg-msg ok">配置有效</p>
          )}
        </div>
        <footer>
          <div className="left">
            <button type="button" className="btn" onClick={() => setText(formatConfig(defaultConfig()))}>
              <RotateCcw size={15} aria-hidden="true" />
              恢复默认
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              <Upload size={15} aria-hidden="true" />
              导入 JSON
            </button>
            <button type="button" className="btn" disabled={!!parsed.error} onClick={() => download('urdf-check-rules.json', text, 'application/json')}>
              <Download size={15} aria-hidden="true" />
              导出 JSON
            </button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => importFile(e.target.files?.[0])} />
          </div>
          <div className="right">
            <button type="button" className="btn" onClick={onClose}>
              取消
            </button>
            <button type="button" className="btn solid" disabled={!!parsed.error} onClick={() => parsed.config && onApply(parsed.config)}>
              应用并保存
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
