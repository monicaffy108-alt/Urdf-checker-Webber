export type TokType = 'tag' | 'attr' | 'val' | 'cmt' | 'punc' | 'txt'

export interface Tok {
  t: TokType
  s: string
}

const TAG_OPEN = /^<([/?!]?)([^\s<>/=?"']*)/
const WS = /^\s+/
const STR = /^(?:"[^"]*"?|'[^']*'?)/
const TAG_END = /^\??\/?>/
const ATTR = /^[^\s=<>"'/?]+/

/**
 * 给 XML 源码逐行分词，用来上色。不是完整的 XML 解析器，只认标签名、属性名、属性值、注释，
 * 跨行的注释和跨行的标签会带着状态接着往下走；属性值本身跨行的情况不处理（URDF 里几乎没有）。
 * 返回的数组和 text.split('\n') 一一对应。
 */
export function highlightXml(text: string): Tok[][] {
  let inComment = false
  let inTag = false
  return text.split('\n').map((line) => {
    const toks: Tok[] = []
    const push = (t: TokType, s: string) => {
      if (s) toks.push({ t, s })
    }
    let i = 0
    while (i < line.length) {
      if (inComment) {
        const end = line.indexOf('-->', i)
        if (end < 0) {
          push('cmt', line.slice(i))
          i = line.length
        } else {
          push('cmt', line.slice(i, end + 3))
          i = end + 3
          inComment = false
        }
        continue
      }
      const rest = line.slice(i)
      if (inTag) {
        let m: RegExpExecArray | null
        let len: number
        if ((m = WS.exec(rest))) {
          push('txt', m[0])
          len = m[0].length
        } else if ((m = STR.exec(rest))) {
          push('val', m[0])
          len = m[0].length
        } else if ((m = TAG_END.exec(rest))) {
          push('punc', m[0])
          len = m[0].length
          inTag = false
        } else if ((m = ATTR.exec(rest))) {
          push('attr', m[0])
          len = m[0].length
        } else {
          push('punc', rest[0]) // = / 等单个符号
          len = 1
        }
        i += len
        continue
      }
      if (rest.startsWith('<!--')) {
        push('cmt', '<!--')
        i += 4
        inComment = true
        continue
      }
      const open = TAG_OPEN.exec(rest)
      if (open) {
        push('punc', `<${open[1]}`)
        push('tag', open[2])
        i += open[0].length
        inTag = true
        continue
      }
      const next = rest.indexOf('<')
      const end = next < 0 ? rest.length : next
      push('txt', rest.slice(0, end))
      i += end
    }
    return toks
  })
}
