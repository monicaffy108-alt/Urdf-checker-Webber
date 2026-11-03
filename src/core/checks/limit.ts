import type { Bound, Config } from '../config'
import { finish, type CheckResult, type Issue } from '../types'
import { parseNum, type UrdfModel } from '../urdf'
import { fmtNum } from '../util'

const inBound = (v: number, b: Bound) => (b.min === undefined || v >= b.min) && (b.max === undefined || v <= b.max)
const boundText = (b: Bound) =>
  b.min !== undefined && b.max !== undefined ? `在 [${fmtNum(b.min)}, ${fmtNum(b.max)}] 内` : b.min !== undefined ? `≥ ${fmtNum(b.min)}` : `≤ ${fmtNum(b.max ?? 0)}`

/** 检查 4：revolute / prismatic 的 limit —— lower < upper、正负、不能是默认值 */
export function checkLimit(model: UrdfModel, cfg: Config): CheckResult {
  const issues: Issue[] = []
  const rules = cfg.limit.signRules.filter((r) => r.enabled).map((r) => ({ r, re: new RegExp(r.joint) }))
  let checked = 0

  for (const j of model.joints) {
    if (j.type !== 'revolute' && j.type !== 'prismatic') continue
    checked++
    const target = `joint ${j.name ?? '(未命名)'}`
    const add = (level: Issue['level'], message: string, line: number, hint?: string) =>
      issues.push({ check: 'limit', level, message, target, line, hint })

    const el = j.limitEl
    if (!el) {
      add('error', `${j.type} 关节缺少 <limit>`, j.line, 'revolute / prismatic 必须写 <limit lower upper effort velocity>')
      continue
    }

    const keys = ['lower', 'upper'] as const
    const missing = keys.filter((k) => el.attrs[k] === undefined)
    const notNum = keys.filter((k) => el.attrs[k] !== undefined && parseNum(el.attrs[k]) === null)
    for (const k of notNum) add('error', `${k}="${el.attrs[k]}" 不是数字`, el.line)
    if (missing.length === 2) {
      add('error', 'lower / upper 都没有写，是默认值 0 / 0，关节转不动', el.line, '补上 lower="…" upper="…"')
    } else if (missing.length === 1) {
      add('error', `${missing[0]} 没有写，URDF 会按默认值 0 处理`, el.line, `补上 ${missing[0]}="…"`)
    }

    if (!notNum.length && missing.length < 2) {
      const lo = parseNum(el.attrs.lower) ?? 0
      const up = parseNum(el.attrs.upper) ?? 0
      if (lo > up) {
        add('error', `上下限颠倒了：lower=${fmtNum(lo)} 大于 upper=${fmtNum(up)}`, el.line, `对调后是 lower="${fmtNum(up)}" upper="${fmtNum(lo)}"`)
      } else if (lo === up) {
        add('error', `lower 和 upper 都是 ${fmtNum(lo)}，没有活动范围${lo === 0 ? '（0 / 0 是默认值）' : ''}`, el.line)
      } else {
        if (j.type === 'revolute' && cfg.limit.placeholders.some(([a, b]) => Math.abs(lo - a) < 5e-3 && Math.abs(up - b) < 5e-3)) {
          add('warning', `范围是 [${fmtNum(lo)}, ${fmtNum(up)}]，像是导出工具填的占位默认值`, el.line, '请换成关节真实的活动范围')
        }
        if (j.type === 'revolute' && (Math.abs(lo) > cfg.limit.radianMax || Math.abs(up) > cfg.limit.radianMax)) {
          add('warning', `lower / upper 的绝对值超过 ${cfg.limit.radianMax}（约 2π），像是写成了角度（度）`, el.line, 'URDF 里转动关节的单位是弧度')
        }
        if (lo > 0 || up < 0) add('info', `零位（0）不在 [${fmtNum(lo)}, ${fmtNum(up)}] 范围内`, el.line, '有些仿真器会因为初始位置越界而报错')
      }

      const hit = j.name ? rules.find(({ re }) => re.test(j.name!)) : undefined
      if (hit) {
        const msgs: string[] = []
        if (hit.r.lower && !inBound(lo, hit.r.lower)) msgs.push(`lower=${fmtNum(lo)} 应${boundText(hit.r.lower)}`)
        if (hit.r.upper && !inBound(up, hit.r.upper)) msgs.push(`upper=${fmtNum(up)} 应${boundText(hit.r.upper)}`)
        if (msgs.length) add(hit.r.level, `正负不符合规则：${msgs.join('，')}`, el.line, hit.r.note)
      }
    }

    for (const k of ['effort', 'velocity'] as const) {
      const raw = el.attrs[k]
      const n = parseNum(raw)
      if (raw === undefined) add('error', `<limit> 缺少 ${k}（URDF 规定必填）`, el.line)
      else if (n === null) add('error', `${k}="${raw}" 不是数字`, el.line)
      else if (n <= 0) add('warning', `${k}=${fmtNum(n)}，应该大于 0`, el.line)
    }
  }

  const n = issues.filter((i) => i.level !== 'info').length
  if (!rules.length && checked > 0) {
    issues.push({
      check: 'limit',
      level: 'info',
      message: '还没有启用 limit 正负规则，现在只检查了：缺 <limit>、上下限颠倒、0 / 0 默认值、占位值、单位',
      hint: '正负要求需要判定依据：在“规则配置”的 limit.signRules 里按 joint 名写出 lower / upper 应有的取值范围',
    })
  }
  const summary =
    checked === 0
      ? '没有 revolute / prismatic 关节，不需要检查 limit'
      : n
        ? `检查了 ${checked} 个关节，发现 ${n} 个问题`
        : rules.length
          ? `检查了 ${checked} 个关节，按 ${rules.length} 条正负规则判定，上下限都正常`
          : `${checked} 个关节没有发现问题；正负规则未配置，正负是否正确尚未验证`
  const result = finish('limit', issues, summary)
  // 正负规则没配置时，“没问题”只代表别的几项没问题，不能显示成通过
  if (!rules.length && checked > 0 && result.status === 'pass') result.status = 'partial'
  return result
}
