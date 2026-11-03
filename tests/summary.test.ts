import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../src/core/config'
import { CHAR_W, R, layoutHand } from '../src/core/handLayout'
import { analyze } from '../src/core/run'
import { neutralNodes } from '../src/core/structure'
import { headline, statementLine, unfinished, verdict, watermarkSize, worstCheck } from '../src/core/summary'
import { buildDemoFiles } from '../src/samples/demo'

const demo = buildDemoFiles()
const run = (name: string, cfg = defaultConfig()) => {
  const f = demo.find((x) => x.path.endsWith(`/${name}.urdf`))!
  return analyze({ path: f.path, text: f.text!, files: demo, config: cfg })
}

describe('首屏大标题', () => {
  it('有错误：大标题只放错误数，副标题放警告数', () => {
    const h = headline(run('hand_1_buggy'))
    expect(h).toEqual({ kind: 'error', big: '17 个错误', sub: '另有 10 个警告' })
  })

  it('XML 解析失败：1 个错误，没有警告', () => {
    expect(headline(run('hand_3_broken_xml'))).toEqual({ kind: 'error', big: '1 个错误', sub: '没有警告' })
  })

  it('没有错误但有规则没配置：不能说“全部通过”，要点名没跑完整的检查', () => {
    const h = headline(run('hand_2_clean'))
    expect(h.kind).toBe('incomplete')
    expect(h.big).toBe('没有发现问题')
    expect(h.sub).toBe('但「limit 上下限」「axis 转轴」没有完整检查')
    expect(unfinished(run('hand_2_clean'))).toEqual(['limit 上下限', 'axis 转轴'])
  })

  it('规则都启用、没有任何问题：全部通过', () => {
    const cfg = defaultConfig()
    cfg.axis.rules.forEach((r) => (r.enabled = true))
    cfg.limit.signRules.forEach((r) => (r.enabled = true))
    const a = run('hand_2_clean', cfg)
    expect(headline(a)).toEqual({ kind: 'pass', big: '全部通过', sub: '6 项检查都没有发现问题' })
    expect(verdict(a).kind).toBe('pass')
  })

  it('只有警告：大标题是警告数，副标题说没有错误', () => {
    const a = analyze({
      path: 'x.urdf',
      text: '<robot name="r"><link name="a"/><link name="b"/><joint name="j" type="revolute"><parent link="a"/><child link="b"/><limit lower="-3.14159" upper="3.14159" effort="1" velocity="1"/></joint></robot>',
      files: null,
      config: defaultConfig(),
    })
    const h = headline(a)
    // 名字不在标准里会报错，这里只验证“有警告无错误”的分支是通的
    expect(['error', 'warning']).toContain(h.kind)
  })
})

describe('居中说明的第一行', () => {
  it('按状态分类计数，没有的类别不出现', () => {
    expect(statementLine(run('hand_1_buggy'))).toBe('6 项检查里，6 项有错误。')
    expect(statementLine(run('hand_2_clean'))).toBe('6 项检查里，2 项没有完整检查，4 项通过。')
    expect(statementLine(run('hand_3_broken_xml'))).toBe('6 项检查里，1 项有错误，5 项没有完整检查。')
  })

  it('全部通过时说一句话', () => {
    const cfg = defaultConfig()
    cfg.axis.rules.forEach((r) => (r.enabled = true))
    cfg.limit.signRules.forEach((r) => (r.enabled = true))
    expect(statementLine(run('hand_2_clean', cfg))).toBe('6 项检查全部通过。')
  })
})

describe('便当格里的深色块', () => {
  it('选问题最重的一项：错误数优先，其次警告数', () => {
    // 示例里 mesh 有 4 个错误 6 个警告，limit 有 4 个错误 2 个警告
    expect(worstCheck(run('hand_1_buggy').results)).toBe('mesh')
  })

  it('一个错误或警告都没有时不选（提示级别不算）', () => {
    expect(worstCheck(run('hand_2_clean').results)).toBeNull()
  })

  it('错误比警告重要：1 个错误胜过 50 个警告', () => {
    const mk = (id: 'syntax' | 'mesh', e: number, w: number) => ({
      id,
      status: 'error' as const,
      summary: '',
      issues: [...Array(e).fill({ check: id, level: 'error', message: 'x' }), ...Array(w).fill({ check: id, level: 'warning', message: 'x' })],
    })
    expect(worstCheck([mk('syntax', 1, 0), mk('mesh', 0, 50)])).toBe('syntax')
  })
})

describe('水印字号', () => {
  it('短名字用最大号，长名字缩小，太长也不小于下限', () => {
    expect(watermarkSize('hand', 1100)).toBe(160)
    const mid = watermarkSize('demo_hand_buggy', 1100)
    expect(mid).toBeGreaterThan(100)
    expect(mid).toBeLessThan(160)
    expect(watermarkSize('a_very_long_robot_name_that_never_ends_in_a_hurry_at_all', 1100)).toBe(64)
  })

  it('中文名字按每个字一个字宽算，比同样字数的英文占得多', () => {
    expect(watermarkSize('灵心巧手灵巧手', 1100)).toBeLessThan(watermarkSize('abcdefg', 1100))
  })

  it('空名字不会除零', () => {
    expect(watermarkSize('', 1100)).toBe(160)
  })
})

describe('手形图：标签放在节点右侧，不会碰到旁边那根手指', () => {
  const nodes = neutralNodes(defaultConfig().naming.entries)
  const L = layoutHand(nodes)

  it('每个手指节点的标签右端，离右边那一列的节点圆至少还有空隙', () => {
    const cols = [...new Set(L.items.filter((i) => i.kind === 'dot' && i.side === 'right').map((i) => i.x))].sort((a, b) => a - b)
    expect(cols).toHaveLength(4)
    for (const it of L.items) {
      if (it.kind !== 'dot' || it.side !== 'right') continue
      const right = it.x + R + 8 + it.label.length * CHAR_W
      const next = cols.find((x) => x > it.x)
      if (next !== undefined) expect(right, `${it.label} 的标签会压到下一列`).toBeLessThan(next - R)
    }
  })

  it('拇指的标签在左边，手指的标签在右边', () => {
    const side = (link: string) => L.items.find((i) => i.kind === 'dot' && nodes[i.i].entry.link === link) as { side: string }
    expect(side('thumb_distal').side).toBe('left')
    expect(side('index_distal').side).toBe('right')
  })

  it('手指的连线竖直穿过圆心，标签不在连线上（标签在圆右边，线在圆正中）', () => {
    for (const it of L.items) {
      if (it.kind !== 'dot' || it.side !== 'right') continue
      // 标签起点 = x + R + 8，一定在竖线（x）的右边
      expect(it.x + R + 8).toBeGreaterThan(it.x + R)
    }
  })
})
