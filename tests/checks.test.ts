import { describe, expect, it } from 'vitest'
import { defaultConfig, formatConfig, normalizeConfig, parseConfig } from '../src/core/config'
import { analyze, type Analysis } from '../src/core/run'
import { verdict } from '../src/core/summary'
import type { CheckId, Issue } from '../src/core/types'
import { buildDemoFiles } from '../src/samples/demo'

const demo = buildDemoFiles()
const files = demo.filter((f) => f.text === undefined)
const urdf = (name: string) => demo.find((f) => f.path.endsWith(`/${name}.urdf`))!

function run(name: string, config = defaultConfig(), withFiles = true): Analysis {
  const f = urdf(name)
  return analyze({ path: f.path, text: f.text!, files: withFiles ? demo : null, config })
}
const issues = (a: Analysis, id: CheckId): Issue[] => a.results.find((r) => r.id === id)!.issues
const status = (a: Analysis, id: CheckId) => a.results.find((r) => r.id === id)!.status
const has = (list: Issue[], re: RegExp, target?: RegExp) => list.some((i) => re.test(i.message) && (!target || (i.target && target.test(i.target))))

describe('合规的示例手', () => {
  const a = run('hand_2_clean')
  it('没有任何错误和警告', () => {
    for (const r of a.results) expect(r.issues.filter((i) => i.level !== 'info'), r.id).toEqual([])
  })
  it('26 个 link、25 个 joint，覆盖标准里除两个可选固定件以外的全部名字', () => {
    // wrist_base_link + 4（腕 3 个 + 活动手掌）+ 5（拇指）+ 16（四指）
    expect(a.stats).toMatchObject({ links: 26, joints: 25, root: 'wrist_base_link' })
    for (const e of defaultConfig().naming.entries) {
      if (e.optional) continue
      expect(a.names!.links, e.link).toContain(e.link)
      if (e.joint) expect(a.names!.joints, e.joint).toContain(e.joint)
    }
    expect(status(a, 'naming')).toBe('pass')
  })
  it('axis 方向规则、limit 正负规则都没配置时，两项都是“待配置”，不是“通过”', () => {
    expect(status(a, 'axis')).toBe('partial')
    expect(status(a, 'limit')).toBe('partial')
    expect(verdict(a).kind).toBe('incomplete')
    expect(verdict(a).text).toMatch(/limit 上下限.*axis 转轴.*没有完整检查/)
  })
  it('只配了一半规则时，结论里只剩没配的那一项', () => {
    const cfg = defaultConfig()
    cfg.limit.signRules.forEach((r) => (r.enabled = true))
    const b = run('hand_2_clean', cfg)
    expect(status(b, 'limit')).toBe('pass')
    expect(status(b, 'axis')).toBe('partial')
    expect(verdict(b).text).toBe('没有发现问题，但「axis 转轴」没有完整检查')
  })
  it('启用全部示例规则之后，示例手全部通过（roll=X, pitch=Y, yaw=Z；弯曲关节 lower / upper ≥ 0）', () => {
    const cfg = defaultConfig()
    cfg.axis.rules.forEach((r) => (r.enabled = true))
    cfg.limit.signRules.forEach((r) => (r.enabled = true))
    const b = run('hand_2_clean', cfg)
    // 示例手里 thumb_cmc_yaw / wrist_yaw 绕 Z、其余 pitch 绕 Y、roll 绕 X
    expect(issues(b, 'axis').filter((i) => i.level !== 'info')).toEqual([])
    expect(issues(b, 'limit').filter((i) => i.level !== 'info')).toEqual([])
    expect(status(b, 'axis')).toBe('pass')
    expect(status(b, 'limit')).toBe('pass')
    expect(verdict(b).kind).toBe('pass')
  })
  it('没有 revolute / prismatic 关节时，limit 没什么可查，直接通过', () => {
    const a2 = analyze({
      path: 'x.urdf',
      text: '<robot name="r"><link name="a"/><link name="b"/><joint name="j" type="fixed"><parent link="a"/><child link="b"/></joint></robot>',
      files: null,
      config: defaultConfig(),
    })
    expect(status(a2, 'limit')).toBe('pass')
  })
  it('没读到 meshes 时检查 6 是“已跳过”，而不是“通过”', () => {
    const b = run('hand_2_clean', defaultConfig(), false)
    expect(status(b, 'mesh')).toBe('skipped')
  })
})

