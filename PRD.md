# Product Requirements Document — URDF Checker Webber

| Field | Value |
|-------|-------|
| Version | v0.2 (draft) |
| Status | Approved for P0 · P1-UI pending product owner approval |
| Owner | Fuyan Feiyan |
| Deliverable | `dist/index.html` (single file) |

---

## 1. Background & Goal

### Observed Problem

Every time the robotics team builds or modifies a URDF for the L20 dexterous hand, the engineer must manually verify: XML syntax, parent/child link references, naming conventions, joint limit bounds, axis directions, and mesh file paths. This is done by hand in VS Code, line by line.

### Who Is Affected

Modeling engineers, every time they prepare a new URDF for the simulation team. A single broken `parent` / `child` reference causes the simulation to crash — fixing and re-sending takes a minimum of 30 minutes of back-and-forth.

### Product Decision

Build a **pure-frontend web tool** that runs 6 automated checks in the browser. Users select a folder, wait ~1 second, and get a complete, visualized result set. All parsing and rendering happens locally — files are never uploaded, never sent through a server.

### Observable Outcome

- An engineer can run all 6 checks on any URDF without writing any code.
- Every issue links directly to the offending XML line.
- Results can be exported as a Markdown report and attached to an MR / Jira / Slack conversation.

---

## 2. Scope

### P0 — Minimal Complete Journey (delivered, v0.1)

1. **Entry condition**: user opens `dist/index.html` in Chrome / Edge.
2. **User actions**: Select Folder → see results → click any issue → export Markdown report.
3. **Completion evidence**: the stage shows a verdict number (errors / warnings / all pass), every issue is clickable, and Export Report downloads `report.md`.
4. **Recovery path**: a broken XML causes checks 2–6 to auto-skip with a clear message ("XML parse error — fix check #1 first").

### What Is Explicitly **Not** Done (v0.1)

- No 3D live preview — only the 2D hand map.
- No multi-URDF batch analysis — one file at a time.
- No team-shared configuration — rules persist only in local `localStorage`.
- No dark theme — planned for v0.3.
- No command-line / CI integration — planned for v0.3.

### v0.2 Iteration Roadmap (pending product owner approval)

| Priority | Item | Source | Impact |
|----------|------|--------|--------|
| **P1-UI** | Persistent file-status bar — always shows which folder/file is currently being analyzed, never disappears after first load | Product Owner §1 | Reduces "what am I looking at?" friction |
| **P1-UI** | Statistics cards (link / joint / mesh count) grouped with a single "URDF Structure" title | Product Owner §2 | Eliminates visual noise |
| **P1-UI** | Hand map layout dynamically adapts to any DOF count (not hardcoded for 5-finger dexterous hands only) | Product Owner §3.1 | Supports 3-DOF grippers, 7-DOF hands, etc. |
| **P1-UI** | Root node simplified to `hand_base_link` only — `wrist_base_link` removed (灵心巧手 products have no wrist joints) | Product Owner §3.2 | Matches actual hardware |
| **P1-UI** | Per-link error/warning count badge on each hand map node + **double-click opens the issue list filtered to that node** | Product Owner §3.3 | Jump from visual to textual results |
| **P1-UI** | 6-item bento grid → **extensible label + dropdown list** layout — supports N check items without re-layout | Product Owner §4 | Future-proofing for new checks |
| **P1-UI** | Merge regions 2 × 3 into one unified expandable list (eliminates redundancy between bento grid and issue list) | Product Owner §5 | Cleaner UI |
| **P1-Engine** | Plugin-style check architecture + symmetry check plugin (integrates with existing mirror script) | Product Owner §6 | Zero framework changes for future checks |
| **P1-UI** | Report export user-flow: button + clear success feedback + document format | Product Owner §7 | User who hasn't experimented is unclear on format — document it prominently |
| **P1-UI** | Rule Configuration demoted to **advanced expert-only** — hidden by default, unlock via `?expert=1` or top-bar "Advanced" toggle. Named "Expert Rules" | Product Owner §8 | First-time users shouldn't be intimidated by low-level knobs; rules page is product-internal, not user-facing |
| **P1-Engine** | Enable limit sign rules + axis direction rules (currently `partial` — framework exists, only rules table missing) | Original plan + Product Owner Q1/Q2 | Completes check coverage |
| **P1-Engine** | 3D live preview via three.js | Original plan | More intuitive visualization |

