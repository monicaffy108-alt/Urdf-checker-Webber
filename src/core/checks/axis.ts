import type { Config } from '../config'
import { finish, type CheckResult, type Issue } from '../types'
import { parseVec, type UrdfModel } from '../urdf'
import { fmtNum } from '../util'

const AXIS_TYPES = ['revolute', 'continuous', 'prismatic', 'planar']
const fmtVec = (v: number[]) => v.map(fmtNum).join(' ')

/** 检查 5：axis 转轴 —— 缺省、零向量、未归一化，以及按规则判断方向 */
export function checkAxis(model: UrdfModel, cfg: Config): CheckResult {
  const issues: Issue[] = []
  const rules = cfg.axis.rules.filter((r) => r.enabled).map((r) => ({ r, re: new RegExp(r.joint) }))
  let checked = 0

  for (const j of model.joints) {
    if (!j.type || !AXIS_TYPES.includes(j.type)) continue
    checked++
    const target = `joint ${j.name ?? '(未命名)'}`
    const add = (level: Issue['level'], message: string, line: number, hint?: string) =>
      issues.push({ check: 'axis', level, message, target, line, hint })

    let vec = [1, 0, 0] // URDF 里 axis 不写时的默认值
    if (!j.axisEl) {
      add('warning', '没有写 <axis>，会按默认的 1 0 0 处理', j.line, '请显式写出 <axis xyz="…"/>，默认方向多半不是想要的')
    } else {
      const raw = j.axisEl.attrs.xyz
      const line = j.axisEl.line
      if (raw === undefined) {
        add('error', '<axis> 没有 xyz 属性', line)
        continue
      }
      const v = parseVec(raw, 3)
      if (!v) {
        add('error', `<axis> 的 xyz 应是 3 个数字，这里是 "${raw}"`, line)
        continue
      }
      const len = Math.hypot(...v)
      if (len < 1e-9) {
        add('error', '转轴是零向量 0 0 0，关节没有转动方向', line)
        continue
      }
      if (Math.abs(len - 1) > 1e-3) add('warning', `转轴没有归一化（长度 ${fmtNum(len)}）：${fmtVec(v)}`, line, '写成单位向量，例如 0 1 0')
      vec = v.map((x) => x / len)
    }

    const hit = j.name ? rules.find(({ re }) => re.test(j.name!)) : undefined
    if (hit) {
      const { r } = hit
      const len = Math.hypot(...r.axis)
      const dot = (vec[0] * r.axis[0] + vec[1] * r.axis[1] + vec[2] * r.axis[2]) / len
      const ok = r.sign === 'exact' ? dot > 1 - 1e-3 : Math.abs(dot) > 1 - 1e-3
      if (!ok) {
        add(r.level, `转轴方向和规则不符：实际 ${fmtVec(vec)}，应为 ${r.sign === 'any' ? '±' : ''}${fmtVec(r.axis)}`, j.axisEl?.line ?? j.line, r.note)
      }
    }
  }

  const n = issues.length
  if (!rules.length) {
    issues.push({
      check: 'axis',
      level: 'info',
      message: '还没有启用 axis 方向规则，现在只检查了缺省 / 零向量 / 未归一化',
      hint: '方向对不对需要判定依据：在“规则配置”的 axis.rules 里按 joint 名写出期望的转轴',
    })
  }
  const summary = n
    ? `检查了 ${checked} 个关节，发现 ${n} 个问题`
    : rules.length
      ? `检查了 ${checked} 个关节，方向按 ${rules.length} 条规则判定，都符合`
      : `${checked} 个关节的转轴格式正常；方向规则未配置，方向对错尚未验证`
  const result = finish('axis', issues, summary)
  // 方向规则没配置时，“没问题”只代表格式没问题，不能显示成通过
  if (!rules.length && result.status === 'pass') result.status = 'partial'
  return result
}
