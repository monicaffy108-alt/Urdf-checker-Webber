import type { MapNode } from './structure'

// 手部结构图的几何布局。纯函数，不依赖 React，方便单元测试。
// 坐标是 SVG 用户单位：四根手指各占一列竖着往上排，拇指从手掌左下斜着往左上排，手掌 / 手腕画成底部的一块。

export const R = 12 // 节点圆的半径
export const CHIP_W = 156
export const CHIP_H = 30
export const CHAR_W = 7.2 // 12px 等宽字体的字宽（0.6em），估算标签占多宽用

const CENTER = 450
const FINGER_X = [CENTER - 150, CENTER - 50, CENTER + 50, CENTER + 150]
const FINGER_Y0 = [312, 300, 312, 324] // 每根手指最下面那个节点的 y：中指最高、小指最低，看起来才像一只手
const STEP = 62
const PALM_TOP = 372
const CHIP_GAP = 10
const PALM_PAD = 16
const PALM_W = CHIP_W * 2 + CHIP_GAP + PALM_PAD * 2
const PALM_X = CENTER - PALM_W / 2
const THUMB_STEP: [number, number] = [-30, -46]

export interface Dot {
  kind: 'dot'
  /** 在 nodes 里的下标 */
  i: number
  x: number
  y: number
  label: string
  /** 标签在节点的哪一侧：手指放右边、拇指放左边，都不会被连线穿过 */
  side: 'right' | 'left'
}
export interface Chip {
  kind: 'chip'
  i: number
  x: number
  y: number
  label: string
}
export type Item = Dot | Chip

export interface Title {
  x: number
  y: number
  text: string
  anchor: 'middle' | 'start'
}

export interface Layout {
  items: Item[]
  lines: [number, number, number, number][]
  titles: Title[]
  palm: { x: number; y: number; w: number; h: number } | null
  /** 认不出是哪个部位的分组（比如用户在配置里自己加的），图上画不出来，页面另外列出 */
  others: { group: string; idxs: number[] }[]
  box: { x: number; y: number; w: number; h: number }
}

type Slot = { kind: 'palm' } | { kind: 'thumb' } | { kind: 'finger'; col: number } | { kind: 'other' }

/** 按分组名认部位。中英文都认，所以配置里把分组名改成英文也能画 */
export function slotOf(group: string): Slot {
  const g = group.toLowerCase()
  if (/拇指|thumb/.test(g)) return { kind: 'thumb' }
  if (/食指|index/.test(g)) return { kind: 'finger', col: 0 }
  if (/无名指|ring/.test(g)) return { kind: 'finger', col: 2 }
  if (/中指|middle/.test(g)) return { kind: 'finger', col: 1 }
  if (/小指|pinky|little/.test(g)) return { kind: 'finger', col: 3 }
  if (/手掌|手腕|palm|wrist|hand/.test(g)) return { kind: 'palm' }
  return { kind: 'other' }
}

function commonPrefix(names: string[]): string {
  if (names.length < 2) return ''
  let p = names[0]
  for (const n of names) while (!n.startsWith(p)) p = p.slice(0, -1)
  const cut = p.lastIndexOf('_')
  return cut > 0 ? p.slice(0, cut + 1) : ''
}

/** 同一个部位里的名字都以 index_ / thumb_ 开头，图上只写后面的部分，省地方 */
function shortNames(nodes: MapNode[], idxs: number[]): string[] {
  const raw = idxs.map((i) => nodes[i].entry.joint ?? nodes[i].entry.link)
  const p = commonPrefix(raw)
  return raw.map((r) => (p && r.length > p.length ? r.slice(p.length) : r))
}