describe('故意埋错的示例手', () => {
  const a = run('hand_1_buggy')

  it('1 格式：joint type 拼错、link 重名', () => {
    const l = issues(a, 'syntax')
    expect(has(l, /type "revolut" 不合法/, /middle_pip/)).toBe(true)
    expect(l.find((i) => /revolut/.test(i.message))!.hint).toContain('revolute')
    expect(has(l, /link 名重复："index_proximal"/)).toBe(true)
  })

  it('2 parent/child：parent 拼错、child 缺失，并给出拼写建议', () => {
    const l = issues(a, 'reference')
    const p = l.find((i) => /parent link "ring_proxmal" 不存在/.test(i.message))!
    expect(p.hint).toContain('ring_proximal')
    expect(has(l, /读不到 <child>/, /ring_dip/)).toBe(true)
  })

  it('3 命名：不在标准里的名字给出应改成什么，缺失的标准名只报一次', () => {
    const l = issues(a, 'naming')
    expect(l.find((i) => /joint 名 "pinky_mcp_roll_joint"/.test(i.message))!.hint).toContain('pinky_mcp_roll')
    expect(l.find((i) => /joint 名 "Index_DIP"/.test(i.message))!.hint).toContain('index_dip')
    expect(l.find((i) => /link 名 "thumb_distal_link"/.test(i.message))!.hint).toContain('thumb_distal')
    // 被报成“写错了”的，不应该再被当作“缺失”报第二遍
    const missing = l.filter((i) => /缺少/.test(i.message)).map((i) => i.message).join('\n')
    expect(missing).not.toContain('pinky_mcp_roll')
    expect(missing).not.toContain('index_dip')
  })

  it('4 limit：颠倒 / 0-0 / 没写 / 单位像角度 / 占位默认值 / 缺 <limit>', () => {
    const l = issues(a, 'limit')
    expect(has(l, /上下限颠倒/, /index_pip/)).toBe(true)
    expect(has(l, /没有活动范围.*默认值/, /middle_dip/)).toBe(true)
    expect(has(l, /lower \/ upper 都没有写/, /ring_mcp_pitch/)).toBe(true)
    expect(has(l, /像是写成了角度/, /pinky_pip/)).toBe(true)
    expect(has(l, /占位默认值/, /thumb_mcp/)).toBe(true)
    expect(has(l, /缺少 <limit>/, /wrist_yaw/)).toBe(true)
    expect(status(a, 'limit')).toBe('error')
  })

  it('5 axis：零向量 / 没写 / 未归一化', () => {
    const l = issues(a, 'axis')
    expect(has(l, /零向量/, /index_mcp_roll/)).toBe(true)
    expect(has(l, /没有写 <axis>/, /middle_mcp_roll/)).toBe(true)
    expect(has(l, /没有归一化/, /ring_mcp_roll/)).toBe(true)
  })

  it('6 mesh：拼写错 / 大小写 / 空文件 / Windows 绝对路径', () => {
    const l = issues(a, 'mesh')
    const miss = l.find((i) => /找不到文件.*index_distl/.test(i.message))!
    expect(miss.hint).toContain('index_distal')
    expect(has(l, /大小写对不上/, /middle_distal/)).toBe(true)
    expect(has(l, /文件是空的/, /ring_distal/)).toBe(true)
    expect(has(l, /反斜杠/, /pinky_distal/)).toBe(true)
  })

  it('每一条问题都带行号，并且行号指向真正出问题的那一行', () => {
    const lines = a.text.split('\n')
    for (const r of a.results) {
      for (const i of r.issues) {
        if (i.target && i.level !== 'info') expect(i.line, `${r.id}: ${i.message}`).toBeGreaterThan(0)
      }
    }
    const rev = issues(a, 'syntax').find((i) => /revolut/.test(i.message))!
    expect(lines[rev.line! - 1]).toContain('middle_pip')
    const lim = issues(a, 'limit').find((i) => /上下限颠倒/.test(i.message))!
    expect(lines[lim.line! - 1]).toContain('lower="1.57"')
  })

  it('结论是“发现错误”', () => {
    expect(verdict(a).kind).toBe('error')
  })
})

