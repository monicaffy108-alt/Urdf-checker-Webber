import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../src/core/config'
import { highlightXml } from '../src/core/highlight'
import { layoutHand, slotOf } from '../src/core/handLayout'
import { analyze } from '../src/core/run'
import { buildMapData, focusMatches, lineMarks, mentions, neutralNodes } from '../src/core/structure'
import type { Issue } from '../src/core/types'
import { buildDemoFiles } from '../src/samples/demo'

const demo = buildDemoFiles()
const run = (name: string, cfg = defaultConfig()) => {
  const f = demo.find((x) => x.path.endsWith(`/${name}.urdf`))!
  return analyze({ path: f.path, text: f.text!, files: demo, config: cfg })
}

describe('结构图布局', () => {
  const nodes = neutralNodes(defaultConfig().naming.entries)
  const L = layoutHand(nodes)

  it('27 个节点每个都画出来，且只画一次', () => {
    expect(L.items).toHaveLength(27)
    expect(new Set(L.items.map((i) => i.i)).size).toBe(27)
    expect(L.others).toEqual([])
  })

  it('手掌 / 手腕 6 项画成芯片，手指和拇指 21 项画成圆点', () => {
    expect(L.items.filter((i) => i.kind === 'chip')).toHaveLength(6)
    expect(L.items.filter((i) => i.kind === 'dot')).toHaveLength(21)
  })

  it('四根手指从左到右是 食指、中指、无名指、小指，每根 4 个节点从下往上排', () => {
    const cols = ['index', 'middle', 'ring', 'pinky'].map((f) => {
      const dots = L.items.filter((i) => i.kind === 'dot' && nodes[i.i].entry.link.startsWith(`${f}_`))
      expect(dots, f).toHaveLength(4)
      expect(new Set(dots.map((d) => d.x)).size, `${f} 在同一列`).toBe(1)
      const ys = dots.map((d) => d.y)
      expect(ys, `${f} 从下往上`).toEqual([...ys].sort((a, b) => b - a))
      return dots[0].x
    })
    expect(cols).toEqual([...cols].sort((a, b) => a - b))
  })

  it('图上的节点不会互相重叠（圆点间距、圆点和芯片间距都够）', () => {
    const dots = L.items.filter((i) => i.kind === 'dot')
    for (let a = 0; a < dots.length; a++) {
      for (let b = a + 1; b < dots.length; b++) {
        expect(Math.hypot(dots[a].x - dots[b].x, dots[a].y - dots[b].y), `${dots[a].label} 与 ${dots[b].label}`).toBeGreaterThan(30)
      }
    }
    const chips = L.items.filter((i) => i.kind === 'chip') as { x: number; y: number }[]
    for (const c of chips) {
      for (const d of dots) {
        const inside = d.x > c.x - 14 && d.x < c.x + 170 && d.y > c.y - 14 && d.y < c.y + 44
        expect(inside, `圆点 ${d.label} 压在芯片上`).toBe(false)
      }
    }
  })

  it('外框把所有圆点、芯片、手掌都圈在里面', () => {
    const { x, y, w, h } = L.box
    for (const it of L.items) {
      expect(it.x).toBeGreaterThan(x)
      expect(it.x).toBeLessThan(x + w)
      expect(it.y).toBeGreaterThan(y)
      expect(it.y).toBeLessThan(y + h)
    }
  })

  it('同一部位的名字去掉共同前缀：index_mcp_roll → mcp_roll', () => {
    const labels = L.items.filter((i) => i.kind === 'dot' && nodes[i.i].entry.link.startsWith('index_')).map((i) => i.label)
    expect(labels).toEqual(['mcp_roll', 'mcp_pitch', 'pip', 'dip'])
  })

  it('认不出部位的分组、另一个名字指向同一根手指的分组，都不会丢，会放进 others 由页面另外列出', () => {
    const entries = [
      ...defaultConfig().naming.entries,
      { group: '风扇', part: '散热风扇', link: 'fan_link', joint: 'fan_joint' },
      { group: '食指 (备用)', part: '多出来的', link: 'index_extra', joint: 'index_extra_j' },
    ]
    const l2 = layoutHand(neutralNodes(entries))
    expect(l2.items).toHaveLength(27)
    expect(l2.others.map((o) => o.group).sort()).toEqual(['风扇', '食指 (备用)'].sort())
    expect(l2.others.flatMap((o) => o.idxs).sort()).toEqual([27, 28])
  })

  it('同名分组里多加一行：并进同一根手指，手指变长，不会另起一列', () => {
    const entries = [...defaultConfig().naming.entries, { group: '食指部分', part: '多出来的', link: 'index_extra', joint: 'index_extra_j' }]
    const nodes = neutralNodes(entries)
    const l2 = layoutHand(nodes)
    expect(l2.items).toHaveLength(28)
    expect(l2.others).toEqual([])
    const xs = l2.items.filter((i) => i.kind === 'dot' && nodes[i.i].entry.link.startsWith('index_')).map((d) => d.x)
    expect(xs).toHaveLength(5)
    expect(new Set(xs).size).toBe(1)
  })

  it('分组名改成英文也认得出来', () => {
    expect(slotOf('Thumb')).toEqual({ kind: 'thumb' })
    expect(slotOf('index finger')).toEqual({ kind: 'finger', col: 0 })
    expect(slotOf('ring')).toEqual({ kind: 'finger', col: 2 })
    expect(slotOf('Wrist / Palm')).toEqual({ kind: 'palm' })
    expect(slotOf('其他')).toEqual({ kind: 'other' })
  })

  it('命名表为空时不会崩溃，给一个能用的默认外框', () => {
    const e = layoutHand([])
    expect(e.items).toEqual([])
    expect(e.box.w).toBeGreaterThan(0)
  })
})

