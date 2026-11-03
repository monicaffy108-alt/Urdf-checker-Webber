import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { CHAR_W, CHIP_H, CHIP_W, R, layoutHand } from '../core/handLayout'
import type { MapData, MapNode, NodeState } from '../core/structure'
import { cx } from './common'

/** 结构图上选中的东西：问题列表据此只显示和它有关的问题 */
export interface Focus {
  id: string
  names: string[]
  label: string
}

export const NODE_STATE_TEXT: Record<NodeState, string> = {
  ok: '正常',
  warning: '有警告',
  error: '有错误',
  missing: '缺失',
  optional: '可选 · 未使用',
}

const STATE_ORDER: NodeState[] = ['ok', 'warning', 'error', 'missing', 'optional']
const CARD_W = 272

/** 图例和卡片里用的小圆点，和图上的节点同一套样式（实心 / 空心 / 虚线） */
export function StateDot({ state }: { state: NodeState }) {
  return <i className={`dot ${state}`} aria-hidden="true" />
}

interface FigProps {
  nodes: MapNode[]
  /** 装饰用：所有节点画成灰色空心，不响应鼠标 */
  neutral?: boolean
  /** 当前选中的节点下标 */
  selected?: number | null
  hovered?: number | null
  onHover?: (i: number | null) => void
  onPick?: (i: number) => void
}

