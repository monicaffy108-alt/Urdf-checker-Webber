/** 用户提供的一个文件。path 是相对所选文件夹的路径，统一用 / 分隔 */
export interface SourceFile {
  path: string
  size: number
  file?: Blob
  text?: string
}

export type Level = 'error' | 'warning' | 'info'
export type CheckId = 'syntax' | 'reference' | 'naming' | 'limit' | 'axis' | 'mesh'
/** partial：没发现问题，但检查所依赖的规则还没配置，不能算真正通过 */
export type CheckStatus = 'pass' | 'warning' | 'error' | 'skipped' | 'partial'

export interface Issue {
  check: CheckId
  level: Level
  message: string
  /** 例如 "joint index_pip" */
  target?: string
  /** URDF 里的行号（从 1 开始） */
  line?: number
  hint?: string
}

export interface CheckResult {
  id: CheckId
  status: CheckStatus
  issues: Issue[]
  summary: string
}

export interface CheckMeta {
  id: CheckId
  no: number
  title: string
  group: 'basic' | 'kinematic'
  desc: string
}

export const CHECKS: CheckMeta[] = [
  { id: 'syntax', no: 1, title: '格式完整性', group: 'basic', desc: 'XML 语法、robot / link / joint 必填项、重名' },
  { id: 'reference', no: 2, title: 'parent / child', group: 'basic', desc: 'joint 的父子 link 能否读到、是否存在、能否构成一棵树' },
  { id: 'naming', no: 3, title: '命名规范', group: 'basic', desc: 'link / joint 名称对照灵巧手统一命名标准' },
  { id: 'limit', no: 4, title: 'limit 上下限', group: 'basic', desc: 'lower / upper 的大小顺序、正负、是否还是默认值' },
  { id: 'axis', no: 5, title: 'axis 转轴', group: 'kinematic', desc: '转轴是否缺省、零向量、方向是否正确' },
  { id: 'mesh', no: 6, title: 'mesh 文件', group: 'kinematic', desc: 'visual / collision 引用的文件能否找到' },
]

export function finish(id: CheckId, issues: Issue[], summary: string): CheckResult {
  const status: CheckStatus = issues.some((i) => i.level === 'error')
    ? 'error'
    : issues.some((i) => i.level === 'warning')
      ? 'warning'
      : 'pass'
  return { id, status, issues, summary }
}

export function skipped(id: CheckId, reason: string): CheckResult {
  return { id, status: 'skipped', issues: [], summary: reason }
}
