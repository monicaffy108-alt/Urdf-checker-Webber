import { FileText, FlaskConical, FolderOpen } from 'lucide-react'
import { useMemo } from 'react'
import { defaultConfig } from '../core/config'
import { neutralNodes } from '../core/structure'
import { CHECKS } from '../core/types'
import { HandFigure } from './HandMap'
import { Aura } from './common'

interface Props {
  busy: boolean
  onFolder: () => void
  onFiles: () => void
  onDemo: () => void
}

export function Welcome({ busy, onFolder, onFiles, onDemo }: Props) {
  // 直接双击打开（file://）时，浏览器不允许读取拖进来的文件夹，只能用按钮选
  const local = location.protocol === 'file:'
  const nodes = useMemo(() => neutralNodes(defaultConfig().naming.entries), [])
  return (
    <main className="landing">
      <Aura />
      <div className="wrap">
        <section className="hero">
          <div>
            <span className="eyebrow">LinkerBot · 灵心巧手</span>
            <h1>
              <span className="nb">选中文件夹，</span>
              <span className="nb">6 项检查即刻出结果。</span>
            </h1>
            <p className="lead">格式、父子关系、命名、limit、转轴、mesh 文件。每个问题都标出行号和改法，命名对照灵巧手的统一标准，结果直接画在右边的结构图上。</p>
            <div className="hero-actions">
              <button type="button" className="btn solid lg" onClick={onFolder} disabled={busy}>
                <FolderOpen size={18} aria-hidden="true" />
                选择文件夹
              </button>
              <button type="button" className="btn lg" onClick={onFiles} disabled={busy}>
                <FileText size={18} aria-hidden="true" />
                选择 URDF 文件
              </button>
              <button type="button" className="btn lg" onClick={onDemo} disabled={busy}>
                <FlaskConical size={18} aria-hidden="true" />
                加载示例
              </button>
            </div>
            <p className="hero-note">
              {local
                ? '现在是直接双击打开的页面，浏览器不允许拖放文件夹（拖单个 .urdf 可以），请点“选择文件夹”。想用拖放：在项目目录运行 npm run preview，再打开它给出的网址。'
                : '也可以把文件夹直接拖到页面上。'}{' '}
              所有文件只在你的浏览器里处理，不会上传。选文件夹时 Chrome / Edge 会弹出“上传”确认，那只是授权本页读取这些文件。
            </p>
          </div>
          <div className="hero-art" aria-hidden="true">
            <HandFigure nodes={nodes} neutral />
          </div>
        </section>

        <section className="checks-intro">
          <span className="eyebrow">6 项检查</span>
          <h2>基础检查四项，运动学参数两项。</h2>
        </section>
        <ol className="six">
          {CHECKS.map((c) => (
            <li key={c.id}>
              <span className="n">0{c.no}</span>
              <h3>{c.title}</h3>
              <p>{c.desc}</p>
            </li>
          ))}
        </ol>
        <p className="foot">LinkerBot 灵心巧手 · URDF 检查工具</p>
      </div>
    </main>
  )
}
