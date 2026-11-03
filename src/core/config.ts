export type RuleLevel = 'error' | 'warning'

export interface NamingEntry {
  group: string
  part: string
  link: string
  /** 标准里没有 joint 的（固定件）写 null */
  joint: string | null
  /** true：文件里没有它也不算缺失（比如固定的手掌 / 腕部，不同机型取其一） */
  optional?: boolean
}

export interface Bound {
  min?: number
  max?: number
}

export interface SignRule {
  enabled: boolean
  /** 匹配 joint 名的正则 */
  joint: string
  lower?: Bound
  upper?: Bound
  level: RuleLevel
  note?: string
}

export interface AxisRule {
  enabled: boolean
  /** 匹配 joint 名的正则，按顺序取第一条命中的 */
  joint: string
  axis: [number, number, number]
  /** any：正反方向都算对；exact：必须同向 */
  sign: 'any' | 'exact'
  level: RuleLevel
  note?: string
}

export interface Config {
  naming: { entries: NamingEntry[]; allowExtra: string[] }
  limit: { radianMax: number; placeholders: [number, number][]; signRules: SignRule[] }
  axis: { rules: AxisRule[] }
  mesh: { extensions: string[] }
}

const FINGERS: [string, string][] = [
  ['食指', 'index'],
  ['中指', 'middle'],
  ['无名指', 'ring'],
  ['小指', 'pinky'],
]

function defaultEntries(): NamingEntry[] {
  const e = (group: string, part: string, link: string, joint: string | null): NamingEntry =>
    joint === null ? { group, part, link, joint, optional: true } : { group, part, link, joint }
  const palm = '手掌/手腕部分'
  const out: NamingEntry[] = [
    e(palm, '手掌（固定）', 'hand_base_link', null),
    e(palm, '手掌（活动）', 'hand_link', 'hand_joint'),
    e(palm, '腕部（固定）', 'wrist_base_link', null),
    e(palm, '腕部关节横滚', 'wrist_carpal_link1', 'wrist_roll'),
    e(palm, '腕部关节偏航', 'wrist_carpal_link2', 'wrist_yaw'),
    e(palm, '腕部关节俯仰', 'wrist_carpal_link0', 'wrist_pitch'),
    e('拇指部分', '拇指掌指关节横滚', 'thumb_metacarpals_base1', 'thumb_cmc_roll'),
    e('拇指部分', '拇指掌指关节偏航', 'thumb_metacarpals_base2', 'thumb_cmc_yaw'),
    e('拇指部分', '拇指掌指关节俯仰', 'thumb_metacarpals', 'thumb_cmc_pitch'),
    e('拇指部分', '拇指掌指关节', 'thumb_proximal', 'thumb_mcp'),
    e('拇指部分', '拇指指尖关节', 'thumb_distal', 'thumb_ip'),
  ]
  for (const [zh, f] of FINGERS) {
    const g = `${zh}部分`
    out.push(
      e(g, `${zh}掌指关节横滚`, `${f}_metacarpals`, `${f}_mcp_roll`),
      e(g, `${zh}掌指关节俯仰`, `${f}_proximal`, `${f}_mcp_pitch`),
      e(g, `${zh}近端指尖关节`, `${f}_middle`, `${f}_pip`),
      e(g, `${zh}远端指尖关节`, `${f}_distal`, `${f}_dip`),
    )
  }
  return out
}

export function defaultConfig(): Config {
  return {
    naming: { entries: defaultEntries(), allowExtra: [] },
    limit: {
      radianMax: 6.3,
      placeholders: [
        [-3.14159, 3.14159],
        [-6.28318, 6.28318],
      ],
      signRules: [
        {
          enabled: false,
          joint: '_(mcp_pitch|pip|dip|ip)$',
          lower: { min: 0 },
          upper: { min: 0 },
          level: 'warning',
          note: '示例（默认关闭）：弯曲类关节 lower、upper 都不能为负',
        },
      ],
    },
    axis: {
      rules: [
        { enabled: false, joint: '_roll$', axis: [1, 0, 0], sign: 'any', level: 'warning', note: '示例（默认关闭）：roll 绕 X 轴' },
        { enabled: false, joint: '_pitch$', axis: [0, 1, 0], sign: 'any', level: 'warning', note: '示例（默认关闭）：pitch 绕 Y 轴' },
        { enabled: false, joint: '_yaw$', axis: [0, 0, 1], sign: 'any', level: 'warning', note: '示例（默认关闭）：yaw 绕 Z 轴' },
      ],
    },
    mesh: { extensions: ['stl', 'dae', 'obj', 'ply', 'glb', 'gltf', 'fbx', '3ds'] },
  }
}

/** 标准表每条一行，方便在编辑框里看和改 */
export function formatConfig(c: Config): string {
  const rows = c.naming.entries.map((e) => '      ' + JSON.stringify(e)).join(',\n')
  const shell = { ...c, naming: { ...c.naming, entries: ['__ENTRIES__'] } }
  return JSON.stringify(shell, null, 2).replace(/\[\s*"__ENTRIES__"\s*\]/, () => `[\n${rows}\n    ]`)
}

