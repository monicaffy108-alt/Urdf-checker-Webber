import type { Config, NamingEntry } from './config'
import type { Analysis } from './run'
import type { Issue, Level } from './types'

/** 结构图里一个节点（命名标准里的一行：一个 link，可能再加一个 joint）的状态 */
export type NodeState = 'ok' | 'warning' | 'error' | 'missing' | 'optional'

export interface MapNode {
  entry: NamingEntry
  state: NodeState
  /** 一句话说明这个节点现在怎么了，结构图旁边的读数栏直接显示 */
  detail: string
  errors: number
  warnings: number
  /** 点这个节点时，用来筛选问题的名字：它的 joint 名和 link 名 */
  names: string[]
}

export interface ExtraName {
  kind: 'link' | 'joint'
  name: string
}

export interface MapData {
  /** 和 config.naming.entries 一一对应、顺序相同 */
  nodes: MapNode[]
  /** 文件里有、标准里没有的名字（allowExtra 放行的不算） */
  extra: ExtraName[]
  counts: Record<NodeState, number>
}

/** 欢迎页的装饰图用：只有名字、没有任何检查结果的节点 */
export function neutralNodes(entries: NamingEntry[]): MapNode[] {
  return entries.map((entry) => ({ entry, state: 'ok', detail: '', errors: 0, warnings: 0, names: [entry.joint, entry.link].filter((n): n is string => !!n) }))
}

/** issue.target 形如 "joint index_pip" 或 "link index_distal · visual"，只取前半 */
export const targetKey = (t?: string): string => (t ? t.split(' · ')[0] : '')

export function buildMapData(a: Analysis, cfg: Config): MapData | null {
  if (!a.names) return null
  const links = new Set(a.names.links)
  const joints = new Set(a.names.joints)

  // 每个 link / joint 名下各有几个错误、几个警告（提示不算）
  const tally = new Map<string, { errors: number; warnings: number }>()
  for (const r of a.results) {
    for (const i of r.issues) {
      const k = targetKey(i.target)
      if (!k || i.level === 'info') continue
      const c = tally.get(k) ?? { errors: 0, warnings: 0 }
      if (i.level === 'error') c.errors++
      else c.warnings++
      tally.set(k, c)
    }
  }

  const counts: Record<NodeState, number> = { ok: 0, warning: 0, error: 0, missing: 0, optional: 0 }
  const nodes = cfg.naming.entries.map((entry): MapNode => {
    const hasLink = links.has(entry.link)
    const hasJoint = entry.joint ? joints.has(entry.joint) : false
    const lc = tally.get(`link ${entry.link}`)
    const jc = entry.joint ? tally.get(`joint ${entry.joint}`) : undefined
    const errors = (lc?.errors ?? 0) + (jc?.errors ?? 0)
    const warnings = (lc?.warnings ?? 0) + (jc?.warnings ?? 0)
    const names = [entry.joint, entry.link].filter((n): n is string => !!n)

    let state: NodeState
    let detail: string
    if (!hasLink && !hasJoint) {
      if (entry.optional) {
        state = 'optional'
        detail = '可选的固定件：文件里没有也不算错'
      } else {
        state = 'missing'
        detail = entry.joint ? `link ${entry.link} 和 joint ${entry.joint} 都不在文件里` : `link ${entry.link} 不在文件里`
      }
    } else if (!hasLink || (entry.joint && !hasJoint)) {
      state = 'error'
      detail = !hasLink ? `joint ${entry.joint} 在，但 link ${entry.link} 不在文件里（可能写成了别的名字）` : `link ${entry.link} 在，但 joint ${entry.joint} 不在文件里（可能写成了别的名字）`
    } else if (errors) {
      state = 'error'
      detail = `有 ${errors} 个错误${warnings ? `、${warnings} 个警告` : ''}，点击查看`
    } else if (warnings) {
      state = 'warning'
      detail = `有 ${warnings} 个警告，点击查看`
    } else {
      state = 'ok'
      detail = '名字符合标准，当前启用的检查没有发现问题'
    }
    counts[state]++
    return { entry, state, detail, errors, warnings, names }
  })

  const stdLinks = new Set(cfg.naming.entries.map((e) => e.link))
  const stdJoints = new Set(cfg.naming.entries.flatMap((e) => (e.joint ? [e.joint] : [])))
  const allow = cfg.naming.allowExtra.map((s) => new RegExp(s))
  const isExtra = (n: string, std: Set<string>) => !std.has(n) && !allow.some((re) => re.test(n))
  const extra: ExtraName[] = [
    ...[...new Set(a.names.links)].filter((n) => isExtra(n, stdLinks)).map((name): ExtraName => ({ kind: 'link', name })),
    ...[...new Set(a.names.joints)].filter((n) => isExtra(n, stdJoints)).map((name): ExtraName => ({ kind: 'joint', name })),
  ]
  return { nodes, extra, counts }
}

const isWord = (c: string | undefined) => c !== undefined && /[A-Za-z0-9_]/.test(c)

/** text 里是否出现了整词 name（前后不能紧挨着字母数字下划线），thumb_metacarpals 不会匹配到 thumb_metacarpals_base1 */
export function mentions(text: string, name: string): boolean {
  for (let from = 0; ; ) {
    const at = text.indexOf(name, from)
    if (at < 0) return false
    if (!isWord(text[at - 1]) && !isWord(text[at + name.length])) return true
    from = at + 1
  }
}

/**
 * 这条问题和这几个名字有关吗：target 就是其中一个，或者正文 / 建议里整词提到了它。
 * “提到”也要算：节点的 joint 名写错时，说明问题的那条是挂在写错的名字（Index_DIP）上的，标准名（index_dip）只出现在建议里。
 */
export function focusMatches(i: Issue, names: string[]): boolean {
  const k = targetKey(i.target)
  if (k && names.some((n) => k === `joint ${n}` || k === `link ${n}`)) return true
  return names.some((n) => mentions(i.message, n) || (i.hint !== undefined && mentions(i.hint, n)))
}

const RANK: Record<Level, number> = { info: 0, warning: 1, error: 2 }

/** 每一行里最严重的问题级别，源码视图的行号旁边据此标色 */
export function lineMarks(a: Analysis): Map<number, Level> {
  const m = new Map<number, Level>()
  for (const r of a.results) {
    for (const i of r.issues) {
      if (i.line === undefined) continue
      const cur = m.get(i.line)
      if (!cur || RANK[i.level] > RANK[cur]) m.set(i.line, i.level)
    }
  }
  return m
}
