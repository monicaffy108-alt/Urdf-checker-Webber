import { useEffect, useRef, useState } from 'react'
import type { Analysis } from '../core/run'
import { headline, watermarkSize } from '../core/summary'
import type { MapData } from '../core/structure'
import { HandMap, type Focus } from './HandMap'
import { Aura } from './common'

interface Props {
  analysis: Analysis
  path: string
  map: MapData | null
  focus: Focus | null
  onFocus: (f: Focus | null) => void
  relatedCount: number
  onJump: () => void
}

/**
 * 结果页首屏：一整块圆角的灰色舞台。左上是淡淡的大水印（机器人名字），下面是一句结论和模型的三个基本数字，
 * 右边是占主角的手形图。整屏只有一个视觉重点，就是那个大数字。
 */
export function Stage({ analysis, path, map, focus, onFocus, relatedCount, onJump }: Props) {
  const h = headline(analysis)
  const name = analysis.robot ?? path.slice(path.lastIndexOf('/') + 1).replace(/\.urdf$/i, '')
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(1100)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setW(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const s = analysis.stats
  // 三张小卡片放模型本身的数字，不重复大标题里的错误数
  const facts = s
    ? [
        { n: s.links, label: 'link' },
        { n: s.joints, label: 'joint' },
        { n: s.meshes, label: 'mesh 引用' },
      ]
    : []
  return (
    <section className="stage" aria-label="检查结果">
      <Aura tone={h.kind === 'error' ? 'error' : h.kind === 'pass' ? 'pass' : undefined} />
      <div className="wrap stage-wrap" ref={box}>
        <div className="watermark" aria-hidden="true" style={{ fontSize: w < 700 ? watermarkSize(name, w, 72, 22) : watermarkSize(name, w * 0.62, 96, 48) }}>
          {name}
        </div>
        <div className="stage-in">
          <div className="say" aria-live="polite">
            <div>
              <span className="eyebrow">检查结果</span>
              <h1 className="big">{h.big}</h1>
              <p className="sub">{h.sub}</p>
            </div>
            <div>
              <code className="path">{path}</code>
              {facts.length > 0 && (
                <dl className="facts">
                  {facts.map((f) => (
                    <div key={f.label} className="fact">
                      <dd>
                        <b>{f.n}</b>
                      </dd>
                      <dt>{f.label}</dt>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </div>
          <div className="stage-art">
            {map ? <HandMap map={map} focus={focus} onFocus={onFocus} relatedCount={relatedCount} onJump={onJump} /> : <p className="stage-empty">XML 解析失败，没有名字可画。先修好格式问题，再看结构图。</p>}
          </div>
        </div>
      </div>
    </section>
  )
}
