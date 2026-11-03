import { describe, expect, it } from 'vitest'
import { ReadError, buildWorkspace, fromDataTransfer, fromFileList } from '../src/io/readFiles'

function fakeFile(path: string, content = 'x'): File {
  const f = new File([content], path.slice(path.lastIndexOf('/') + 1))
  Object.defineProperty(f, 'webkitRelativePath', { value: path })
  return f
}

const fileEntry = (path: string, content = 'x') => {
  const file = new File([content], path.slice(path.lastIndexOf('/') + 1))
  return { isFile: true, isDirectory: false, name: file.name, fullPath: '/' + path, file: (ok: (f: File) => void) => ok(file) } as unknown as FileSystemFileEntry
}

/** batch：每次 readEntries 最多返回几项，模拟 Chrome 一次只给一批的行为 */
const dirEntry = (path: string, children: FileSystemEntry[], batch = 2) =>
  ({
    isFile: false,
    isDirectory: true,
    name: path.slice(path.lastIndexOf('/') + 1),
    fullPath: '/' + path,
    createReader: () => {
      let i = 0
      return {
        readEntries: (ok: (e: FileSystemEntry[]) => void) => {
          ok(children.slice(i, i + batch))
          i += batch
        },
      }
    },
  }) as unknown as FileSystemDirectoryEntry

const dt = (entries: FileSystemEntry[]) => ({ items: entries.map((e) => ({ webkitGetAsEntry: () => e })), files: [] }) as unknown as DataTransfer

describe('选择文件夹（input webkitdirectory）', () => {
  it('保留相对路径，用根目录名当来源，跳过 .git / node_modules，识别 URDF 并读出文本', async () => {
    const ws = await fromFileList([
      fakeFile('hand/urdf/a.urdf', '<robot name="a"/>'),
      fakeFile('hand/urdf/B.URDF', '<robot name="b"/>'),
      fakeFile('hand/meshes/a.stl'),
      fakeFile('hand/.git/config'),
      fakeFile('hand/node_modules/x/y.urdf', '<robot/>'),
    ])
    expect(ws.label).toBe('hand')
    // 文件列表按自然顺序排（不分大小写），所以 a.urdf 在 B.URDF 前面
    expect(ws.files.map((f) => f.path)).toEqual(['hand/meshes/a.stl', 'hand/urdf/a.urdf', 'hand/urdf/B.URDF'])
    expect(ws.urdfs.map((f) => f.path)).toEqual(['hand/urdf/a.urdf', 'hand/urdf/B.URDF'])
    expect(ws.urdfs[0].text).toBe('<robot name="a"/>')
    expect(ws.hasMeshes).toBe(true)
  })

  it('只选了单个 URDF：来源是文件名，没有 meshes', async () => {
    const ws = await fromFileList([Object.assign(new File(['<robot name="a"/>'], 'a.urdf'))])
    expect(ws.label).toBe('a.urdf')
    expect(ws.urdfs).toHaveLength(1)
    expect(ws.hasMeshes).toBe(false)
  })

  it('只有 xacro：找不到 URDF，但记下 xacro 的数量用来提示', async () => {
    const ws = await fromFileList([fakeFile('r/hand.urdf.xacro', '<robot/>'), fakeFile('r/a.xacro', '<robot/>')])
    expect(ws.urdfs).toEqual([])
    expect(ws.xacro).toBe(2)
  })

  it('Windows 风格的反斜杠路径会统一成 /', async () => {
    const ws = await fromFileList([fakeFile('hand\\urdf\\a.urdf', '<robot/>')])
    expect(ws.files[0].path).toBe('hand/urdf/a.urdf')
  })
})

describe('拖放文件夹（webkitGetAsEntry）', () => {
  it('目录分批返回时要一直读到空为止，不能只读第一批', async () => {
    const urdf = dirEntry('hand/urdf', [fileEntry('hand/urdf/a.urdf', '<robot name="a"/>')])
    const meshes = dirEntry(
      'hand/meshes',
      ['a', 'b', 'c', 'd', 'e'].map((n) => fileEntry(`hand/meshes/${n}.stl`)),
      2,
    )
    const root = dirEntry('hand', [urdf, meshes, dirEntry('hand/.git', [fileEntry('hand/.git/HEAD')])], 1)
    const ws = await fromDataTransfer(dt([root]))
    expect(ws.label).toBe('hand')
    expect(ws.files.map((f) => f.path)).toEqual(['hand/meshes/a.stl', 'hand/meshes/b.stl', 'hand/meshes/c.stl', 'hand/meshes/d.stl', 'hand/meshes/e.stl', 'hand/urdf/a.urdf'])
    expect(ws.urdfs[0].text).toBe('<robot name="a"/>')
  })

  it('读目录失败（比如 file:// 页面里的 EncodingError）：给出中文说明，指向“选择文件夹”，并带上原始错误', async () => {
    const bad = {
      isFile: false,
      isDirectory: true,
      name: 'hand',
      fullPath: '/hand',
      createReader: () => ({ readEntries: (_ok: unknown, fail: (e: unknown) => void) => fail(new DOMException('A URI supplied to the API was malformed', 'EncodingError')) }),
    } as unknown as FileSystemDirectoryEntry
    const err = await fromDataTransfer(dt([bad])).catch((e) => e)
    expect(err).toBeInstanceOf(ReadError)
    expect(err.message).toContain('选择文件夹')
    expect(err.message).toContain('npm run preview')
    expect(err.message).toContain('EncodingError')
  })

  it('只拖了散文件、目录接口不可用时：退回用 dt.files，文件照样能读', async () => {
    const entry = { isFile: true, isDirectory: false, name: 'a.urdf', fullPath: '/a.urdf', file: (_ok: unknown, fail: (e: unknown) => void) => fail(new DOMException('x', 'EncodingError')) } as unknown as FileSystemFileEntry
    const f = new File(['<robot name="a"/>'], 'a.urdf')
    const data = { items: [{ webkitGetAsEntry: () => entry }], files: [f] } as unknown as DataTransfer
    const ws = await fromDataTransfer(data)
    expect(ws.urdfs.map((x) => x.path)).toEqual(['a.urdf'])
    expect(ws.urdfs[0].text).toBe('<robot name="a"/>')
  })

  it('拖进来的是散的文件，不是文件夹', async () => {
    const ws = await fromDataTransfer(dt([fileEntry('a.urdf', '<robot/>'), fileEntry('b.urdf', '<robot/>')]))
    expect(ws.urdfs.map((f) => f.path)).toEqual(['a.urdf', 'b.urdf'])
    expect(ws.label).toBe('2 个文件')
  })
})

describe('buildWorkspace', () => {
  it('只有 URDF、没有别的文件时 hasMeshes 为 false', () => {
    const ws = buildWorkspace('x', [{ path: 'a.urdf', size: 1, text: '' }])
    expect(ws.hasMeshes).toBe(false)
  })
})
