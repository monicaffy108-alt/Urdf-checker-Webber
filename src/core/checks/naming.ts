import type { Config, NamingEntry } from '../config'
import { finish, type CheckResult, type Issue } from '../types'
import type { UrdfModel } from '../urdf'
import { suggest } from '../util'

/** 检查 3：link / joint 名字对照统一命名标准 */
export function checkNaming(model: UrdfModel, cfg: Config): CheckResult {
  const issues: Issue[] = []
  const add = (level: Issue['level'], message: string, target?: string, line?: number, hint?: string) =>
    issues.push({ check: 'naming', level, message, target, line, hint })

  const entries = cfg.naming.entries
  const byLink = new Map(entries.map((e) => [e.link, e]))
  const byJoint = new Map<string, NamingEntry>()
  for (const e of entries) if (e.joint) byJoint.set(e.joint, e)
  const extra = cfg.naming.allowExtra.map((s) => new RegExp(s))
  const allowed = (n: string) => extra.some((re) => re.test(n))

  const jointOfChild = new Map<string, string>() // child link → 连着它的 joint 名
  for (const j of model.joints) if (j.child && j.name) jointOfChild.set(j.child, j.name)

  const explained = new Set<string>() // 已经作为“应为 xxx”提示过的标准名，不再重复报缺失
  let unnamed = 0
  let linkHit = 0
  let jointHit = 0
  let wrong = 0
  const noMatch = '标准里没有这个名字；如果是这个机型特有的，请加到配置的 naming.allowExtra 里'

  for (const l of model.links) {
    if (!l.name) {
      unnamed++
      continue
    }
    if (byLink.has(l.name)) {
      linkHit++
      continue
    }
    if (allowed(l.name)) continue
    wrong++
    const jn = jointOfChild.get(l.name)
    const viaJoint = jn ? byJoint.get(jn) : undefined
    const sug = viaJoint?.link ?? suggest(l.name, byLink.keys())
    if (sug) explained.add(sug)
    const hint = sug ? (viaJoint ? `应为 "${sug}"（连着它的 joint ${jn} 在标准里对应 ${sug}）` : `是不是想写 "${sug}"？`) : noMatch
    add('error', `link 名 "${l.name}" 不在命名标准里`, `link ${l.name}`, l.line, hint)
  }

  for (const j of model.joints) {
    if (!j.name) {
      unnamed++
      continue
    }
    if (byJoint.has(j.name)) {
      jointHit++
      continue
    }
    if (allowed(j.name)) continue
    wrong++
    const viaLink = j.child ? byLink.get(j.child) : undefined
    const sug = viaLink?.joint ?? suggest(j.name, byJoint.keys())
    if (sug) explained.add(sug)
    const hint = sug ? (viaLink?.joint ? `应为 "${sug}"（它的 child ${j.child} 在标准里对应 ${sug}）` : `是不是想写 "${sug}"？`) : noMatch
    add('error', `joint 名 "${j.name}" 不在命名标准里`, `joint ${j.name}`, j.line, hint)
  }

  // 两个名字都在标准里，但不是同一行：joint 的 child 不是它那一行的 link
  for (const j of model.joints) {
    const e = j.name ? byJoint.get(j.name) : undefined
    if (!e || !j.child || !byLink.has(j.child) || j.child === e.link) continue
    add('warning', `joint "${j.name}" 的 child 是 "${j.child}"，标准里它对应的 link 是 "${e.link}"`, `joint ${j.name}`, j.childEl?.line ?? j.line, '这里按“joint 的 child 就是同一行的 link”判断')
  }

  const linkSet = new Set(model.links.map((l) => l.name))
  const jointSet = new Set(model.joints.map((j) => j.name))
  const groups = new Map<string, { total: number; missing: string[] }>()
  for (const e of entries) {
    if (e.optional) continue
    const g = groups.get(e.group) ?? { total: 0, missing: [] }
    g.total += e.joint ? 2 : 1
    if (!linkSet.has(e.link) && !explained.has(e.link)) g.missing.push(`link ${e.link}`)
    if (e.joint && !jointSet.has(e.joint) && !explained.has(e.joint)) g.missing.push(`joint ${e.joint}`)
    groups.set(e.group, g)
  }
  let missing = 0
  for (const [group, g] of groups) {
    if (!g.missing.length) continue
    missing += g.missing.length
    const all = g.missing.length === g.total
    add(
      'warning',
      all ? `「${group}」整组都没有：${g.missing.join('、')}` : `「${group}」缺少 ${g.missing.length} 项：${g.missing.join('、')}`,
      undefined,
      undefined,
      all ? '如果这个机型确实没有这部分可以忽略；如果有，说明名字全都不对' : '标准里有、文件里没有。名字写错的话会在上面单独报',
    )
  }
  if (unnamed) add('info', `有 ${unnamed} 个 link / joint 没有 name，已在检查 1 里报告`)

  // 不写 “26/27” 这种分数：标准里有可选的固定件，分母会让人以为少了一个
  const msg =
    `${linkHit} 个 link、${jointHit} 个 joint 的名字符合标准` +
    (wrong ? `；${wrong} 个名字不在标准里` : '') +
    (missing ? `；${missing} 项标准名缺失` : '')
  return finish('naming', issues, msg)
}
