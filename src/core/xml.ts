import { SaxesParser } from 'saxes'

export interface XNode {
  tag: string
  attrs: Record<string, string>
  children: XNode[]
  parent: XNode | null
  /** 开始标签 `<` 所在的行（从 1 开始） */
  line: number
}

export interface XmlError {
  message: string
  line: number
}

export interface XmlParseResult {
  root: XNode | null
  errors: XmlError[]
}

// saxes 的报错是英文，常见的翻成中文，其余原样保留
const ZH: [RegExp, string][] = [
  [/unexpected close tag/i, '结束标签和开始标签对不上'],
  [/unmatched closing tag/i, '结束标签没有对应的开始标签'],
  [/unclosed tag/i, '标签没有闭合'],
  [/duplicate attribute/i, '同一个标签里属性重复了'],
  [/unquoted attribute value|must be quoted/i, '属性值必须用引号包起来'],
  [/attribute without value|value required/i, '属性没有值（要写成 name="value"）'],
  [/no whitespace between attributes/i, '两个属性之间要有空格'],
  [/entity/i, '无法识别的实体（& 要写成 &amp;）'],
  [/only one root/i, '一个文件只能有一个根元素，<robot> 的结束标签之后还有别的内容'],
  [/root element/i, '文件里没有根元素'],
  [/outside of root/i, '根元素之外有多余的文字'],
  [/unexpected end/i, '文件意外结束'],
  [/xml declaration/i, '<?xml ...?> 声明必须在文件最开头，前面不能有空行或其他字符'],
  [/malformed comment/i, '注释格式不对（注释内容里不能出现 --）'],
  [/forward-slash in opening tag/i, '自闭合标签里 "/" 后面必须紧跟 ">"'],
  [/disallowed character|malformed name/i, '标签名、属性名里含有不允许的字符'],
]

function translate(msg: string): string {
  const hit = ZH.find(([re]) => re.test(msg))
  return hit ? `${hit[1]}（${msg}）` : msg
}

/** 去掉 BOM、统一换行；行号都按这份文本算，页面显示源码时也要用它 */
export function normalizeText(source: string): string {
  return source.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
}

/** 每一行起始位置的偏移量（UTF-16 下标） */
function lineStarts(text: string): number[] {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1)
  return starts
}

function lineAt(starts: number[], offset: number): number {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts[mid] <= offset) lo = mid
    else hi = mid - 1
  }
  return lo + 1
}

/** 注释、CDATA、<?…?> 换成等长空白（换行保留，下标和行号都不变），方便在剩下的文本里找东西 */
function blankMarkup(text: string): string {
  return text.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>/g, (m) => m.replace(/[^\n]/g, ' '))
}

/**
 * 找第一个没转义的 &（后面不是 &amp; &#10; 这种完整实体），返回所在行；没有返回 null。
 * saxes 遇到没转义的 & 会一路吞到文件末尾，最后报成“标签没闭合”、行号还指向最后一行，所以要单独找。
 */
function findBareAmpersand(blank: string, starts: number[]): number | null {
  const m = /&(?!(?:[A-Za-z_][\w.-]*|#\d+|#x[0-9A-Fa-f]+);)/.exec(blank)
  return m ? lineAt(starts, m.index) : null
}

export function parseXml(source: string): XmlParseResult {
  const text = normalizeText(source)
  const starts = lineStarts(text)
  const parser = new SaxesParser()
  const st: { root: XNode | null; cur: XNode | null; lastClosed: XNode | null; startLine: number; rootEnd: number } = {
    root: null,
    cur: null,
    lastClosed: null,
    startLine: 1,
    rootEnd: 0,
  }

  // opentag 触发时 parser 已经读到标签末尾，多行标签的行号会偏大。
  // opentagstart 触发时刚读完标签名、还没读属性，往回找最近的 "<" 就是这个标签的起点。
  parser.on('opentagstart', () => {
    st.startLine = lineAt(starts, text.lastIndexOf('<', Math.max(0, parser.position - 1)))
  })
  parser.on('opentag', (tag) => {
    const node: XNode = { tag: tag.name, attrs: { ...tag.attributes }, children: [], parent: st.cur, line: st.startLine }
    if (st.cur) st.cur.children.push(node)
    else if (!st.root) st.root = node
    st.cur = node
  })
  // 结束标签对不上时，saxes 是先逐个关掉没闭合的标签、再报错，所以要记下最后被强行关掉的那个
  parser.on('closetag', () => {
    st.lastClosed = st.cur
    st.cur = st.cur?.parent ?? null
    if (!st.cur) st.rootEnd = parser.position // 根元素在这里结束，之后再出现文字就是“根之外”
  })

  try {
    parser.write(text).close()
  } catch (e) {
    // 报错信息形如 "4:12: unexpected close tag."，行号要从前缀里取：抛出之后 parser.line 已经不可靠
    const full = e instanceof Error ? e.message : String(e)
    const m = /^(?:\S*?:)?(\d+):\d+:\s*/.exec(full)
    const raw = m ? full.slice(m[0].length) : full
    const saxLine = m ? Number(m[1]) : 1

    const blank = blankMarkup(text)
    const amp = findBareAmpersand(blank, starts)
    if (amp !== null && amp <= saxLine) {
      return { root: st.root, errors: [{ message: 'XML 里的 & 必须写成 &amp;，这里有一个没转义的 &（它会让后面的内容全部读不出来）', line: amp }] }
    }

    let line = saxLine
    let message = translate(raw)
    if (st.cur && /unclosed tag/i.test(raw)) {
      message = `<${st.cur.tag}> 没有闭合：文件结束了，也没有等到 </${st.cur.tag}>`
      line = st.cur.line
    } else if (st.lastClosed && /unexpected close tag/i.test(raw)) {
      message += `；遇到它时，第 ${st.lastClosed.line} 行的 <${st.lastClosed.tag}> 还没有闭合`
    } else if (/outside of root/i.test(raw)) {
      // saxes 读完整段文字才报错，行号会落在这段文字的末尾；改成报在第一个非空白字符所在的行
      const from = st.root ? st.rootEnd : 0
      const hit = /\S/.exec(blank.slice(from))
      if (hit) line = lineAt(starts, from + hit.index)
      if (!st.root) message = '文件开头不是 XML 标签，看起来不是 URDF 文件（比如 Git LFS 指针文件、网页或纯文本）'
    }
    return { root: st.root, errors: [{ message, line }] }
  }
  return { root: st.root, errors: [] }
}