describe('XML 解析不了的文件', () => {
  const a = run('hand_3_broken_xml')
  it('检查 1 报语法错误，其余检查跳过', () => {
    expect(status(a, 'syntax')).toBe('error')
    expect(issues(a, 'syntax')[0].line).toBeGreaterThan(0)
    for (const id of ['reference', 'naming', 'limit', 'axis', 'mesh'] as const) expect(status(a, id)).toBe('skipped')
    expect(verdict(a).kind).toBe('error')
  })
})

describe('命名标准', () => {
  it('默认标准和用户给的表一致：27 行，27 个 link、25 个 joint，名字都不重复', () => {
    const e = defaultConfig().naming.entries
    expect(e).toHaveLength(27)
    expect(new Set(e.map((x) => x.link)).size).toBe(27)
    expect(new Set(e.flatMap((x) => (x.joint ? [x.joint] : []))).size).toBe(25)
    expect(e.filter((x) => x.optional).map((x) => x.link)).toEqual(['hand_base_link', 'wrist_base_link'])
  })
  it('link 和 joint 的对应关系照抄原表（注意腕部 link0 对应 pitch、link1 对应 roll、link2 对应 yaw）', () => {
    const pair = Object.fromEntries(defaultConfig().naming.entries.map((x) => [x.link, x.joint]))
    expect(pair).toMatchObject({
      hand_base_link: null,
      hand_link: 'hand_joint',
      wrist_base_link: null,
      wrist_carpal_link1: 'wrist_roll',
      wrist_carpal_link2: 'wrist_yaw',
      wrist_carpal_link0: 'wrist_pitch',
      thumb_metacarpals_base1: 'thumb_cmc_roll',
      thumb_metacarpals_base2: 'thumb_cmc_yaw',
      thumb_metacarpals: 'thumb_cmc_pitch',
      thumb_proximal: 'thumb_mcp',
      thumb_distal: 'thumb_ip',
      index_metacarpals: 'index_mcp_roll',
      index_proximal: 'index_mcp_pitch',
      index_middle: 'index_pip',
      index_distal: 'index_dip',
      pinky_distal: 'pinky_dip',
    })
  })
  it('allowExtra 里的名字不再报“不在标准里”', () => {
    const cfg = defaultConfig()
    const before = issues(run('hand_1_buggy', cfg), 'naming').filter((i) => /pinky_mcp_roll_joint/.test(i.message))
    expect(before).toHaveLength(1)
    cfg.naming.allowExtra = ['^pinky_mcp_roll_joint$']
    const after = issues(run('hand_1_buggy', cfg), 'naming').filter((i) => /pinky_mcp_roll_joint/.test(i.message))
    expect(after).toHaveLength(0)
  })
})

