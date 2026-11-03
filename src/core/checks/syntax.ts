import { finish, type CheckResult, type Issue } from '../types'
import { JOINT_TYPES, ownerOf, parseNum, parseVec, type UrdfModel } from '../urdf'
import { suggest } from '../util'
import type { XmlParseResult, XNode } from '../xml'

const TOP_LEVEL = new Set(['link', 'joint', 'material', 'transmission', 'gazebo', 'plugin', 'ros2_control', 'sensor', 'mujoco'])

function walk(n: XNode, fn: (n: XNode) => void) {
  fn(n)
  for (const c of n.children) walk(c, fn)
}

const show = (v: string | undefined) => (v === undefined ? '（没写）' : `"${v}"`)

/** 检查 1：XML 能不能解析，robot / link / joint 的必填项是否完整，有没有重名 */
export function checkSyntax(parse: XmlParseResult, model: UrdfModel | null): CheckResult {
  const issues: Issue[] = []
  const add = (level: Issue['level'], message: string, line?: number, target?: string, hint?: string) =>
    issues.push({ check: 'syntax', level, message, line, target, hint })

  for (const e of parse.errors) add('error', `XML 语法错误：${e.message}`, e.line)
  if (parse.errors.length) return finish('syntax', issues, 'XML 解析失败，后面的检查已跳过')

  const root = parse.root
  if (!root) {
    add('error', '文件是空的，里面没有任何 XML 元素')
    return finish('syntax', issues, '文件是空的，后面的检查已跳过')
  }
  if (root.tag !== 'robot' || !model) {
    add('error', `根节点必须是 <robot>，这里是 <${root.tag}>`, root.line, undefined, suggest(root.tag, ['robot']) ? '是不是想写 <robot>？' : undefined)
    return finish('syntax', issues, '根节点不是 <robot>，后面的检查已跳过')
  }

  if (!root.attrs.name?.trim()) add('error', '<robot> 缺少 name 属性', root.line, undefined, '例如 <robot name="my_hand">')

  let xacroLine = 0
  walk(root, (n) => {
    if (!xacroLine && (n.tag.startsWith('xacro:') || Object.values(n.attrs).some((v) => /\$\{|\$\(/.test(v)))) xacroLine = n.line
  })
  if (xacroLine) add('warning', '含有 xacro 语法（xacro: 标签或 ${…} 表达式），这不是展开后的 URDF', xacroLine, undefined, '先用 xacro 命令展开成 .urdf 再检查，否则下面的结果可能不准')

  for (const c of root.children) {
    if (TOP_LEVEL.has(c.tag) || c.tag.startsWith('xacro:')) continue
    const s = suggest(c.tag, TOP_LEVEL)
    add('warning', `<robot> 下有不认识的标签 <${c.tag}>，可能拼错了`, c.line, undefined, s ? `是不是想写 <${s}>？` : undefined)
  }

  if (!model.links.length) add('error', '没有任何 <link>', root.line)

  const dup = (items: { name: string | null; line: number }[], kind: 'link' | 'joint') => {
    const seen = new Map<string, number>()
    items.forEach((it, i) => {
      const target = `${kind} ${it.name?.trim() ? it.name : `#${i + 1}`}`
      if (!it.name?.trim()) {
        add('error', `${kind} 缺少 name 属性（必填）`, it.line, target)
        return
      }
      const first = seen.get(it.name)
      if (first !== undefined) add('error', `${kind} 名重复："${it.name}"（第一次出现在第 ${first} 行）`, it.line, target, '同一类的名字必须唯一')
      else seen.set(it.name, it.line)
    })
  }
  dup(model.links, 'link')
  dup(model.joints, 'joint')

  for (const j of model.joints) {
    const target = `joint ${j.name ?? '(未命名)'}`
    if (j.type === null || !j.type.trim()) {
      add('error', 'joint 缺少 type 属性（必填）', j.line, target, `可选：${JOINT_TYPES.join(' / ')}`)
    } else if (!JOINT_TYPES.includes(j.type)) {
      const s = suggest(j.type, JOINT_TYPES)
      add('error', `joint type "${j.type}" 不合法`, j.line, target, s ? `是不是想写 "${s}"？` : `可选：${JOINT_TYPES.join(' / ')}`)
    }
  }

  for (const l of model.links) {
    for (const g of l.geometries) {
      const target = `link ${l.name ?? '(未命名)'} · ${g.role}`
      const geo = g.node.children.find((c) => c.tag === 'geometry')
      if (!geo) {
        add('error', `<${g.role}> 缺少 <geometry>`, g.line, target)
        continue
      }
      const shape = geo.children.find((c) => c.tag === g.shape)
      if (!g.shape || !shape) {
        add('error', '<geometry> 里没有 box / cylinder / sphere / mesh', geo.line, target)
        continue
      }
      const positive = (k: string) => {
        const v = parseNum(shape.attrs[k])
        return v !== null && v > 0
      }
      if (g.shape === 'box') {
        const v = parseVec(shape.attrs.size, 3)
        if (!v || v.some((x) => x <= 0)) add('error', `<box> 的 size 应是 3 个正数，这里是 ${show(shape.attrs.size)}`, shape.line, target)
      } else if (g.shape === 'cylinder') {
        for (const k of ['radius', 'length']) if (!positive(k)) add('error', `<cylinder> 的 ${k} 应是正数，这里是 ${show(shape.attrs[k])}`, shape.line, target)
      } else if (g.shape === 'sphere' && !positive('radius')) {
        add('error', `<sphere> 的 radius 应是正数，这里是 ${show(shape.attrs.radius)}`, shape.line, target)
      }
    }
  }

  walk(root, (n) => {
    if (n.tag !== 'origin') return
    for (const k of ['xyz', 'rpy']) {
      const raw = n.attrs[k]
      if (raw !== undefined && !parseVec(raw, 3)) add('error', `<origin> 的 ${k} 应是 3 个数字，这里是 "${raw}"`, n.line, ownerOf(n))
    }
  })

  const n = issues.filter((i) => i.level !== 'info').length
  return finish('syntax', issues, n ? `发现 ${n} 个问题` : `${model.links.length} 个 link、${model.joints.length} 个 joint，结构完整`)
}
