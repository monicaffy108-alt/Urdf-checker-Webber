import { describe, expect, it } from 'vitest'
import { parseXml } from '../src/core/xml'

describe('parseXml', () => {
  it('多行标签的行号是标签起点，而不是标签结束的位置', () => {
    const r = parseXml('<a>\n  <joint\n    name="x"\n    type="y"/>\n  <b/>\n</a>')
    expect(r.errors).toEqual([])
    const [joint, b] = r.root!.children
    expect(joint.line).toBe(2)
    expect(b.line).toBe(5)
  })

  it('CRLF、BOM、emoji 不会让行号错位', () => {
    const r = parseXml('﻿<a>\r\n<!-- 😀😀 -->\r\n<b/>\r\n<c/>\r\n</a>')
    expect(r.errors).toEqual([])
    expect(r.root!.children.map((c) => [c.tag, c.line])).toEqual([
      ['b', 3],
      ['c', 4],
    ])
  })

  it('注释里的 < 和属性里的 &lt; 不影响行号', () => {
    const r = parseXml('<a>\n<!-- <fake -->\n<b v="x&lt;y"/>\n<c/>\n</a>')
    expect(r.root!.children.map((c) => [c.tag, c.line])).toEqual([
      ['b', 3],
      ['c', 4],
    ])
    expect(r.root!.children[0].attrs.v).toBe('x<y')
  })

  it('标签没闭合：报在打开它的那一行', () => {
    const r = parseXml('<a>\n<b>\n<c/>\n')
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0].line).toBe(2)
    expect(r.errors[0].message).toContain('<b> 没有闭合')
  })

  it('结束标签对不上：报在结束标签的行，并指出没闭合的是哪个', () => {
    const r = parseXml('<a>\n<b>\n</a>\n')
    expect(r.errors[0].line).toBe(3)
    expect(r.errors[0].message).toContain('结束标签和开始标签对不上')
    expect(r.errors[0].message).toContain('第 2 行的 <b>')
  })

  it.each([
    ['属性重复', '<a>\n<b v="1" v="2"/>\n</a>', 2, '属性重复'],
    ['没加引号', '<a>\n<b v=1/>\n</a>', 2, '引号'],
    ['& 没转义', '<a>\n<b v="a & b"/>\n</a>', 2, '&amp;'],
    ['两个根', '<a/>\n<b/>', 2, '只能有一个根元素'],
    ['根之外有文字', '<a/>\nhello', 2, '多余的文字'],
    ['声明前有空行', '\n<?xml version="1.0"?>\n<a/>', 2, '最开头'],
  ])('%s', (_name, src, line, text) => {
    const r = parseXml(src)
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0].line).toBe(line)
    expect(r.errors[0].message).toContain(text)
  })

  it('空文件报没有根元素；纯文字（比如 Git LFS 指针文件）报“不是 XML”', () => {
    expect(parseXml('').errors[0].message).toContain('没有根元素')
    const lfs = parseXml('version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 123\n')
    expect(lfs.errors[0].message).toContain('不是 XML 标签')
    expect(lfs.errors[0].line).toBe(1)
  })

  it('根元素后面多出来的文字：报在文字开始的那一行（自闭合和普通结束标签都要对）', () => {
    for (const root of ['<a/>', '<a></a>', '<a>\n</a>']) {
      const extra = root.split('\n').length // 根元素结束的那一行
      const r = parseXml(`${root}\n\nhello\nworld\n`)
      expect(r.errors, root).toHaveLength(1)
      expect(r.errors[0].message).toContain('多余的文字')
      expect(r.errors[0].line, root).toBe(extra + 2)
    }
    // 根元素后面的注释不算多余内容
    expect(parseXml('<a/>\n<!-- ok -->\n').errors).toEqual([])
  })

  it('没转义的 & 要报在它自己那一行，而不是文件末尾', () => {
    const r = parseXml('<a>\n<b v="x"/>\n<c v="R&D"/>\n<d/>\n<e/>\n</a>\n')
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0].line).toBe(3)
    expect(r.errors[0].message).toContain('&amp;')
  })

  it('注释和 CDATA 里的 & 不算错误，别的错误照常报在原来的位置', () => {
    const ok = parseXml('<a>\n<!-- R&D -->\n<b><![CDATA[x & y]]></b>\n</a>')
    expect(ok.errors).toEqual([])
    const bad = parseXml('<a>\n<!-- R&D -->\n<b>\n</a>')
    expect(bad.errors[0].line).toBe(4)
    expect(bad.errors[0].message).toContain('结束标签和开始标签对不上')
  })

  it('带 xacro: 前缀的标签也能解析', () => {
    const r = parseXml('<robot name="r">\n<xacro:macro name="m"/>\n</robot>')
    expect(r.errors).toEqual([])
    expect(r.root!.children[0].tag).toBe('xacro:macro')
  })
})
