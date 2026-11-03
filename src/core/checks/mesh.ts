import type { Config } from '../config'
import { finish, skipped, type CheckResult, type Issue, type SourceFile } from '../types'
import type { UrdfModel } from '../urdf'
import { suggest } from '../util'

interface Found {
  file: SourceFile
  caseMismatch: boolean
}

interface Note {
  level: 'warning' | 'info'
  text: string
}

interface Located {
  found: Found | null
  notes: Note[]
  skip?: boolean
  outside?: boolean
}

const basename = (p: string) => p.slice(p.lastIndexOf('/') + 1)
const extOf = (p: string) => {
  const b = basename(p)
  const i = b.lastIndexOf('.')
  return i < 0 ? '' : b.slice(i + 1).toLowerCase()
}

/** 合并 . 和 ..；退到所选文件夹外面返回 null */
function normalizePath(p: string): string | null {
  const out: string[] = []
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (!out.length) return null
      out.pop()
    } else {
      out.push(seg)
    }
  }
  return out.join('/')
}

class FileIndex {
  private exact = new Map<string, SourceFile>()
  private lower = new Map<string, SourceFile>()
  constructor(readonly files: SourceFile[]) {
    for (const f of files) {
      this.exact.set(f.path, f)
      if (!this.lower.has(f.path.toLowerCase())) this.lower.set(f.path.toLowerCase(), f)
    }
  }
  find(path: string): Found | null {
    const e = this.exact.get(path)
    if (e) return { file: e, caseMismatch: false }
    const l = this.lower.get(path.toLowerCase())
    return l ? { file: l, caseMismatch: true } : null
  }
  /** 按路径末尾匹配，文件前面可以多出任意层目录 */
  findSuffix(sub: string): Found | null {
    const s = '/' + sub
    const sl = s.toLowerCase()
    let ci: SourceFile | null = null
    for (const f of this.files) {
      const p = '/' + f.path
      if (p.endsWith(s)) return { file: f, caseMismatch: false }
      if (!ci && p.toLowerCase().endsWith(sl)) ci = f
    }
    return ci ? { file: ci, caseMismatch: true } : null
  }
}