describe('结构图的数据', () => {
  it('合规的示例手：26 个节点正常（含用到的 wrist_base_link），hand_base_link 没用到、算可选，没有多余名字', () => {
    const a = run('hand_2_clean')
    const m = buildMapData(a, defaultConfig())!
    expect(m.counts).toEqual({ ok: 26, warning: 0, error: 0, missing: 0, optional: 1 })
    expect(m.nodes.filter((n) => n.state === 'optional').map((n) => n.entry.link)).toEqual(['hand_base_link'])
    expect(m.extra).toEqual([])
  })

  it('出错的示例手：写错名字的节点标成“有错误”，文件里多出来的名字单独列出', () => {
    const a = run('hand_1_buggy')
    const m = buildMapData(a, defaultConfig())!
    const at = (link: string) => m.nodes.find((n) => n.entry.link === link)!
    // pinky_mcp_roll 被改成了 pinky_mcp_roll_joint：link 在、joint 不在
    expect(at('pinky_metacarpals').state).toBe('error')
    expect(at('pinky_metacarpals').detail).toContain('pinky_mcp_roll')
    // thumb_distal 被改名为 thumb_distal_link：joint thumb_ip 在、link 不在
    expect(at('thumb_distal').state).toBe('error')
    // index_pip 的 limit 上下限颠倒：名字都对，但有检查错误
    expect(at('index_middle').state).toBe('error')
    expect(at('index_middle').errors).toBeGreaterThan(0)
    expect(m.extra.map((x) => x.name).sort()).toEqual(['Index_DIP', 'pinky_mcp_roll_joint', 'thumb_distal_link'].sort())
    expect(m.counts.ok + m.counts.warning + m.counts.error + m.counts.missing + m.counts.optional).toBe(27)
  })

  it('XML 解析失败时没有名字，结构图不可用', () => {
    expect(buildMapData(run('hand_3_broken_xml'), defaultConfig())).toBeNull()
  })

  it('一个节点两个名字都不在文件里：必需的算“缺失”，可选固定件算“可选”', () => {
    const a = analyze({ path: 'x.urdf', text: '<robot name="r"><link name="hand_link"/><link name="b"/><joint name="hand_joint" type="fixed"><parent link="hand_link"/><child link="b"/></joint></robot>', files: null, config: defaultConfig() })
    const m = buildMapData(a, defaultConfig())!
    expect(m.nodes.find((n) => n.entry.link === 'hand_base_link')!.state).toBe('optional')
    expect(m.nodes.find((n) => n.entry.link === 'index_proximal')!.state).toBe('missing')
    expect(m.nodes.find((n) => n.entry.link === 'hand_link')!.state).toBe('ok')
  })

  it('allowExtra 放行的名字不算“标准里没有的名字”', () => {
    const cfg = defaultConfig()
    cfg.naming.allowExtra = ['^Index_DIP$', '_link$']
    const m = buildMapData(run('hand_1_buggy', cfg), cfg)!
    expect(m.extra.map((x) => x.name)).toEqual(['pinky_mcp_roll_joint'])
  })
})