---

## 3. Roles & Core Objects

### Roles

| Role | Can Do | Cannot Do |
|------|--------|-----------|
| **URDF Developer** (modeling engineer) | Upload folder, switch files, edit rules, view results, export report | Cannot let others see their files (v0.1 is local-only; v0.2+ may add collaboration) |
| **URDF Reviewer** (alg/simulation engineer) | Evaluate Markdown report pass/fail | Cannot mark approve/reject in the web UI (v0.2+) |
| **Rule Maintainer** (architecture lead) | Owns naming standard, limit sign rules, axis direction rules | v0.1 can only edit locally; cannot push to team-mates |

### Core Objects

| Object | Definition | Key Fields |
|--------|------------|------------|
| **URDF Folder** | Directory selected by user containing `.urdf` files + `/meshes/` | relative paths, file sizes, file types |
| **Analysis** | Complete result of running all checks | robot name, link/joint/mesh counts, 6 × CheckResult |
| **Issue** | A single problem point | check ID, level (`error` / `warning` / `info`), message, target (e.g. `"joint index_pip"`), XML line number |
| **Config** | User-customizable check rules | naming convention entries, limit sign rules, axis direction rules |

### Check Status State Machine

| Status | Meaning | When It Appears |
|--------|---------|-----------------|
| **pass** | No issues found | All checks OK |
| **warning** | Only warnings, no errors | Non-blocking issues (e.g. naming style drift) |
| **error** | At least one error | Blocking issues (e.g. bad parent/child causing simulation crash) |
| **partial** | No errors/warnings, but check depends on unconfigured rules | v0.1 limit and axis checks are in this state |
| **skipped** | Upstream check failed, so this one cannot run | XML parse error → checks 2–6 skip |

---

## 4. Functional Requirements

### FR-01 · Folder Selection & Parsing ✅ Delivered

**Purpose**: zero-setup file ingestion.

**Trigger**: open app → click Select Folder, or click Load Demo on the landing page.

**Rules**:
- Recursively finds all `.urdf` / `.xacro` files.
- Other files (`.obj`, `.stl`, `.png`, …) are indexed as meshes — not rendered.
- Top bar shows a file dropdown to switch between URDFs in the same folder.
- Folder drag-drop works **only** under `vite preview` (HTTP protocol). The `file://` protocol blocks drag-drop for security — only the button picker works there.

**Result**: enters the analysis flow (FR-02). XML parse failure → check #1 runs alone, checks 2–6 auto-skip.

**v0.2 iteration**: persistent file-status bar (see §2).

---

### FR-02 · 6-Automated-Check Engine ✅ Delivered

**Purpose**: deterministic, repeatable, traceable validation.

**Trigger**: FR-01 produces a valid URDF → all checks run automatically.

**Rules** (fixed order; later checks skipped if an earlier one fails):

| # | Check | Code | Checks | v0.1 Status |
|---|-------|------|--------|-------------|
| 1 | Syntax completeness | `checks/syntax.ts` | XML syntax, required fields, duplicate names | **pass** |
| 2 | Parent / child reference | `checks/reference.ts` | Links exist, tree structure, root node | **pass** |
| 3 | Naming convention | `checks/naming.ts` | Names match unified standard in `config.ts` | **pass** |
| 4 | Joint limit bounds | `checks/limit.ts` | `lower` ≤ `upper`, not default values, sign rules | **partial** (sign rules not enabled) |
| 5 | Joint axis | `checks/axis.ts` | Axis present, not zero vector, correct direction | **partial** (direction rules not enabled) |
| 6 | Mesh files | `checks/mesh.ts` | `visual` / `collision` references resolvable in meshes folder | **pass** |

**Exception handling**: any check that itself crashes shows `error` status with the message *"This is a bug in the tool — send this URDF to the developer"*. Other 5 checks continue.

---

### FR-03 · Visual Presentation ✅ Delivered

**Purpose**: make issues visible without scrolling through a long list.

**Layout (top → bottom, v0.1 + v0.2 iterations marked)**:

1. **Big verdict number**: error count (top), otherwise warning count, otherwise "All pass".
2. **Statistics cards** — link / joint / mesh count (v0.1 scattered; v0.2 grouped with "URDF Structure" title).
3. **Hand map**: 2D diagram drawn from naming standard. Solid green/yellow/red = pass/warning/error; dashed red circle = missing node; dashed gray = optional. Hover → tooltip; click → filter issues to this node only; click again → unfilter.
4. **Bento grid**: 6 check blocks. Block with most issues gets the darkest background (score = error × 1000 + warning). Click block → filter to that check only.
5. **Issue list**: each check shows 3 by default; click to expand.

**v0.2 iteration**: hand map dynamic layout (§2), root node simplification (§2), per-node error badge + double-click jump (§2), bento → extensible list (§2), merge regions 2 × 3 (§2).

---

### FR-04 · Source Locator Drawer ✅ Delivered

**Purpose**: one-second jump from issue to offending XML line.

**Trigger**: click any issue item.

**Rules**:
- Right-side drawer slides in (≈60% of screen width).
- **Top half**: syntax-highlighted XML (JetBrains Mono). Error lines → red marker at line number. Warning lines → yellow marker. Auto-scrolls to the target line.
- **Bottom half**: naming convention comparison table (standard vs actual name).
- Keyboard focus is trapped inside the drawer. `Esc` closes it.

---

### FR-05 · Expert Rule Configuration ✅ Delivered — being demoted to advanced (v0.2)

**Purpose** (expert-only, not for general users): support different naming standards per project / per hand type, tune limit sign rules and axis direction rules.

> **Product Owner decision (§8)**: Rule configuration is an **expert/backend-level** feature. A first-time user unfamiliar with URDF should not see low-level knobs on their first visit. v0.2 demotes Rules to an "advanced expert" toggle: hidden by default, enabled only via a top-bar `Advanced` toggle or URL parameter `?expert=1`. Renamed from **Rules** → **Expert Rules** to signal that this is not the place for beginners.

**Trigger** (v0.1): click **Rules** in the top bar.

**Trigger** (v0.2): top-bar `Advanced` toggle ON → **Expert Rules** button appears. Or open `?expert=1` URL directly.

**Rules**:
- Dialog to edit naming convention entries, enable/disable limit sign rules, enable/disable axis direction rules.
- Changes persist to `localStorage` — auto-loaded on next open.
- Rule changes **do not auto-trigger re-analysis** (prevents accidental overwrite). User must manually re-trigger.
- limit and axis rules default to **disabled** → those checks report `partial`.
- When advanced mode is OFF and rules are present in `localStorage`, the app still uses them — they just aren't editable from the UI. This way an expert can configure once, then share the link with a beginner who never needs to see the dialog.

---

### FR-06 · Markdown Report Export ✅ Delivered

**Purpose**: shareable, archiveable results — attach to MR, Jira, Slack, or email.

> **Product Owner decision (§7)**: the report format was not widely understood. v0.2 adds explicit success feedback ("Report downloaded → open `urdf-check-report.md` in your editor") and documents the format prominently.

**Trigger**: click **Export Report** in the top bar.

**Rules**:
- Generates `urdf-check-report.md`. The **real format below** (from running against the demo dataset).
- Line numbers come from the current analysis snapshot — re-check is not triggered.
- Download uses the browser's default download behavior, no server involved.

**Report Format (v0.1, verified by running against demo dataset)**:

```
# URDF 检查报告

- 生成时间：2026/11/2 20:07:26
- 来源：示例 demo_hand（30 个文件，3 个 URDF）

## 总览

| 文件 | 1 格式完整性 | 2 parent/child | 3 命名规范 | 4 limit | 5 axis | 6 mesh | 错误 | 警告 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| demo_hand/urdf/hand_1_buggy.urdf | 错误 | 错误 | 错误 | 错误 | 错误 | 错误 | 17 | 10 |
| demo_hand/urdf/hand_2_clean.urdf | 通过 | 通过 | 通过 | 待配置 | 待配置 | 通过 | 0 | 0 |
| demo_hand/urdf/hand_3_broken_xml.urdf | 错误 | 跳过 | 跳过 | 跳过 | 跳过 | 跳过 | 1 | 0 |

## demo_hand/urdf/hand_1_buggy.urdf

robot：demo_hand_buggy；27 个 link、25 个 joint；根 link：wrist_base_link

### 1. 格式完整性　[错误]

发现 2 个问题

- **错误**（第 341 行 · link index_proximal）：link 名重复 → 同一类的名字必须唯一
- **错误**（第 457 行 · joint middle_pip）：joint type "revolut" 不合法 → 是不是想写 "revolute"？

### 2. parent / child　[错误]

发现 3 个问题

- **错误**（第 487 行 · joint ring_pip）：parent link "ring_proxmal" 不存在 → 是不是想写 "ring_proximal"？
- ...（每个问题一条，含行号、目标、消息、修复提示）

### 6. mesh 文件　[错误]

引用了 54 处 mesh，2 处找不到

- **错误**（第 176 行 · link index_distal · visual）：找不到 "package://.../index_distl.stl" → 是不是想写 "index_distal.stl"？
- ...
```

