import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Bento } from './components/Bento'
import { ConfigDialog } from './components/ConfigDialog'
import { Drawer, type DrawerTab } from './components/Drawer'
import { Header } from './components/Header'
import { ExtraNames, type Focus } from './components/HandMap'
import { IssueList } from './components/IssueList'
import { Stage } from './components/Stage'
import { Welcome } from './components/Welcome'
import { FileCode2, Table2 } from 'lucide-react'
import { defaultConfig, parseConfig, type Config } from './core/config'
import { buildReport } from './core/report'
import { analyze, type Analysis } from './core/run'
import { buildMapData, focusMatches, lineMarks } from './core/structure'
import { statementLine, worstCheck } from './core/summary'
import { CHECKS } from './core/types'
import type { CheckId, Level } from './core/types'
import { download } from './io/download'
import { ReadError, buildWorkspace, fromDataTransfer, fromFileList, type Workspace } from './io/readFiles'
import { buildDemoFiles } from './samples/demo'
import { baseName } from './components/common'

const CONFIG_KEY = 'urdf-check:config:v1'
const NO_MARKS: ReadonlyMap<number, Level> = new Map()

function loadConfig(): Config {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) {
      const p = parseConfig(raw)
      if (p.config) return p.config
    }
  } catch {
    // 隐私模式 / 禁用存储时读不到，用默认配置
  }
  return defaultConfig()
}

function saveConfig(c: Config): boolean {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(c))
    return true
  } catch {
    return false
  }
}