export function HandFigure({ nodes, neutral, selected = null, hovered = null, onHover, onPick }: FigProps) {
  const L = useMemo(() => layoutHand(nodes), [nodes])
  const interactive = !!onPick && !neutral

  const a11y = (i: number) => {
    if (!interactive) return {}
    const n = nodes[i]
    const names = `link ${n.entry.link}${n.entry.joint ? `，joint ${n.entry.joint}` : ''}`
    return {
      role: 'button' as const,
      tabIndex: 0,
      'aria-label': `${n.entry.part}，${NODE_STATE_TEXT[n.state]}。${names}`,
      'aria-pressed': selected === i,
      onClick: () => onPick(i),
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onPick(i)
        }
      },
      onMouseEnter: () => onHover?.(i),
      onMouseLeave: () => onHover?.(null),
      onFocus: () => onHover?.(i),
      onBlur: () => onHover?.(null),
    }
  }

  const { x, y, w, h } = L.box
  return (
    <svg className={cx('hand-svg', neutral && 'neutral')} viewBox={`${x} ${y} ${w} ${h}`} role={neutral ? undefined : 'group'} aria-label={neutral ? undefined : '灵巧手命名结构图'} aria-hidden={neutral ? true : undefined}>
      {L.palm && <rect className="hm-palm" x={L.palm.x} y={L.palm.y} width={L.palm.w} height={L.palm.h} rx={24} />}
      <g className="hm-lines">
        {L.lines.map(([x1, y1, x2, y2], k) => (
          <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </g>
      {L.titles.map((t, k) => (
        <text key={k} className="hm-title" x={t.x} y={t.y} textAnchor={t.anchor}>
          {t.text}
        </text>
      ))}
      {L.items.map((it) => {
        const n = nodes[it.i]
        const state = neutral ? 'idle' : n.state
        const sel = selected === it.i
        const hov = hovered === it.i
        const cls = cx('hm-node', state, sel && 'sel', hov && 'hov', interactive && 'act')
        if (it.kind === 'chip') {
          return (
            <g key={it.i} className={cls} transform={`translate(${it.x} ${it.y})`} {...a11y(it.i)}>
              {(sel || hov) && <rect className="hm-halo" x={-4} y={-4} width={CHIP_W + 8} height={CHIP_H + 8} rx={19} />}
              <rect className="hm-chip" width={CHIP_W} height={CHIP_H} rx={15} />
              <circle className="hm-ring" cx={18} cy={CHIP_H / 2} r={6} />
              <text className="hm-chip-label" x={34} y={CHIP_H / 2 + 4}>
                {it.label}
              </text>
            </g>
          )
        }
        return (
          <g key={it.i} className={cls} transform={`translate(${it.x} ${it.y})`} {...a11y(it.i)}>
            {(sel || hov) && <circle className="hm-halo" r={R + 8} />}
            <circle className="hm-hit" r={R + 10} />
            <circle className="hm-pulse" r={R} />
            <circle className="hm-ring" r={R - 4} />
            <text className="hm-label" x={it.side === 'right' ? R + 10 : -(R + 10)} y={4} textAnchor={it.side === 'right' ? 'start' : 'end'}>
              {it.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

interface MapProps {
  map: MapData
  focus: Focus | null
  onFocus: (f: Focus | null) => void
  /** 选中节点后，和它有关的问题有几条；卡片里的按钮用 */
  relatedCount?: number
  /** 点卡片里的按钮：滚动到问题列表 */
  onJump?: () => void
}

export function HandMap({ map, focus, onFocus, relatedCount = 0, onJump }: MapProps) {
  const [hover, setHover] = useState<number | null>(null)
  const L = useMemo(() => layoutHand(map.nodes), [map.nodes])
  const stageRef = useRef<HTMLDivElement>(null)
  const figRef = useRef<HTMLDivElement>(null)
  // 窗口窄、图放不下时要左右滑动才能看全，没有提示的话用户不会知道右边还有手指
  const [scrolls, setScrolls] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const el = figRef.current
    if (!el) return
    const check = () => {
      setScrolls(el.scrollWidth > el.clientWidth + 1)
      setTick((t) => t + 1) // 尺寸变了，浮出的卡片要重新对位
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [map])

  const selected = focus?.id.startsWith('node:') ? Number(focus.id.slice(5)) : null
  const shownIdx = hover ?? selected
  const shown = shownIdx !== null ? map.nodes[shownIdx] : null

  // 卡片的位置：节点在 SVG 里的坐标 → 屏幕上相对舞台的像素。SVG 按“等比缩放、居中”放进盒子里
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  useLayoutEffect(() => {
    const it = shownIdx === null ? undefined : L.items.find((i) => i.i === shownIdx)
    const svg = figRef.current?.querySelector('svg')
    const stage = stageRef.current
    if (!it || !svg || !stage) {
      setPos(null)
      return
    }
    const r = svg.getBoundingClientRect()
    const s = stage.getBoundingClientRect()
    const k = Math.min(r.width / L.box.w, r.height / L.box.h)
    const cx0 = it.kind === 'chip' ? it.x + CHIP_W / 2 : it.x
    const cy0 = it.kind === 'chip' ? it.y + CHIP_H / 2 : it.y
    const px = r.left - s.left + (r.width - L.box.w * k) / 2 + (cx0 - L.box.x) * k
    const py = r.top - s.top + (r.height - L.box.h * k) / 2 + (cy0 - L.box.y) * k
    // 卡片放在没有标签的那一侧：手指的标签在右边，卡片就放左边；放不下再放右边，并且越过标签
    const gap = 14
    const lab = it.kind === 'dot' ? (R + 10 + it.label.length * CHAR_W + 6) * k : 0
    const clear = (it.kind === 'chip' ? CHIP_W / 2 : R + 6) * k
    const cw = Math.min(CARD_W, s.width)
    const onRight = it.kind === 'chip' ? px + clear + gap : it.side === 'right' ? px + lab + gap : px + clear + gap
    const onLeft = it.kind === 'chip' ? px - clear - gap - cw : it.side === 'right' ? px - clear - gap - cw : px - lab - gap - cw
    const prefer = it.kind === 'dot' && it.side === 'right' ? onLeft : onRight
    const other = prefer === onLeft ? onRight : onLeft
    const fits = (x0: number) => x0 >= 0 && x0 + cw <= s.width
    const x0 = fits(prefer) ? prefer : fits(other) ? other : prefer
    setPos({ x: Math.max(0, Math.min(s.width - cw, x0)), y: Math.max(96, Math.min(s.height - 96, py)) })
  }, [shownIdx, L, tick])

  const pick = (i: number) => {
    const n = map.nodes[i]
    onFocus(focus?.id === `node:${i}` ? null : { id: `node:${i}`, names: n.names, label: n.entry.joint ?? n.entry.link })
  }

  return (
    <div className="hm">
      <div className="hm-stage" ref={stageRef}>
        <div className="hm-fig" ref={figRef}>
          <HandFigure nodes={map.nodes} selected={selected} hovered={hover} onHover={setHover} onPick={pick} />
        </div>
        {shown && pos && (
          <div className={cx('hm-card', shownIdx === selected && 'pinned')} style={{ left: pos.x, top: pos.y }} aria-hidden={shownIdx === selected ? undefined : true}>
            <div className="hc-head">
              <StateDot state={shown.state} />
              <b>{shown.entry.part || shown.entry.link}</b>
              <span>{NODE_STATE_TEXT[shown.state]}</span>
            </div>
            <dl className="hc-names">
              <dt>LINK</dt>
              <dd>
                <code>{shown.entry.link}</code>
              </dd>
              <dt>JOINT</dt>
              <dd>{shown.entry.joint ? <code>{shown.entry.joint}</code> : <span>无（固定件）</span>}</dd>
            </dl>
            <p>{shown.detail}</p>
            {shownIdx === selected && onJump && (
              <button type="button" className="btn sm" onClick={onJump}>
                {relatedCount > 0 ? `查看 ${relatedCount} 个相关问题 ↓` : '没有相关问题'}
              </button>
            )}
          </div>
        )}
      </div>
      {scrolls && <p className="hm-scroll-hint">← 图比窗口宽，左右滑动可以看到完整的结构图 →</p>}

      {L.others.length > 0 && (
        <div className="hm-others">
          <span className="hm-other-title">图上没有位置的分组</span>
          {L.others.flatMap((g) =>
            g.idxs.map((i) => {
              const n = map.nodes[i]
              return (
                <button key={i} type="button" className={cx('mchip', n.state, selected === i && 'sel')} aria-pressed={selected === i} onClick={() => pick(i)} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <StateDot state={n.state} />
                  <code>{n.entry.joint ?? n.entry.link}</code>
                </button>
              )
            }),
          )}
        </div>
      )}

      <ul className="legend-row" aria-label="图例">
        {STATE_ORDER.filter((s) => map.counts[s] > 0).map((s) => (
          <li key={s}>
            <StateDot state={s} />
            <span>{NODE_STATE_TEXT[s]}</span>
            <b>{map.counts[s]}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 文件里有、命名标准里没有的名字（比如写错的 Index_DIP）。放在问题区，点一下就只看它的问题 */
export function ExtraNames({ map, focus, onFocus }: Pick<MapProps, 'map' | 'focus' | 'onFocus'>) {
  if (map.extra.length === 0) return null
  return (
    <div className="extra">
      <span className="eyebrow">文件里有、标准里没有的名字 · {map.extra.length}</span>
      <div className="extra-list">
        {map.extra.map((x) => {
          const id = `extra:${x.kind}:${x.name}`
          return (
            <button key={id} type="button" className={cx('xchip', focus?.id === id && 'sel')} aria-pressed={focus?.id === id} onClick={() => onFocus(focus?.id === id ? null : { id, names: [x.name], label: `${x.kind} ${x.name}` })}>
              <span className="xk">{x.kind}</span>
              <code>{x.name}</code>
            </button>
          )
        })}
      </div>
    </div>
  )
}
