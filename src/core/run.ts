import type { Config } from './config'
import { checkAxis } from './checks/axis'
import { checkLimit } from './checks/limit'
import { checkMesh } from './checks/mesh'
import { checkNaming } from './checks/naming'
import { checkReference } from './checks/reference'
import { checkSyntax } from './checks/syntax'
import { CHECKS, finish, skipped, type CheckId, type CheckResult, type SourceFile } from './types'
import { buildModel } from './urdf'
import { normalizeText, parseXml } from './xml'

export interface Analysis {
  /** 规范化后的源码，行号都是按它算的 */
  text: string
  robot: string | null
  stats: { links: number; joints: number; root: string | null; meshes: number } | null
  /** 文件里实际出现的 link / joint 名，命名对照表用 */
  names: { links: string[]; joints: string[] } | null
  results: CheckResult[]
}

export interface AnalyzeInput {
  path: string
  text: string
  /** 用户选的整个文件夹里的文件；只拿到单个 URDF 时为 null */
  files: SourceFile[] | null
  config: Config
}

function crashed(id: CheckId, e: unknown): CheckResult {
  return finish(
    id,
    [{ check: id, level: 'error', message: `检查程序自己出错了：${e instanceof Error ? e.message : String(e)}`, hint: '这是工具的 bug，请把这个 URDF 发给开发者' }],
    '检查程序出错',
  )
}

export function analyze({ path, text: raw, files, config }: AnalyzeInput): Analysis {
  const text = normalizeText(raw)
  const parse = parseXml(text)
  const model = parse.errors.length === 0 && parse.root?.tag === 'robot' ? buildModel(parse.root) : null

  const results: CheckResult[] = []
  try {
    results.push(checkSyntax(parse, model))
  } catch (e) {
    results.push(crashed('syntax', e))
  }
  if (!model) {
    for (const m of CHECKS.slice(1)) results.push(skipped(m.id, 'XML 无法解析，先修好检查 1'))
    return { text, robot: null, stats: null, names: null, results }
  }

  let root: string | null = null
  try {
    const r = checkReference(model)
    root = r.root
    results.push(r.result)
  } catch (e) {
    results.push(crashed('reference', e))
  }

  const rest: [CheckId, () => CheckResult][] = [
    ['naming', () => checkNaming(model, config)],
    ['limit', () => checkLimit(model, config)],
    ['axis', () => checkAxis(model, config)],
    ['mesh', () => checkMesh(model, files, path, config)],
  ]
  for (const [id, fn] of rest) {
    try {
      results.push(fn())
    } catch (e) {
      results.push(crashed(id, e))
    }
  }

  const names = {
    links: model.links.flatMap((l) => (l.name ? [l.name] : [])),
    joints: model.joints.flatMap((j) => (j.name ? [j.name] : [])),
  }
  const meshes = model.links.reduce((n, l) => n + l.geometries.filter((g) => g.shape === 'mesh').length, 0)
  return { text, robot: model.name, stats: { links: model.links.length, joints: model.joints.length, root, meshes }, names, results }
}
