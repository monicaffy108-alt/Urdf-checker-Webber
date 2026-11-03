import type { XNode } from './xml'

export const JOINT_TYPES = ['revolute', 'continuous', 'prismatic', 'fixed', 'floating', 'planar']
export const SHAPES = ['box', 'cylinder', 'sphere', 'mesh']

export interface UrdfGeometry {
  owner: string
  role: 'visual' | 'collision'
  line: number
  node: XNode
  /** box / cylinder / sphere / mesh；没有 <geometry> 或里面没有形状时为 null */
  shape: string | null
  filename?: string
  filenameLine?: number
}

export interface UrdfLink {
  name: string | null
  line: number
  node: XNode
  geometries: UrdfGeometry[]
}

export interface UrdfJoint {
  name: string | null
  type: string | null
  line: number
  node: XNode
  parentEl: XNode | null
  childEl: XNode | null
  /** <parent link="…"> 的值；标签或属性缺失时为 null */
  parent: string | null
  child: string | null
  axisEl: XNode | null
  limitEl: XNode | null
}

export interface UrdfModel {
  name: string | null
  line: number
  node: XNode
  links: UrdfLink[]
  joints: UrdfJoint[]
}

export const kids = (n: XNode, tag: string): XNode[] => n.children.filter((c) => c.tag === tag)
export const kid = (n: XNode, tag: string): XNode | null => n.children.find((c) => c.tag === tag) ?? null

export function parseNum(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const t = raw.trim()
  if (t === '') return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

export function parseVec(raw: string | undefined, n: number): number[] | null {
  if (raw === undefined) return null
  const parts = raw.trim().split(/\s+/)
  if (parts.length !== n || parts.some((p) => p === '')) return null
  const nums = parts.map(Number)
  return nums.every(Number.isFinite) ? nums : null
}

/** 沿着父节点往上找到所属的 link / joint，用于给问题标注位置 */
export function ownerOf(node: XNode): string | undefined {
  for (let n: XNode | null = node; n; n = n.parent) {
    if (n.tag === 'link' || n.tag === 'joint') return `${n.tag} ${n.attrs.name ?? '(未命名)'}`
  }
  return undefined
}

export function buildModel(root: XNode): UrdfModel {
  const links: UrdfLink[] = kids(root, 'link').map((el) => {
    const name = el.attrs.name ?? null
    const geometries: UrdfGeometry[] = []
    for (const role of ['visual', 'collision'] as const) {
      for (const g of kids(el, role)) {
        const shapeEl = kid(g, 'geometry')?.children.find((c) => SHAPES.includes(c.tag)) ?? null
        geometries.push({
          owner: name ?? '(未命名)',
          role,
          line: g.line,
          node: g,
          shape: shapeEl?.tag ?? null,
          filename: shapeEl?.tag === 'mesh' ? shapeEl.attrs.filename : undefined,
          filenameLine: shapeEl?.line,
        })
      }
    }
    return { name, line: el.line, node: el, geometries }
  })

  const joints: UrdfJoint[] = kids(root, 'joint').map((el) => {
    const parentEl = kid(el, 'parent')
    const childEl = kid(el, 'child')
    return {
      name: el.attrs.name ?? null,
      type: el.attrs.type ?? null,
      line: el.line,
      node: el,
      parentEl,
      childEl,
      parent: parentEl?.attrs.link ?? null,
      child: childEl?.attrs.link ?? null,
      axisEl: kid(el, 'axis'),
      limitEl: kid(el, 'limit'),
    }
  })

  return { name: root.attrs.name ?? null, line: root.line, node: root, links, joints }
}
