import type { SourceFile } from '../core/types'

// 这些目录里的东西跟 URDF 无关，而且往往很大
const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.idea', '.vscode'])

export interface Workspace {
  label: string
  files: SourceFile[]
  urdfs: SourceFile[]
  /** 除了 URDF 还有别的文件（meshes 等），mesh 检查才有意义 */
  hasMeshes: boolean
  /** 文件夹里的 .xacro 数量，用来在找不到 .urdf 时给提示 */
  xacro: number
}

interface Picked {
  path: string
  file: File
}

const isUrdf = (p: string) => /\.urdf$/i.test(p)
const isXacro = (p: string) => /\.xacro$/i.test(p)

export function buildWorkspace(label: string, files: SourceFile[]): Workspace {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path))
  const urdfs = sorted.filter((f) => f.text !== undefined && isUrdf(f.path))
  return { label, files: sorted, urdfs, hasMeshes: sorted.length > urdfs.length, xacro: sorted.filter((f) => isXacro(f.path)).length }
}

async function finish(picked: Picked[]): Promise<Workspace> {
  const files = await Promise.all(
    picked.map(async ({ path, file }): Promise<SourceFile> => (isUrdf(path) ? { path, size: file.size, file, text: await file.text() } : { path, size: file.size, file })),
  )
  const roots = new Set(files.map((f) => f.path.split('/')[0]))
  const nested = files.length > 0 && files.every((f) => f.path.includes('/'))
  const label = nested && roots.size === 1 ? [...roots][0] : files.length === 1 ? files[0].path : `${files.length} 个文件`
  return buildWorkspace(label, files)
}

/** 来自 <input type="file">（选文件夹时 webkitRelativePath 带着完整相对路径） */
export function fromFileList(list: ArrayLike<File>): Promise<Workspace> {
  const picked: Picked[] = []
  for (const file of Array.from(list)) {
    const path = (file.webkitRelativePath || file.name).replace(/\\/g, '/')
    if (path.split('/').some((s) => SKIP_DIRS.has(s))) continue
    picked.push({ path, file })
  }
  return finish(picked)
}

const readBatch = (r: FileSystemDirectoryReader) => new Promise<FileSystemEntry[]>((res, rej) => r.readEntries(res, rej))

async function listDir(d: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = d.createReader()
  const all: FileSystemEntry[] = []
  // readEntries 一次最多返回一批，要一直读到返回空为止
  for (;;) {
    const batch = await readBatch(reader)
    if (!batch.length) return all
    all.push(...batch)
  }
}

async function walk(e: FileSystemEntry, out: Picked[]): Promise<void> {
  if (e.isFile) {
    const file = await new Promise<File>((res, rej) => (e as FileSystemFileEntry).file(res, rej))
    out.push({ path: e.fullPath.replace(/^\/+/, ''), file })
  } else if (e.isDirectory && !SKIP_DIRS.has(e.name)) {
    await Promise.all((await listDir(e as FileSystemDirectoryEntry)).map((c) => walk(c, out)))
  }
}

/** 读取失败，并且 message 已经是写给用户看的中文说明，页面直接显示 */
export class ReadError extends Error {}

const DIR_DROP_HELP =
  '读取不了拖进来的文件夹。如果页面是直接双击 index.html 打开的（地址以 file:// 开头），Chrome / Edge 不允许这样读取文件夹。' +
  '请点“选择文件夹”按钮；想用拖放，就在项目目录运行 npm run preview，再打开它给出的网址（形如 http://localhost:4173）。'

/** 来自拖放。必须在 drop 事件处理函数里同步调用：事件结束后 dt.items 就失效了 */
export function fromDataTransfer(dt: DataTransfer): Promise<Workspace> {
  const entries = Array.from(dt.items)
    .map((i) => i.webkitGetAsEntry())
    .filter((e): e is FileSystemEntry => e !== null)
  const loose = Array.from(dt.files)
  return (async () => {
    if (!entries.length) return fromFileList(loose)
    const picked: Picked[] = []
    try {
      await Promise.all(entries.map((e) => walk(e, picked)))
    } catch (err) {
      if (entries.some((e) => e.isDirectory)) {
        const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
        throw new ReadError(`${DIR_DROP_HELP}（浏览器返回的原始错误：${raw}）`)
      }
      // 只拖了散文件：File 对象本身就能读，不依赖目录接口
      return fromFileList(loose)
    }
    return finish(picked)
  })()
}