describe('按名字筛选问题', () => {
  const issue = (message: string, target?: string): Issue => ({ check: 'naming', level: 'error', message, target })

  it('mentions 只认整词：thumb_metacarpals 不会匹配到 thumb_metacarpals_base1', () => {
    expect(mentions('「拇指部分」缺少 2 项：link thumb_metacarpals_base1、joint thumb_cmc_roll', 'thumb_metacarpals')).toBe(false)
    expect(mentions('「拇指部分」缺少：link thumb_metacarpals、joint x', 'thumb_metacarpals')).toBe(true)
    expect(mentions('x thumb_metacarpals', 'thumb_metacarpals')).toBe(true)
    expect(mentions('index_pip_extra', 'index_pip')).toBe(false)
  })

  it('target 是这个节点的 joint 或 link 就算，带 · visual 后缀的 link 也认', () => {
    expect(focusMatches(issue('x', 'joint index_pip'), ['index_pip', 'index_middle'])).toBe(true)
    expect(focusMatches(issue('x', 'link index_distal · visual'), ['index_dip', 'index_distal'])).toBe(true)
    expect(focusMatches(issue('和它无关', 'joint other'), ['index_pip'])).toBe(false)
  })

  it('target 不是它，但正文或建议里整词提到了它，也算有关', () => {
    expect(focusMatches(issue('parent link "x" 不存在', 'joint ring_pip'), ['ring_proximal'])).toBe(false)
    expect(focusMatches({ ...issue('parent link "ring_proxmal" 不存在', 'joint ring_pip'), hint: '是不是想写 "ring_proximal"？' }, ['ring_proximal'])).toBe(true)
    expect(focusMatches(issue('「食指部分」缺少 1 项：joint index_dip'), ['index_dip'])).toBe(true)
    expect(focusMatches(issue('「食指部分」缺少 1 项：joint index_dip'), ['index_di'])).toBe(false)
  })

  it('点“写错名字”的节点，能看到解释它的那条命名问题，别的手指的问题不会混进来', () => {
    const a = run('hand_1_buggy')
    const hit = a.results.flatMap((r) => r.issues).filter((i) => focusMatches(i, ['index_dip', 'index_distal']))
    // 问题挂在写错的名字 Index_DIP 上，标准名 index_dip 只出现在建议里
    expect(hit.some((i) => /Index_DIP/.test(i.message))).toBe(true)
    // index_distal 的 mesh 路径拼错了
    expect(hit.some((i) => /index_distl/.test(i.message))).toBe(true)
    expect(hit.some((i) => /ring_|middle_|pinky_|thumb_/.test(`${i.target ?? ''} ${i.message}`))).toBe(false)
  })
})

describe('源码里的行标记', () => {
  it('每个有问题的行都有标记，同一行有错误又有警告时取更严重的', () => {
    const a = run('hand_1_buggy')
    const marks = lineMarks(a)
    expect(marks.size).toBeGreaterThan(10)
    const lim = a.results.find((r) => r.id === 'limit')!.issues.find((i) => /上下限颠倒/.test(i.message))!
    expect(marks.get(lim.line!)).toBe('error')
    const worst = new Map<number, string>()
    for (const r of a.results) for (const i of r.issues) if (i.line !== undefined && i.level === 'error') worst.set(i.line, 'error')
    for (const line of worst.keys()) expect(marks.get(line)).toBe('error')
  })
})

describe('XML 语法高亮', () => {
  const flat = (text: string) => highlightXml(text).map((l) => l.map((t) => `${t.t}:${t.s}`))

  it('标签名、属性名、属性值、符号分别上色，拼起来和原文一模一样', () => {
    const src = '<joint name="a" type="fixed"/>'
    const [line] = highlightXml(src)
    expect(line.map((t) => t.s).join('')).toBe(src)
    expect(line.filter((t) => t.t === 'tag').map((t) => t.s)).toEqual(['joint'])
    expect(line.filter((t) => t.t === 'attr').map((t) => t.s)).toEqual(['name', 'type'])
    expect(line.filter((t) => t.t === 'val').map((t) => t.s)).toEqual(['"a"', '"fixed"'])
  })

  it('每一行拼回去都等于原文，包括缩进、注释、<?xml?>、闭合标签', () => {
    const src = '<?xml version="1.0"?>\n<robot name="r">\n  <!-- a\n  b -->\n  <link name="x"/>\n</robot>\n'
    const out = highlightXml(src)
    expect(out).toHaveLength(src.split('\n').length)
    out.forEach((l, i) => expect(l.map((t) => t.s).join('')).toBe(src.split('\n')[i]))
  })

  it('跨行注释的每一行都按注释上色，注释结束后恢复正常', () => {
    const l = flat('<!-- a\nb -->\n<x/>')
    expect(l[0].every((t) => t.startsWith('cmt:'))).toBe(true)
    expect(l[1][0]).toBe('cmt:b -->')
    expect(l[2].some((t) => t === 'tag:x')).toBe(true)
  })

  it('跨行的标签：属性在下一行也能认出来', () => {
    const l = flat('<joint\n  name="a"\n  type="b">')
    expect(l[1]).toContain('attr:name')
    expect(l[1]).toContain('val:"a"')
    expect(l[2]).toContain('attr:type')
  })

  it('带空格和特殊字符的属性值整体算一个值', () => {
    const l = flat('<mesh filename="package://a b/c.stl"/>')[0]
    expect(l).toContain('val:"package://a b/c.stl"')
  })
})
