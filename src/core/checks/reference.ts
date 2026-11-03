import { finish, type CheckResult, type Issue } from '../types'
import type { UrdfJoint, UrdfModel } from '../urdf'
import { suggest } from '../util'

const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
  const a = m.get(k)
  if (a) a.push(v)
  else m.set(k, [v])
}

interface Edge {
  to: string
  j: UrdfJoint
}

/** 检查 2：joint 的 parent / child 读得到、link 存在，并且整体是一棵树 */
export function checkReference(model: UrdfModel): { result: CheckResult; root: string | null } {
  const issues: Issue[] = []
  const err = (message: string, target?: string, line?: number, hint?: string) =>
    issues.push({ check: 'reference', level: 'error', message, target, line, hint })

  const linkNames = new Set<string>()
  const lineOf = new Map<string, number>()
  for (const l of model.links) {
    if (!l.name) continue
    linkNames.add(l.name)
    if (!lineOf.has(l.name)) lineOf.set(l.name, l.line)
  }

  const reported = new Set<string>() // 已经在别处报过的 link，后面不再重复报“无法到达”
  const byChild = new Map<string, UrdfJoint[]>() // child 存在的所有 joint，不管 parent 对不对
  const edges = new Map<string, Edge[]>() // parent → 子 link，两端都存在的才算
  const dangling: string[] = [] // parent 写错了、child 是好的：它们底下的子树先不报

  const reach = (r: string) => {
    const seen = new Set([r])
    const stack = [r]
    while (stack.length) {
      for (const e of edges.get(stack.pop()!) ?? []) {
        if (!seen.has(e.to)) {
          seen.add(e.to)
          stack.push(e.to)
        }
      }
    }
    return seen
  }

  for (const j of model.joints) {
    const target = `joint ${j.name ?? '(未命名)'}`
    const ends: Record<'parent' | 'child', string | null> = { parent: null, child: null }
    for (const role of ['parent', 'child'] as const) {
      const el = role === 'parent' ? j.parentEl : j.childEl
      const val = role === 'parent' ? j.parent : j.child
      if (!el) {
        err(`读不到 <${role}>：joint 里没有 <${role} link="…"/>`, target, j.line)
      } else if (val === null) {
        err(`<${role}> 缺少 link 属性`, target, el.line)
      } else if (val.trim() === '') {
        err(`<${role} link=""> 是空的`, target, el.line)
      } else if (!linkNames.has(val)) {
        const s = suggest(val, linkNames)
        err(`${role} link "${val}" 不存在`, target, el.line, s ? `是不是想写 "${s}"？` : '文件里没有叫这个名字的 <link>')
      } else {
        ends[role] = val
      }
    }
    if (ends.child) push(byChild, ends.child, j)
    if (ends.parent && ends.child) {
      if (ends.parent === ends.child) {
        err(`parent 和 child 是同一个 link "${ends.parent}"`, target, j.line)
        reported.add(ends.parent)
      } else {
        push(edges, ends.parent, { to: ends.child, j })
      }
    } else if (ends.child) {
      dangling.push(ends.child)
    }
  }

  for (const [child, js] of byChild) {
    if (js.length < 2) continue
    err(
      `link "${child}" 同时是 ${js.length} 个 joint 的 child：${js.map((j) => `${j.name ?? '(未命名)'}（第 ${j.line} 行）`).join('、')}`,
      `link ${child}`,
      js[1].line,
      'URDF 是树结构，一个 link 只能有一个父 joint',
    )
  }

  // 环：沿着 parent → child 的方向做深度优先搜索（非递归），走回到当前路径上的 link 就是环。
  // 一个 link 有多个父 joint 时也能查到，不会因为只看第一个父 joint 而漏掉。
  const state = new Map<string, 1 | 2>() // 1 = 在当前路径上，2 = 已经查完
  for (const start of linkNames) {
    if (state.has(start)) continue
    const path = [start]
    const next = [0]
    state.set(start, 1)
    while (path.length) {
      const node = path[path.length - 1]
      const out = edges.get(node) ?? []
      const i = next[next.length - 1]++
      if (i >= out.length) {
        state.set(node, 2)
        path.pop()
        next.pop()
        continue
      }
      const e = out[i]
      const s = state.get(e.to)
      if (s === undefined) {
        state.set(e.to, 1)
        path.push(e.to)
        next.push(0)
      } else if (s === 1) {
        const cycle = path.slice(path.indexOf(e.to))
        err(
          `joint 连成了环：${[...cycle, e.to].join(' → ')}`,
          `joint ${e.j.name ?? '(未命名)'}`,
          e.j.line,
          'URDF 不能有环，检查这个 joint（或环里别的 joint）的 parent / child 是不是写反了',
        )
        // 环本身和挂在环下面的子树都不会再单独报“无法到达”
        for (const n of cycle) reach(n).forEach((x) => reported.add(x))
      }
    }
  }

  const roots = [...linkNames].filter((n) => !byChild.has(n))
  let root: string | null = null
  const covered = new Set<string>()
  if (roots.length) {
    const reaches = roots.map(reach)
    let best = 0
    reaches.forEach((s, i) => {
      if (s.size > reaches[best].size) best = i
    })
    root = roots[best]
    reaches.forEach((s) => s.forEach((n) => covered.add(n)))
    roots.forEach((r, i) => {
      if (i === best) return
      const alone = !edges.has(r)
      err(
        alone ? `link "${r}" 是孤立的：没有 joint 把它连进来` : `link "${r}" 也是一个根（它不是任何 joint 的 child），一个 URDF 只能有一个根 "${root}"`,
        `link ${r}`,
        lineOf.get(r),
        '给它补一个 joint 接到树上；如果它没用就删掉。上面有 parent / child 报错的话，先修那些',
      )
      reported.add(r)
    })
  }
  for (const d of dangling) reach(d).forEach((n) => covered.add(n))
  for (const n of linkNames) {
    if (!covered.has(n) && !reported.has(n)) err(`link "${n}" 无法从根 link 到达`, `link ${n}`, lineOf.get(n))
  }

  const msg = !linkNames.size
    ? '没有带 name 的 link，无法检查 parent / child'
    : issues.length
      ? `发现 ${issues.length} 个问题`
      : `${model.links.length} 个 link、${model.joints.length} 个 joint 连成一棵树，根是 ${root}`
  return { result: finish('reference', issues, msg), root }
}
