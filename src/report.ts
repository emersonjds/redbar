// Pure renderers: string in/out, no disk access. Callers (scripts/*, cli.ts) do the writing.
import type { Inspection } from './engine.js'
import { severity, type Severity } from './severity.js'
import type { Gap, TestKind } from './types.js'

// The band leads the sort, the score breaks ties inside it. Ranking by raw score alone put a
// CRITICAL row below a MEDIUM one — which makes the band decoration instead of triage.
const RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 }

function ranked(gaps: Gap[]): Gap[] {
  return [...gaps].sort((a, b) => RANK[severity(a)] - RANK[severity(b)] || b.score - a.score)
}

/** `.redbar/gaps.json` content — the agent-facing contract. Keep the shape stable. */
export function renderJson(inspection: Inspection): string {
  const { language, runner, base, gaps } = inspection
  return JSON.stringify(
    {
      language: language.id,
      runner: runner.name,
      base,
      generatedFrom: { reportPath: runner.reportPath },
      gaps: gaps.map((g) => ({ ...g, severity: severity(g) })),
    },
    null,
    2,
  )
}

/** what scripts/try.ts prints today. */
export function renderText(inspection: Inspection, top = 20): string {
  const { language, runner, base, gaps } = inspection
  const lines = [
    `language: ${language.name}`,
    `runner:   ${runner.name}`,
    `base:     ${base}`,
    `gaps:     ${gaps.length}`,
    '',
  ]

  for (const g of gaps.slice(0, top)) {
    const mark = g.fullyUncovered ? '!' : ' '
    const symbol = g.symbol ?? '(no symbol)'
    lines.push(
      `${mark} [${String(g.score).padStart(3)}] ${g.kind.padEnd(11)} ${g.file}:${g.lines[0]} ${symbol} ` +
        `— ${g.lines.length} line(s), ${g.branches} branch(es)`,
    )
  }

  return lines.join('\n')
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// the top of the list is the whole product — a long tail nobody reads is not a report
const TOP = 40

const row = (g: Gap, i: number) => {
  const sev = severity(g)
  return `
    <tr class="sev-row-${sev}">
      <td class="rank">${i + 1}</td>
      <td><span class="sev sev-${sev}">${sev}</span></td>
      <td class="score">${g.score}</td>
      <td><span class="kind kind-${g.kind}">${g.kind}</span></td>
      <td class="sym">${g.symbol ? esc(g.symbol) : '<em>—</em>'}</td>
      <td class="file"><span class="path">${esc(g.file)}</span><span class="ln">:${g.lines[0]}</span></td>
      <td class="num">${g.lines.length}</td>
      <td class="num">${g.branches}</td>
    </tr>`
}

/** Self-contained HTML report with a print stylesheet — the browser makes the PDF. */
export function renderHtml(inspection: Inspection, repoName: string): string {
  const { language, runner, base, gaps } = inspection
  const byKind = (k: TestKind) => gaps.filter((g) => g.kind === k)
  const bySeverity = (s: Severity) => gaps.filter((g) => severity(g) === s)
  const untested = gaps.filter((g) => g.fullyUncovered)
  const uncoveredLines = gaps.reduce((n, g) => n + g.lines.length, 0)
  const files = new Set(gaps.map((g) => g.file)).size
  const rankedGaps = ranked(gaps)

  return `<meta charset="utf-8">
<title>redbar — ${esc(repoName)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    font: 14px/1.5 ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
    color: #16181d; background: #fff; margin: 0; padding: 40px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .wrap { max-width: 1000px; margin: 0 auto; }
  header { border-bottom: 3px solid #16181d; padding-bottom: 18px; margin-bottom: 28px; }
  h1 { font-size: 30px; margin: 0 0 4px; letter-spacing: -0.02em; }
  h1 .bar { color: #d92b2b; }
  .sub { color: #5c6370; font-size: 13px; }
  .meta { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 8px 22px; font-size: 12.5px; }
  .meta div { color: #5c6370; }
  .meta b { color: #16181d; font-weight: 600; }

  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
  .stat { border: 1px solid #e2e5ea; border-radius: 8px; padding: 14px 16px; border-top-width: 3px; }
  .stat .n { font-size: 26px; font-weight: 650; letter-spacing: -0.02em; }
  .stat .l { font-size: 11.5px; color: #5c6370; text-transform: uppercase; letter-spacing: .05em; }
  .stat .d { font-size: 10.5px; color: #9aa1ac; margin-top: 5px; line-height: 1.35; }

  /* one hue per band, used by the tiles, the pills and the row tint */
  .stat.sev-critical { border-top-color: #c0392b; background: #fdf4f3; }
  .stat.sev-critical .n { color: #c0392b; }
  .stat.sev-high     { border-top-color: #d97706; background: #fdf9f2; }
  .stat.sev-high .n  { color: #b45309; }
  .stat.sev-medium   { border-top-color: #ca9a04; }
  .stat.sev-low      { border-top-color: #cbd0d6; }

  .sev {
    display: inline-block; min-width: 62px; text-align: center; padding: 1px 7px;
    border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .05em;
  }
  .sev-critical { background: #c0392b; color: #fff; }
  .sev-high     { background: #f6d9b8; color: #8a4a06; }
  .sev-medium   { background: #f8ecc4; color: #7a5c04; }
  .sev-low      { background: #eef0f3; color: #6b727c; }

  tbody tr.sev-row-critical { background: #fdf4f3; }
  tbody tr.sev-row-high     { background: #fdfaf5; }

  .lead { background: #f7f8fa; border-left: 3px solid #16181d; padding: 12px 16px;
          margin-bottom: 26px; font-size: 13.5px; }
  .lead b { font-weight: 650; }

  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  thead th {
    text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em;
    color: #5c6370; border-bottom: 1.5px solid #d6dae0; padding: 0 8px 7px; font-weight: 600;
  }
  tbody td { padding: 7px 8px; border-bottom: 1px solid #eef0f3; vertical-align: baseline; }
  .rank { color: #9aa1ac; font-variant-numeric: tabular-nums; }
  .score { font-weight: 650; font-variant-numeric: tabular-nums; }
  .num { text-align: right; font-variant-numeric: tabular-nums; color: #5c6370; }
  .flag { color: #c22; text-align: center; }
  .sym { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-weight: 600; }
  .file { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11.5px; }
  .file .path { color: #5c6370; }
  .file .ln { color: #9aa1ac; }

  .kind {
    display: inline-block; padding: 1px 7px; border-radius: 20px;
    font-size: 10.5px; font-weight: 600; letter-spacing: .02em;
  }
  .kind-unit        { background: #e8f2fd; color: #1a5fa8; }
  .kind-integration { background: #fdf1e3; color: #a3620d; }
  .kind-e2e         { background: #f2e9fb; color: #6b3aa8; }

  footer { margin-top: 30px; padding-top: 14px; border-top: 1px solid #e2e5ea;
           color: #8b929c; font-size: 11.5px; }
  footer b { color: #5c6370; }

  @media print {
    body { padding: 0; font-size: 11px; }
    @page { margin: 14mm; size: A4; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
    .stats { break-inside: avoid; }
  }
</style>

<div class="wrap">
  <header>
    <h1>red<span class="bar">bar</span></h1>
    <div class="sub">Test coverage gaps in what changed — <b>${esc(repoName)}</b></div>
    <div class="meta">
      <div>language <b>${esc(language.name)}</b></div>
      <div>runner <b>${esc(runner.name)}</b></div>
      <div>base <b>${esc(base)}</b></div>
    </div>
  </header>

  <div class="stats">
    <div class="stat sev-critical">
      <div class="n">${bySeverity('critical').length}</div><div class="l">critical</div>
      <div class="d">no coverage · 5+ branches</div>
    </div>
    <div class="stat sev-high">
      <div class="n">${bySeverity('high').length}</div><div class="l">high</div>
      <div class="d">no coverage · has a decision</div>
    </div>
    <div class="stat sev-medium">
      <div class="n">${bySeverity('medium').length}</div><div class="l">medium</div>
      <div class="d">untested, or dense but partly covered</div>
    </div>
    <div class="stat sev-low">
      <div class="n">${bySeverity('low').length}</div><div class="l">low</div>
      <div class="d">partly covered, simple</div>
    </div>
  </div>

  <div class="lead">
    Every row is code that <b>changed on this branch</b> and that <b>no test executes</b>.
    <b>${gaps.length}</b> gaps across <b>${files}</b> files, <b>${uncoveredLines}</b> uncovered
    lines, <b>${untested.length}</b> of them with no coverage at all.
    <br><br>
    <b>Criticality</b> comes from two facts, not from an opinion: whether the symbol has
    <em>any</em> coverage, and how much branching hides inside it. Untested branching logic is
    the worst case — every branch is a path nothing has ever executed. The threshold of 5 is
    McCabe's: past it, a function needs a test.
    <br><br>
    By kind: <b>${byKind('unit').length}</b> unit ·
    <b>${byKind('integration').length}</b> integration ·
    <b>${byKind('e2e').length}</b> e2e.
    <b>No language model produced any of these numbers</b> — they come from the coverage report
    and <code>git diff</code>.
  </div>

  <table>
    <thead>
      <tr>
        <th></th><th>Criticality</th><th>Score</th><th>Kind</th><th>Symbol</th><th>File</th>
        <th style="text-align:right">Lines</th>
        <th style="text-align:right">Branches</th>
      </tr>
    </thead>
    <tbody>${rankedGaps.slice(0, TOP).map(row).join('')}
    </tbody>
  </table>

  <footer>
    ${
      gaps.length > TOP
        ? `Showing the top <b>${TOP}</b> of <b>${gaps.length}</b> gaps by score. `
        : ''
    }Generated by <b>redbar</b> — the analysis is zero-LLM.
  </footer>
</div>
`
}