function locate(raw: string, dir: string, idx: FileIndex): Located {
  const notes: Note[] = []
  let f = raw.trim()
  if (f.includes('\\')) {
    f = f.replace(/\\/g, '/')
    notes.push({ level: 'warning', text: '路径里用了反斜杠 \\，Linux / ROS 下识别不了，请改成 /' })
  }
  if (/^https?:\/\//i.test(f)) return { found: null, notes, skip: true }

  if (f.startsWith('package://')) {
    const rest = f.slice('package://'.length)
    const i = rest.indexOf('/')
    const pkg = i < 0 ? rest : rest.slice(0, i)
    const sub = i < 0 ? '' : rest.slice(i + 1)
    let found = sub ? idx.findSuffix(`${pkg}/${sub}`) : null
    if (!found && sub) {
      found = idx.findSuffix(sub)
      if (found) {
        // ROS 认的是 package.xml 里的 <name>，不是文件夹名，这里看不到 package.xml，所以只能提示
        notes.push({ level: 'info', text: `所选文件夹里没有叫 "${pkg}" 的目录，已按后面的路径 "${sub}" 匹配到文件。如果这个文件夹的 package.xml 里包名不是 "${pkg}"，ROS 运行时会找不到` })
      }
    }
    return { found, notes }
  }

  if (/^file:\/\//i.test(f) || /^\/|^[A-Za-z]:\//.test(f)) {
    const segs = f.replace(/^file:\/\//i, '').split('/').filter(Boolean)
    let found: Found | null = null
    for (const n of [3, 2, 1]) {
      if (segs.length < n) continue
      found = idx.findSuffix(segs.slice(-n).join('/'))
      if (found) break
    }
    if (found) notes.push({ level: 'warning', text: `用了绝对路径 "${raw.trim()}"，换一台电脑就找不到了，请改成 package:// 或相对路径` })
    return { found, notes }
  }

  const full = normalizePath(dir ? `${dir}/${f}` : f)
  if (full === null) return { found: null, notes, outside: true }
  return { found: idx.find(full), notes }
}

/** 检查 6：visual / collision 里引用的 mesh 文件能不能在所选文件夹里找到 */
export function checkMesh(model: UrdfModel, files: SourceFile[] | null, urdfPath: string, cfg: Config): CheckResult {
  const refs = model.links.flatMap((l) => l.geometries.filter((g) => g.shape === 'mesh'))
  if (!refs.length) return finish('mesh', [], '没有引用 mesh 文件（只用了基本几何体，或没有 visual / collision）')
  if (!files) return skipped('mesh', '只读到了 URDF，没有 meshes：请用“选择文件夹”选中包含 meshes 的整个文件夹')

  const idx = new FileIndex(files)
  const exts = new Set(cfg.mesh.extensions.map((e) => e.toLowerCase().replace(/^\./, '')))
  const dir = urdfPath.includes('/') ? urdfPath.slice(0, urdfPath.lastIndexOf('/')) : ''
  const meshByName = new Map<string, string>() // 文件名 → 路径，只收 mesh 格式的文件，用来猜拼写
  for (const f of files) if (exts.has(extOf(f.path))) meshByName.set(basename(f.path), f.path)

  const issues: Issue[] = []
  let missing = 0
  for (const g of refs) {
    const target = `link ${g.owner} · ${g.role}`
    const line = g.filenameLine ?? g.line
    const add = (level: Issue['level'], message: string, hint?: string) => issues.push({ check: 'mesh', level, message, target, line, hint })

    if (g.filename === undefined || g.filename.trim() === '') {
      missing++
      add('error', g.filename === undefined ? '<mesh> 没有 filename 属性' : '<mesh filename=""> 是空的')
      continue
    }
    const loc = locate(g.filename, dir, idx)
    if (loc.skip) {
      add('info', `网络地址 "${g.filename}"，不检查`)
      continue
    }
    if (!loc.found) {
      missing++
      const base = basename(g.filename.replace(/\\/g, '/'))
      const same = files.find((f) => basename(f.path).toLowerCase() === base.toLowerCase())
      const guess = suggest(base, meshByName.keys())
      const hint = loc.outside
        ? '路径用 .. 退到了所选文件夹的外面，请改选包含 meshes 的上一级文件夹'
        : same
          ? `在 "${same.path}" 找到了同名文件，URDF 里的路径对不上`
          : guess
            ? `是不是想写 "${meshByName.get(guess)}"？`
            : '所选文件夹里没有这个文件。只选了 urdf 子文件夹的话，请改选包含 meshes 的上一级文件夹'
      add('error', `找不到文件 "${g.filename}"`, hint)
      continue
    }
    const { file, caseMismatch } = loc.found
    for (const n of loc.notes) add(n.level, n.text)
    if (caseMismatch) {
      add('warning', `大小写对不上：URDF 写的是 "${g.filename}"，实际文件是 "${file.path}"`, 'Windows 不区分大小写所以能打开，Linux / ROS 下会找不到')
    }
    if (file.size === 0) add('error', `文件是空的（0 字节）："${file.path}"`, '可能是导出失败，或者 Git LFS 没拉下来')
    const ext = extOf(file.path)
    if (!exts.has(ext)) add('warning', `扩展名 ".${ext}" 不是常见的 mesh 格式（${[...exts].join(' / ')}）`)
  }

  const n = issues.filter((i) => i.level !== 'info').length
  return finish('mesh', issues, missing ? `引用了 ${refs.length} 处 mesh，${missing} 处找不到` : n ? `引用了 ${refs.length} 处 mesh，都找到了，但有 ${n} 个问题` : `引用了 ${refs.length} 处 mesh，都找到了`)
}