describe('规则配置', () => {
  it('默认配置格式化后再解析，内容不变', () => {
    const p = parseConfig(formatConfig(defaultConfig()))
    expect(p.error).toBeUndefined()
    expect(p.config).toEqual(defaultConfig())
  })
  it('JSON 写错、正则写错、字段类型写错，都给出带路径的中文提示', () => {
    expect(parseConfig('{').error).toContain('JSON 格式不对')
    expect(parseConfig('{"naming":{"allowExtra":["("]}}').error).toContain('naming.allowExtra[0]')
    expect(parseConfig('{"axis":{"rules":[{"joint":"x","axis":[0,0,0]}]}}').error).toContain('非零向量')
    expect(parseConfig('{"limit":{"radianMax":"a"}}').error).toContain('limit.radianMax')
    expect(() => normalizeConfig([])).toThrow()
  })
  it('limit 正负规则生效：弯曲类关节 lower 不能为负', () => {
    const cfg = defaultConfig()
    cfg.limit.signRules[0].enabled = true
    const a = run('hand_1_buggy', cfg)
    // buggy 里 thumb_mcp 被改成了 [-3.14, 3.14]，命中 _mcp 吗？规则是 _(mcp_pitch|pip|dip|ip)$，thumb_mcp 不命中
    const l = issues(a, 'limit').filter((i) => /正负不符合规则/.test(i.message))
    expect(l.length).toBe(0)
    const b = analyze({
      path: 'x.urdf',
      text: '<robot name="r"><link name="a"/><link name="b"/><joint name="index_pip" type="revolute"><parent link="a"/><child link="b"/><axis xyz="0 1 0"/><limit lower="-0.5" upper="1" effort="1" velocity="1"/></joint></robot>',
      files: null,
      config: cfg,
    })
    expect(issues(b, 'limit').some((i) => /lower=-0.5 应≥ 0/.test(i.message))).toBe(true)
  })
  it('axis 方向规则：sign=any 正反都对，sign=exact 必须同向', () => {
    const mk = (axis: string, sign: 'any' | 'exact') => {
      const cfg = defaultConfig()
      cfg.axis.rules = [{ enabled: true, joint: '_pitch$', axis: [0, 1, 0], sign, level: 'error' }]
      return analyze({
        path: 'x.urdf',
        text: `<robot name="r"><link name="a"/><link name="b"/><joint name="x_pitch" type="revolute"><parent link="a"/><child link="b"/><axis xyz="${axis}"/><limit lower="0" upper="1" effort="1" velocity="1"/></joint></robot>`,
        files: null,
        config: cfg,
      })
    }
    expect(issues(mk('0 -1 0', 'any'), 'axis').filter((i) => i.level === 'error')).toHaveLength(0)
    expect(issues(mk('0 -1 0', 'exact'), 'axis').filter((i) => i.level === 'error')).toHaveLength(1)
    expect(issues(mk('1 0 0', 'any'), 'axis').filter((i) => i.level === 'error')).toHaveLength(1)
    expect(status(mk('0 1 0', 'exact'), 'axis')).toBe('pass')
  })
})

describe('parent / child 树结构', () => {
  const robot = (body: string) => analyze({ path: 'x.urdf', text: `<robot name="r">${body}</robot>`, files: null, config: defaultConfig() })
  const L = (...n: string[]) => n.map((x) => `<link name="${x}"/>`).join('')
  const J = (name: string, p: string, c: string) => `<joint name="${name}" type="fixed"><parent link="${p}"/><child link="${c}"/></joint>`

  it('正常的树：没有问题，根是第一个 link', () => {
    const a = robot(L('a', 'b', 'c') + J('j1', 'a', 'b') + J('j2', 'b', 'c'))
    expect(issues(a, 'reference')).toEqual([])
    expect(a.stats!.root).toBe('a')
  })
  it('环：b 有两个父 joint 时也要查得出来（b → c → b）', () => {
    const a = robot(L('a', 'b', 'c') + J('j1', 'a', 'b') + J('j2', 'b', 'c') + J('j3', 'c', 'b'))
    const cyc = issues(a, 'reference').filter((i) => /连成了环/.test(i.message))
    expect(cyc).toHaveLength(1)
    expect(cyc[0].message).toContain('b → c → b')
    expect(cyc[0].target).toBe('joint j3')
  })
  it('整棵树就是一个环（没有根）：只报环，不再额外报“无法到达”', () => {
    const a = robot(L('a', 'b', 'c') + J('j1', 'a', 'b') + J('j2', 'b', 'c') + J('j3', 'c', 'a'))
    const l = issues(a, 'reference')
    expect(l).toHaveLength(1)
    expect(l[0].message).toContain('a → b → c → a')
    expect(a.stats!.root).toBeNull()
  })
  it('一个 link 有两个父 joint', () => {
    const a = robot(L('a', 'b', 'c') + J('j1', 'a', 'c') + J('j2', 'b', 'c'))
    expect(issues(a, 'reference').some((i) => /同时是 2 个 joint 的 child/.test(i.message))).toBe(true)
  })
  it('孤立的 link 和多个根', () => {
    const a = robot(L('a', 'b', 'lonely') + J('j1', 'a', 'b'))
    expect(issues(a, 'reference').some((i) => /"lonely" 是孤立的/.test(i.message))).toBe(true)
    const b = robot(L('a', 'b', 'x', 'y') + J('j1', 'a', 'b') + J('j2', 'x', 'y'))
    expect(issues(b, 'reference').some((i) => /也是一个根/.test(i.message))).toBe(true)
  })
  it('parent 就是 child 自己', () => {
    const a = robot(L('a', 'b') + J('j1', 'a', 'b') + J('j2', 'b', 'b'))
    expect(issues(a, 'reference').some((i) => /同一个 link/.test(i.message))).toBe(true)
  })
  it('<parent> 标签缺失，和 link 属性缺失，分别报告', () => {
    const a = robot(L('a', 'b') + '<joint name="j" type="fixed"><child link="b"/></joint>')
    expect(issues(a, 'reference').some((i) => /读不到 <parent>/.test(i.message))).toBe(true)
    const b = robot(L('a', 'b') + '<joint name="j" type="fixed"><parent/><child link="b"/></joint>')
    expect(issues(b, 'reference').some((i) => /<parent> 缺少 link 属性/.test(i.message))).toBe(true)
  })
})