**Key format notes** (documented so no one has to guess):
- Report is one file, named `urdf-check-report.md`. If multiple URDFs were in the folder, **one overview table at the top + one section per file**, each with all 6 checks fully expanded.
- Each issue has: severity badge (`错误` / `警告` / `提示`), source location (line number + target), message, and a **fix hint** in the `→` arrow.
- Checks that are `skipped` (because XML parse failed) still show their section — they list the reason ("XML 无法解析，先修好检查 1").
- Checks that are `partial` (rules not configured) still list what they **did** check and explicitly say what's missing.
- Opening the `.md` in GitHub, VS Code, Obsidian, or any Markdown viewer renders the table and headings natively. Copy-paste into a Slack or MR comment preserves all structure.

---

### FR-07 · Plugin-Style Check Architecture ⏳ v0.2

**Purpose**: the product owner already has a mirror script for symmetry checking — the web tool must integrate it. Future checks (#7, #8, …) must not require rewriting the UI or report generator.

**Product Decision**: all checks register via a `CheckPlugin` interface. Any new plugin automatically appears in the UI, the verdict aggregator, and the report export — zero framework changes.

**Plugin Interface**:

```typescript
interface CheckPlugin {
  id: CheckId                    // 'syntax' | 'reference' | ... | 'symmetry' | ...
  title: string                  // Display name
  group: CheckGroup              // 'basic' | 'kinematic' | 'symmetry' | ...
  run(model: URDFModel, config: Config): CheckResult
}
```

**Compatibility requirement**: symmetry check input/output must match the existing mirror script's format — no two parallel implementations of the same logic.

---

## 5. Shared Rules

### Verdict Aggregation

| Scenario | Rule |
|----------|------|
| Single check status | Any error → `error`; only warnings → `warning`; none → `pass`; rules unconfigured → `partial`; skipped → `skipped` |
| Overall verdict | Errors → "Found N errors"; only warnings → "No errors, N warnings"; no errors but partial → "No issues found, but XX/YY checks incomplete"; all pass → "All 6 checks pass" |
| Hand map node color | Precedence: error (solid red) → warning (solid yellow) → pass (solid green) → missing (dashed red) → optional (dashed gray) |
| Bento dark block | score = `error × 1000 + warning`; highest score gets the darkest background |

### Design System

| Token | Values |
|-------|--------|
| Spacing | `8 / 16 / 24 / 40 / 64 / 120 / 160` (`--s1`…`--s7`) |
| Font sizes | `12 / 14 / 20 / 32 / 56` |
| Radii | `8 / 12 / 16 / 24` |
| Glass effect | Only on floating elements; auto-fallback to nearly-opaque white when `backdrop-filter` unsupported |
| State colors | Only on status dots and labels; never large blocks; WCAG 4.5:1 contrast |

---

## 6. Open Questions

| # | Question | Impact | Decider |
|---|----------|--------|---------|
| Q1 | What are the exact limit sign rule criteria? Do different hand types have different rules? | Blocks v0.2 completion of check #4 | Hardware lead |
| Q2 | What are the exact axis direction rule criteria? | Blocks v0.2 completion of check #5 | Simulation lead |
| Q3 | Should `.xacro` (macro-expanded URDF) be supported? Currently only raw `.urdf`. | Determines whether a xacro preprocessor is needed | URDF developer |
| Q4 | Should the 3D preview animate joint motion in real-time, or render static meshes only? | Static ≈ 2 days of work; animated ≈ 5 days | Product owner |
| Q5 | Should a "one-click fix suggestion" be added? e.g. naming violation → suggested rename. | Not in v0.2 scope; consideration for v0.3 | Product owner |