export default function App() {
  const [ws, setWs] = useState<Workspace | null>(null)
  const [config, setConfig] = useState<Config>(loadConfig)
  const [current, setCurrent] = useState<string | null>(null)
  const [filter, setFilter] = useState<CheckId | 'all'>('all')
  const [active, setActive] = useState<{ key: string; line: number | null } | null>(null)
  const [drawer, setDrawer] = useState<DrawerTab | null>(null)
  const [focus, setFocus] = useState<Focus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [cfgOpen, setCfgOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const folderRef = useRef<HTMLInputElement>(null)
  const filesRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  // 文件夹里的所有 URDF 一次性分析好，下拉里才能直接显示每个文件的结论；规则一改就重新算
  const items = useMemo(() => {
    if (!ws) return []
    return ws.urdfs.map((f) => ({
      path: f.path,
      analysis: analyze({ path: f.path, text: f.text ?? '', files: ws.hasMeshes ? ws.files : null, config }),
    }))
  }, [ws, config])

  const item = items.find((i) => i.path === current) ?? items[0] ?? null
  const analysis: Analysis | null = item?.analysis ?? null
  const map = useMemo(() => (analysis ? buildMapData(analysis, config) : null), [analysis, config])
  const marks = useMemo(() => (analysis ? lineMarks(analysis) : NO_MARKS), [analysis])
  // 选中结构图节点后，和它有关的问题有几条，卡片里的按钮显示这个数
  const relatedCount = useMemo(() => (analysis && focus ? analysis.results.flatMap((r) => r.issues).filter((i) => focusMatches(i, focus.names)).length : 0), [analysis, focus])
  const issuesRef = useRef<HTMLElement>(null)
  const worst = useMemo(() => {
    if (!analysis) return null
    const id = worstCheck(analysis.results)
    const r = analysis.results.find((x) => x.id === id)
    return id && r ? { title: CHECKS.find((m) => m.id === id)?.title ?? id, n: r.issues.filter((i) => i.level !== 'info').length } : null
  }, [analysis])
  // XML 解析失败的文件没有名字可对照，抽屉只能看源码
  const shownDrawer: DrawerTab | null = drawer && analysis && !analysis.names ? 'source' : drawer

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(t)
  }, [notice])

  const resetView = () => {
    setFilter('all')
    setActive(null)
    setFocus(null)
    setDrawer(null)
  }

  const open = useCallback(async (job: () => Promise<Workspace>) => {
    setBusy(true)
    setError(null)
    try {
      const next = await job()
      setWs(next)
      setCurrent(next.urdfs[0]?.path ?? null)
      setFilter('all')
      setActive(null)
      setFocus(null)
      setDrawer(null)
      if (!next.urdfs.length) {
        setError(
          next.xacro
            ? `没有找到 .urdf 文件，但有 ${next.xacro} 个 .xacro。xacro 需要先展开成 .urdf（例如 xacro robot.urdf.xacro > robot.urdf），再来检查。`
            : '没有找到 .urdf 文件。请确认选的文件夹里有 .urdf。',
        )
      }
    } catch (e) {
      setError(e instanceof ReadError ? e.message : `读取文件失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }, [])

  const openDemo = () => void open(async () => buildWorkspace('示例 demo_hand', buildDemoFiles()))

  const onPickFolder = (list: FileList | null) => {
    if (list && list.length) void open(() => fromFileList(list))
    if (folderRef.current) folderRef.current.value = ''
  }
  const onPickFiles = (list: FileList | null) => {
    if (list && list.length) void open(() => fromFileList(list))
    if (filesRef.current) filesRef.current.value = ''
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    if (busy) return
    // 必须在事件处理函数里同步取出 dt.items，之后它就失效了
    const job = fromDataTransfer(e.dataTransfer)
    void open(() => job)
  }
  const onDragEnter = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    dragDepth.current++
    setDragging(true)
  }
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  const applyConfig = (c: Config) => {
    setConfig(c)
    setCfgOpen(false)
    setFocus(null) // 结构图的节点按命名标准的下标认，标准改了，旧的选中就不作数了
    setNotice(saveConfig(c) ? '规则已应用，并保存在这个浏览器里' : '规则已应用，但浏览器禁止保存，刷新后会恢复默认')
  }

  const exportReport = () => {
    if (!ws) return
    download('urdf-check-report.md', buildReport(ws.label, ws.files.length, items), 'text/markdown')
  }

  // 点一条问题：抽屉滑出，源码跳到出错的那一行
  const pick = (key: string, line: number | null) => {
    setActive({ key, line })
    if (line !== null) setDrawer('source')
  }

  const hasResults = ws !== null && (items.length > 0 || busy)

  return (
    <div className="app" onDragEnter={onDragEnter} onDragOver={(e) => e.preventDefault()} onDragLeave={onDragLeave} onDrop={onDrop}>
      <Header
        busy={busy}
        items={items}
        current={item?.path ?? null}
        sourceLabel={ws?.label ?? null}
        onSelect={(p) => {
          setCurrent(p)
          resetView()
        }}
        onFolder={() => folderRef.current?.click()}
        onFiles={() => filesRef.current?.click()}
        onDemo={openDemo}
        onConfig={() => setCfgOpen(true)}
        onExport={exportReport}
      />
      {/* webkitdirectory：选整个文件夹，文件会带上相对路径 */}
      <input ref={folderRef} type="file" hidden multiple onChange={(e) => onPickFolder(e.target.files)} {...{ webkitdirectory: '', directory: '' }} />
      <input ref={filesRef} type="file" hidden multiple accept=".urdf,.xml" onChange={(e) => onPickFiles(e.target.files)} />

      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
      {busy && (
        <div className="banner" role="status">
          正在读取文件…
        </div>
      )}
      {error && (
        <div className="banner warn" role="alert">
          {error}
        </div>
      )}

      {!hasResults ? (
        <Welcome busy={busy} onFolder={() => folderRef.current?.click()} onFiles={() => filesRef.current?.click()} onDemo={openDemo} />
      ) : (
        item &&
        analysis && (
          <main key={item.path}>
            <Stage analysis={analysis} path={item.path} map={map} focus={focus} onFocus={setFocus} relatedCount={relatedCount} onJump={() => issuesRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })} />

            <section className="statement wrap" aria-label="概述">
              <span className="eyebrow">概览</span>
              <p>{statementLine(analysis)}</p>
              {worst && <p className="fade">最重的一项是「{worst.title}」，有 {worst.n} 个问题，下面用深色标出。</p>}
            </section>

            <div className="wrap">
              <h2 className="sr-only">6 项检查</h2>
              <Bento results={analysis.results} filter={filter} onFilter={setFilter} />
            </div>

            <section className="band wrap" aria-label="问题" ref={issuesRef}>
              <div className="band-head">
                <div>
                  <span className="eyebrow">问题</span>
                  <h2>{focus ? '和它有关的问题' : filter === 'all' ? '需要你看一眼的地方' : '这一项的问题'}</h2>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn sm" onClick={() => setDrawer('source')}>
                    <FileCode2 size={16} aria-hidden="true" />
                    查看源码
                  </button>
                  <button type="button" className="btn sm" onClick={() => setDrawer('table')} disabled={!analysis.names}>
                    <Table2 size={16} aria-hidden="true" />
                    命名对照表
                  </button>
                </div>
              </div>
              {map && <ExtraNames map={map} focus={focus} onFocus={setFocus} />}
              <IssueList results={analysis.results} filter={filter} activeKey={active?.key ?? null} onPick={pick} focus={focus} onClearFocus={() => setFocus(null)} />
            </section>
            <p className="foot wrap">LinkerBot 灵心巧手 · URDF 检查工具</p>
          </main>
        )
      )}

      {shownDrawer && analysis && item && (
        <Drawer tab={shownDrawer} onTab={setDrawer} onClose={() => setDrawer(null)} analysis={analysis} path={baseName(item.path)} config={config} line={active?.line ?? null} marks={marks} />
      )}
      {dragging && (
        <div className="dropmask" aria-hidden="true">
          <div>松开鼠标，读取这个文件夹</div>
        </div>
      )}
      {cfgOpen && <ConfigDialog config={config} onApply={applyConfig} onClose={() => setCfgOpen(false)} />}
    </div>
  )
}