export function layoutHand(nodes: MapNode[]): Layout {
  const groups = new Map<string, number[]>()
  nodes.forEach((n, i) => {
    const a = groups.get(n.entry.group)
    if (a) a.push(i)
    else groups.set(n.entry.group, [i])
  })

  const taken = new Set<string>()
  const others: Layout['others'] = []
  let palm: { idxs: number[]; title: string } | null = null
  let thumb: { idxs: number[]; title: string } | null = null
  const fingers: { col: number; idxs: number[]; title: string }[] = []

  for (const [group, idxs] of groups) {
    const slot = slotOf(group)
    const key = slot.kind === 'finger' ? `finger${slot.col}` : slot.kind
    if (slot.kind === 'other' || taken.has(key)) {
      others.push({ group, idxs })
      continue
    }
    taken.add(key)
    const title = group.replace(/部分$/, '')
    if (slot.kind === 'palm') palm = { idxs, title }
    else if (slot.kind === 'thumb') thumb = { idxs, title }
    else fingers.push({ col: slot.col, idxs, title })
  }

  const items: Item[] = []
  const lines: Layout['lines'] = []
  const titles: Title[] = []
  let palmRect: Layout['palm'] = null

  if (palm) {
    const rows = Math.ceil(palm.idxs.length / 2)
    const h = 34 + rows * CHIP_H + (rows - 1) * CHIP_GAP + PALM_PAD
    palmRect = { x: PALM_X, y: PALM_TOP, w: PALM_W, h }
    titles.push({ x: PALM_X + PALM_PAD, y: PALM_TOP + 22, text: palm.title, anchor: 'start' })
    palm.idxs.forEach((i, k) => {
      const e = nodes[i].entry
      items.push({
        kind: 'chip',
        i,
        x: PALM_X + PALM_PAD + (k % 2) * (CHIP_W + CHIP_GAP),
        y: PALM_TOP + 34 + Math.floor(k / 2) * (CHIP_H + CHIP_GAP),
        label: e.joint ?? e.link,
      })
    })
  }

  for (const f of fingers) {
    const names = shortNames(nodes, f.idxs)
    const x = FINGER_X[f.col]
    f.idxs.forEach((i, k) => {
      const y = FINGER_Y0[f.col] - k * STEP
      items.push({ kind: 'dot', i, x, y, label: names[k], side: 'right' })
      if (k > 0) lines.push([x, y + STEP, x, y])
    })
    if (palmRect) lines.push([x, FINGER_Y0[f.col], x, PALM_TOP])
    titles.push({ x, y: FINGER_Y0[f.col] - (f.idxs.length - 1) * STEP - R - 14, text: f.title, anchor: 'middle' })
  }

  if (thumb) {
    const names = shortNames(nodes, thumb.idxs)
    const bx = PALM_X - 24
    const by = PALM_TOP + 56
    thumb.idxs.forEach((i, k) => {
      const x = bx + k * THUMB_STEP[0]
      const y = by + k * THUMB_STEP[1]
      items.push({ kind: 'dot', i, x, y, label: names[k], side: 'left' })
      if (k > 0) lines.push([x - THUMB_STEP[0], y - THUMB_STEP[1], x, y])
    })
    if (palmRect) lines.push([bx, by, PALM_X, by])
    const n = thumb.idxs.length - 1
    titles.push({ x: bx + n * THUMB_STEP[0], y: by + n * THUMB_STEP[1] - R - 14, text: thumb.title, anchor: 'middle' })
  }

  // 外框：把所有东西（含标签文字）都圈进去，再留一圈边
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  const grow = (ax: number, ay: number, bx: number, by: number) => {
    x0 = Math.min(x0, ax)
    y0 = Math.min(y0, ay)
    x1 = Math.max(x1, bx)
    y1 = Math.max(y1, by)
  }
  for (const it of items) {
    if (it.kind === 'chip') {
      grow(it.x, it.y, it.x + CHIP_W, it.y + CHIP_H)
    } else {
      const lw = it.label.length * CHAR_W
      if (it.side === 'right') grow(it.x - R - 4, it.y - R - 4, it.x + R + 8 + lw, it.y + R + 4)
      else grow(it.x - R - 8 - lw, it.y - R - 4, it.x + R + 4, it.y + R + 4)
    }
  }
  for (const t of titles) {
    const w = t.text.length * 13
    if (t.anchor === 'middle') grow(t.x - w / 2, t.y - 14, t.x + w / 2, t.y + 4)
    else grow(t.x, t.y - 14, t.x + w, t.y + 4)
  }
  if (palmRect) grow(palmRect.x, palmRect.y, palmRect.x + palmRect.w, palmRect.y + palmRect.h)
  const PAD = 14
  const box = items.length || palmRect ? { x: x0 - PAD, y: y0 - PAD, w: x1 - x0 + PAD * 2, h: y1 - y0 + PAD * 2 } : { x: 0, y: 0, w: 100, h: 60 }
  return { items, lines, titles, palm: palmRect, others, box }
}