describe('mesh 路径解析', () => {
  const mk = (filename: string, path = 'pkg/urdf/robot.urdf', fs = files) =>
    analyze({
      path,
      text: `<robot name="r"><link name="a"><visual><geometry><mesh filename="${filename}"/></geometry></visual></link></robot>`,
      files: fs,
      config: defaultConfig(),
    })
  const m = (a: Analysis) => issues(a, 'mesh')
  const f = [
    { path: 'pkg/meshes/a.stl', size: 10 },
    { path: 'pkg/meshes/sub/B.STL', size: 10 },
    { path: 'pkg/urdf/robot.urdf', size: 10, text: '' },
  ]

  it('package://包名/ 在所选文件夹里按包名匹配', () => {
    expect(m(mk('package://pkg/meshes/a.stl', 'pkg/urdf/robot.urdf', f))).toEqual([])
  })
  it('包名和文件夹名不一致：找得到，只给提示（ROS 认 package.xml 里的包名，这里看不到，不能乱报警告）', () => {
    const a = mk('package://other/meshes/a.stl', 'pkg/urdf/robot.urdf', f)
    const l = m(a)
    expect(l).toHaveLength(1)
    expect(l[0].level).toBe('info')
    expect(l[0].message).toContain('other')
    expect(status(a, 'mesh')).toBe('pass')
  })
  it('相对路径 ../meshes/a.stl 相对 URDF 所在目录', () => {
    expect(m(mk('../meshes/a.stl', 'pkg/urdf/robot.urdf', f))).toEqual([])
  })
  it('相对路径退到所选文件夹外面：报错并提示改选上一级', () => {
    const l = m(mk('../../meshes/a.stl', 'robot.urdf', f))
    expect(l[0].level).toBe('error')
    expect(l[0].hint).toContain('上一级')
  })
  it('只有大小写不同：警告而不是通过', () => {
    const l = m(mk('package://pkg/meshes/sub/b.stl', 'pkg/urdf/robot.urdf', f))
    expect(l).toHaveLength(1)
    expect(l[0].level).toBe('warning')
    expect(l[0].message).toContain('大小写')
  })
  it('网址不检查，只给提示', () => {
    const l = m(mk('https://example.com/a.stl', 'pkg/urdf/robot.urdf', f))
    expect(l.map((i) => i.level)).toEqual(['info'])
  })
  it('<mesh> 缺 filename、filename 为空', () => {
    const a = analyze({
      path: 'robot.urdf',
      text: '<robot name="r"><link name="a"><visual><geometry><mesh/></geometry></visual><collision><geometry><mesh filename=""/></geometry></collision></link></robot>',
      files: f,
      config: defaultConfig(),
    })
    expect(m(a).map((i) => i.message)).toEqual(['<mesh> 没有 filename 属性', '<mesh filename=""> 是空的'])
  })
  it('只用基本几何体：不需要 mesh 文件，直接通过', () => {
    const a = analyze({
      path: 'robot.urdf',
      text: '<robot name="r"><link name="a"><visual><geometry><box size="1 1 1"/></geometry></visual></link></robot>',
      files: null,
      config: defaultConfig(),
    })
    expect(status(a, 'mesh')).toBe('pass')
  })
})