// ---------- 校验 ----------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function bad(path: string, want: string): never {
  throw new Error(`${path} 应该是${want}`)
}
function list(v: unknown, path: string): unknown[] {
  return Array.isArray(v) ? v : bad(path, '数组')
}
function str(v: unknown, path: string): string {
  return typeof v === 'string' ? v : bad(path, '字符串')
}
function num(v: unknown, path: string): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : bad(path, '数字')
}
function regex(v: unknown, path: string): string {
  const s = str(v, path)
  try {
    new RegExp(s)
  } catch {
    bad(path, `合法的正则表达式（现在是 ${s}）`)
  }
  return s
}
function level(v: unknown, path: string): RuleLevel {
  return v === 'error' || v === 'warning' ? v : bad(path, '"error" 或 "warning"')
}
function bound(v: unknown, path: string): Bound | undefined {
  if (v === undefined) return undefined
  if (!isObj(v)) return bad(path, '对象，例如 {"min": 0}')
  const b: Bound = {}
  if (v.min !== undefined) b.min = num(v.min, `${path}.min`)
  if (v.max !== undefined) b.max = num(v.max, `${path}.max`)
  return b
}

export function normalizeConfig(raw: unknown): Config {
  const d = defaultConfig()
  if (!isObj(raw)) return bad('配置', ' JSON 对象')
  const naming: Record<string, unknown> = isObj(raw.naming) ? raw.naming : {}
  const limit: Record<string, unknown> = isObj(raw.limit) ? raw.limit : {}
  const axis: Record<string, unknown> = isObj(raw.axis) ? raw.axis : {}
  const mesh: Record<string, unknown> = isObj(raw.mesh) ? raw.mesh : {}

  const entries =
    naming.entries === undefined
      ? d.naming.entries
      : list(naming.entries, 'naming.entries').map((v, i): NamingEntry => {
          const p = `naming.entries[${i}]`
          if (!isObj(v)) return bad(p, '对象')
          const joint = v.joint === null ? null : str(v.joint, `${p}.joint`)
          const entry: NamingEntry = { group: str(v.group, `${p}.group`), part: str(v.part ?? '', `${p}.part`), link: str(v.link, `${p}.link`), joint }
          if (v.optional === true) entry.optional = true
          return entry
        })

  return {
    naming: {
      entries,
      allowExtra: naming.allowExtra === undefined ? [] : list(naming.allowExtra, 'naming.allowExtra').map((v, i) => regex(v, `naming.allowExtra[${i}]`)),
    },
    limit: {
      radianMax: limit.radianMax === undefined ? d.limit.radianMax : num(limit.radianMax, 'limit.radianMax'),
      placeholders:
        limit.placeholders === undefined
          ? d.limit.placeholders
          : list(limit.placeholders, 'limit.placeholders').map((v, i): [number, number] => {
              const p = `limit.placeholders[${i}]`
              const a = list(v, p)
              return a.length === 2 ? [num(a[0], `${p}[0]`), num(a[1], `${p}[1]`)] : bad(p, '[lower, upper] 两个数字')
            }),
      signRules:
        limit.signRules === undefined
          ? d.limit.signRules
          : list(limit.signRules, 'limit.signRules').map((v, i): SignRule => {
              const p = `limit.signRules[${i}]`
              if (!isObj(v)) return bad(p, '对象')
              return {
                enabled: v.enabled !== false,
                joint: regex(v.joint, `${p}.joint`),
                lower: bound(v.lower, `${p}.lower`),
                upper: bound(v.upper, `${p}.upper`),
                level: v.level === undefined ? 'warning' : level(v.level, `${p}.level`),
                note: v.note === undefined ? undefined : str(v.note, `${p}.note`),
              }
            }),
    },
    axis: {
      rules:
        axis.rules === undefined
          ? d.axis.rules
          : list(axis.rules, 'axis.rules').map((v, i): AxisRule => {
              const p = `axis.rules[${i}]`
              if (!isObj(v)) return bad(p, '对象')
              const a = list(v.axis, `${p}.axis`)
              if (a.length !== 3) return bad(`${p}.axis`, '[x, y, z] 三个数字')
              const vec: [number, number, number] = [num(a[0], `${p}.axis[0]`), num(a[1], `${p}.axis[1]`), num(a[2], `${p}.axis[2]`)]
              if (Math.hypot(...vec) < 1e-9) return bad(`${p}.axis`, '非零向量')
              if (v.sign !== undefined && v.sign !== 'any' && v.sign !== 'exact') return bad(`${p}.sign`, '"any" 或 "exact"')
              return {
                enabled: v.enabled !== false,
                joint: regex(v.joint, `${p}.joint`),
                axis: vec,
                sign: v.sign === 'exact' ? 'exact' : 'any',
                level: v.level === undefined ? 'warning' : level(v.level, `${p}.level`),
                note: v.note === undefined ? undefined : str(v.note, `${p}.note`),
              }
            }),
    },
    mesh: {
      extensions: mesh.extensions === undefined ? d.mesh.extensions : list(mesh.extensions, 'mesh.extensions').map((v, i) => str(v, `mesh.extensions[${i}]`)),
    },
  }
}

export type ParsedConfig = { config: Config; error?: undefined } | { config?: undefined; error: string }

export function parseConfig(text: string): ParsedConfig {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { error: `JSON 格式不对：${e instanceof Error ? e.message : String(e)}` }
  }
  try {
    return { config: normalizeConfig(raw) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
