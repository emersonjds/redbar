// Pure renderers: string in/out, no disk access. Callers (scripts/*, cli.ts) do the writing.
import type { Audit, Category, Check } from './audit.js'
import type { Inspection } from './engine.js'
import { bandReason, scoreArithmetic } from './explain.js'
import { isMeasured, type Outcome, type Verdict } from './outcome.js'
import { kindPriority, profileLabel, type Profile } from './profile.js'
import { ranked, severity, type Severity } from './severity.js'
import type { Gap, TestKind } from './types.js'

/** `.redbar/gaps.json` content — the agent-facing contract. Keep the shape stable. */
export function renderJson(inspection: Inspection): string {
  const { language, runner, base, gaps, stale } = inspection
  return JSON.stringify(
    {
      language: language.id,
      runner: runner.name,
      base,
      // the consumer of gaps.json is an agent — it must be able to see that the ground under this
      // list has moved, not just trust the list
      staleReport: stale === true,
      generatedFrom: { reportPath: runner.reportPath },
      gaps: gaps.map((g) => ({ ...g, severity: severity(g) })),
    },
    null,
    2,
  )
}

/** what scripts/try.ts prints today. */
export function renderText(inspection: Inspection, top = 20): string {
  const { language, runner, base, gaps, stale } = inspection
  const lines = [
    `language: ${language.name}`,
    `runner:   ${runner.name}`,
    `base:     ${base}`,
    `gaps:     ${gaps.length}`,
    ...(stale
      ? [
          '',
          `WARNING: ${runner.reportPath} is older than the source. Code written since the last`,
          `         coverage run is absent from the report — this list is a LOWER BOUND.`,
          `         Regenerate: ${runner.coverageCommand}`,
        ]
      : []),
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

/** The number's provenance, in one line. It is the claim the whole tool rests on — every
 *  renderer carries it, so no audience ever sees the gaps without seeing where they came from. */
const provenance = (inspection: Inspection): string =>
  `From \`${inspection.runner.reportPath}\` × \`git diff ${inspection.base}\`. ` +
  `No language model produced these numbers.`

/** A stable anchor at the top of the comment. The action greps for it to find the comment it
 *  wrote last push and edit it in place — without it, every push stacks one more comment and
 *  the reviewer stops reading them. */
export const MARKER = '<!-- redbar -->'

// a pipe inside a symbol (`a || b`) or a path would end the markdown cell early and shear the
// whole table one column to the left
const mdEsc = (s: string) => s.replace(/\|/g, '\\|')

const cap = (n: number) => (n === Infinity ? '∞' : String(n))

/** GitHub pull request comment. Same numbers as every other renderer, in the only format a PR
 *  can render. No emoji — `AGENTS.md` forbids them in anything this project writes to a PR. */
export function renderMarkdown(
  inspection: Inspection,
  limits?: { maxCritical: number; maxHigh: number },
  top = 20,
): string {
  const { gaps } = inspection
  const count = (s: Severity) => gaps.filter((g) => severity(g) === s).length
  const out = [MARKER, '## redbar', '']

  if (limits) {
    const failed = count('critical') > limits.maxCritical || count('high') > limits.maxHigh
    out.push(
      `**${failed ? 'FAIL' : 'PASS'}** — ${count('critical')} critical (max ${cap(limits.maxCritical)}) · ` +
        `${count('high')} high (max ${cap(limits.maxHigh)})`,
      '',
    )
  }

  if (gaps.length === 0) {
    out.push('No gaps. Everything this branch changed is executed by a test.', '')
    out.push(`<sub>${provenance(inspection)}</sub>`)
    return out.join('\n')
  }

  const shown = ranked(gaps).slice(0, top)

  out.push(
    `**${gaps.length}** gap(s) in what this branch changed — ` +
      `${count('critical')} critical · ${count('high')} high · ` +
      `${count('medium')} medium · ${count('low')} low.`,
    '',
    'Every row is code the diff touched that no test executes.',
    '',
    '| criticality | score | kind | symbol | file | lines | branches |',
    '| --- | --: | --- | --- | --- | --: | --: |',
  )

  for (const g of shown) {
    out.push(
      `| ${severity(g)} | ${g.score} | ${g.kind} | \`${mdEsc(g.symbol ?? '—')}\` | ` +
        `\`${mdEsc(g.file)}:${g.lines[0]}\` | ${g.lines.length} | ${g.branches} |`,
    )
  }

  out.push('')
  const truncated = gaps.length > shown.length ? `Showing the top ${top} of ${gaps.length}. ` : ''
  out.push(`<sub>${truncated}${provenance(inspection)}</sub>`)

  return out.join('\n')
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// the top of the list is the whole product — a long tail nobody reads is not a report
const TOP = 40

// The measured why, byte-identical to `redbar explain` — scoreArithmetic and bandReason, never a
// model-authored sentence. The reader clicks and audits; the report never asks to be trusted.
const why = (g: Gap) => {
  const coverage = g.fullyUncovered
    ? 'no covered line anywhere in the file — every branch is a path no test has run'
    : 'partly covered — a test already points at it, extend that one'
  return `<details class="why">
        <summary>why ${severity(g)}?</summary>
        <div class="why-body">
          <div>score = ${esc(scoreArithmetic(g))} &nbsp;<span class="dim">(uncovered lines × (no coverage ? 2 : 1) × (1 + branches))</span></div>
          <div>band = <b>${severity(g)}</b>${esc(bandReason(g))}</div>
          <div>coverage: ${coverage}</div>
          <div>${g.lines.length} uncovered line(s): ${g.lines.join(', ')}</div>
          <div class="dim">Measured: <code>${esc(g.file)}</code> × git diff. No language model produced this.</div>
        </div>
      </details>`
}

const row = (g: Gap, i: number) => {
  const sev = severity(g)
  return `
    <tr class="sev-row-${sev}">
      <td class="rank">${i + 1}</td>
      <td><span class="sev sev-${sev}">${sev}</span></td>
      <td class="score">${g.score}</td>
      <td><span class="kind kind-${g.kind}">${g.kind}</span></td>
      <td class="sym">${g.symbol ? esc(g.symbol) : '<em>—</em>'}${why(g)}</td>
      <td class="file"><span class="path">${esc(g.file)}</span><span class="ln">:${g.lines[0]}</span></td>
      <td class="num">${g.lines.length}</td>
      <td class="num">${g.branches}</td>
    </tr>`
}

/** Self-contained HTML report with a print stylesheet — the browser makes the PDF. */
export function renderHtml(inspection: Inspection, repoName: string, profile: Profile): string {
  const { language, runner, base, gaps, stale } = inspection
  const byKind = (k: TestKind) => gaps.filter((g) => g.kind === k)
  const bySeverity = (s: Severity) => gaps.filter((g) => severity(g) === s)
  const untested = gaps.filter((g) => g.fullyUncovered)
  const uncoveredLines = gaps.reduce((n, g) => n + g.lines.length, 0)
  const files = new Set(gaps.map((g) => g.file)).size
  const rankedGaps = ranked(gaps)

  const focusBlock =
    profile === 'library'
      ? ''
      : (() => {
          const rows = kindPriority(profile)
            .map((kind) => {
              const inKind = rankedGaps.filter((g) => g.kind === kind)
              if (inKind.length === 0) return ''
              const items = inKind
                .map(
                  (g) =>
                    `<li><span class="kind kind-${g.kind}">${g.kind}</span> ` +
                    `<span class="sym">${g.symbol ? esc(g.symbol) : '<em>—</em>'}</span> ` +
                    `<span class="file">${esc(g.file)}:${g.lines[0]}</span></li>`,
                )
                .join('')
              return `<ul class="focus-group">${items}</ul>`
            })
            .join('')
          return `<div class="focus">
            <h2>Focus for this project</h2>
            <p>Detected: <b>${esc(profileLabel(profile))}</b>. The score and the table below are
            unchanged — pure counting. This groups the same gaps by where ${esc(profileLabel(profile))}
            breaks first.</p>
            ${rows}
          </div>`
        })()

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

  .focus { margin: 0 0 26px; }
  .focus h2 { font-size: 15px; margin: 0 0 6px; }
  .focus p { color: #5c6370; font-size: 12.5px; margin: 0 0 10px; }
  .focus-group { list-style: none; margin: 0 0 8px; padding: 0; }
  .focus-group li { padding: 3px 0; font-size: 12.5px; display: flex; gap: 8px; align-items: baseline; }

  /* a report that is quietly out of date is worse than no report — it must not be possible to
     forward this PDF to a manager without the warning coming along */
  .stale { background: #fdf4f3; border-left: 3px solid #c0392b; padding: 12px 16px;
           margin-bottom: 20px; font-size: 13px; color: #7d2419; }
  .stale b { color: #c0392b; }
  .stale code { background: #fff; padding: 1px 5px; border-radius: 3px; font-size: 12px; }

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

  .why { margin-top: 4px; font-weight: 400; }
  .why > summary { cursor: pointer; color: #5c6370; font-size: 10.5px; font-family: ui-sans-serif, sans-serif; }
  .why-body { margin: 6px 0 2px; padding: 8px 10px; background: #f7f8fa; border-radius: 6px;
              font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11px; line-height: 1.7; }
  .why-body .dim { color: #9aa1ac; }
  .why-body code { color: #5c6370; }

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
    .why { display: none; }
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

  ${
    stale
      ? `<div class="stale">
    <b>This report is a lower bound, not the truth.</b>
    <code>${esc(runner.reportPath)}</code> is older than the source code it describes. Anything
    written since the last coverage run is absent from the report entirely — and absent reads as
    "nothing to test". Every row below is real; what is <b>not</b> below cannot be trusted.
    Regenerate with <code>${esc(runner.coverageCommand)}</code> and run redbar again.
  </div>`
      : ''
  }

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

  ${focusBlock}

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

/** why a gap ended where it did, in the reader's language rather than the enum's */
const WHY: Record<Verdict, string> = {
  closed: 'a test now executes these lines, and it asserts on them',
  open: 'no test was written, or the one written did not cover it',
  'no-assertion': 'the agent wrote a test that asserted nothing — redbar deleted it',
  'touched-source': 'the agent edited product code — redbar reverted it and threw the test away',
  'too-many-files': 'the agent wrote more than one test file — redbar deleted all of them',
  'needs-human': 'the test failed twice; redbar deleted it',
  timeout: 'the agent did not finish',
  'no-output': 'the agent wrote no test file',
}

// Same criticality order every other renderer uses, carried over from Gap to Outcome without
// re-deriving the RANK table here — ranked() already owns it.
const rankOutcomes = (outcomes: Outcome[]): Outcome[] => {
  const byGap = new Map(outcomes.map((o) => [o.gap, o] as const))
  return ranked(outcomes.map((o) => o.gap)).map((gap) => byGap.get(gap)!)
}

/**
 * What the agent actually did — and the line between what was measured and what it claims.
 *
 * The order of the two blocks is the argument. Everything above the line is a fact: redbar re-ran
 * the coverage command and re-crossed the diff, so `closed` means the lines now execute. Everything
 * below it is a language model talking about its own work, and it is labelled that way. The two
 * never mix, and the second never gets to promote itself into the first.
 */
export function renderOutcomeMarkdown(
  inspection: Inspection,
  outcomes: Outcome[],
  agentId: string,
): string {
  const count = (v: Verdict) => outcomes.filter((o) => o.verdict === v).length
  const measured = rankOutcomes(outcomes.filter((o) => isMeasured(o.verdict)))
  const claimed = rankOutcomes(outcomes.filter((o) => !isMeasured(o.verdict)))

  const row = (o: Outcome) =>
    `| ${severity(o.gap)} | \`${o.gap.symbol ?? '—'}\` | \`${o.gap.file}:${o.gap.lines[0]}\` | ` +
    `${o.gap.kind} | **${o.verdict}** | ${o.testFile ? `\`${o.testFile}\` — ` : ''}${WHY[o.verdict]}${o.note ? ` (${o.note})` : ''} |`

  const head = [
    '| criticality | symbol | file | layer | verdict | why |',
    '| --- | --- | --- | --- | --- | --- |',
  ]

  const out = [
    `# What the agent did — ${inspection.language.name}`,
    '',
    `**${count('closed')} closed** · ${count('open')} open · ${count('no-assertion')} no-assertion · ` +
      `${count('touched-source')} touched-source · ${count('needs-human')} needs-human`,
    '',
    `Agent: \`${agentId}\`. Gaps attempted: ${outcomes.length}.`,
    '',
    '## Measured',
    '',
    `redbar re-ran \`${inspection.runner.coverageCommand}\` and crossed the fresh report with the ` +
      `diff again. **No language model produced any verdict in this block** — "closed" means the ` +
      `coverage report says those lines now execute, and that a test asserting on them exists and ` +
      `passes. The agent's word had no vote.`,
    '',
    ...(measured.length > 0 ? [...head, ...measured.map(row), ''] : ['Nothing to report.', '']),
    '## What the agent says',
    '',
    `Everything below is the **agent's own account** of work redbar could not verify. It is not a ` +
      `measurement, and it is not evidence. It is here because the reason a test could not be ` +
      `written is worth a human's two minutes.`,
    '',
    ...(claimed.length > 0 ? [...head, ...claimed.map(row), ''] : ['Nothing. Every gap reached a measured verdict.', '']),
    '---',
    '',
    `<sub>Generated by redbar. Reproduce with \`redbar execute\`; audit any single number with ` +
      `\`redbar explain <symbol>\`.</sub>`,
  ]

  return out.join('\n')
}

/** The same outcome, for the human and the PDF. Reuses the stylesheet the gap report already has. */
export function renderOutcomeHtml(
  inspection: Inspection,
  outcomes: Outcome[],
  agentId: string,
  repoName: string,
): string {
  const count = (v: Verdict) => outcomes.filter((o) => o.verdict === v).length
  const block = (title: string, lead: string, rows: Outcome[]) => `
    <h2>${esc(title)}</h2>
    <div class="lead">${lead}</div>
    ${
      rows.length === 0
        ? '<p>Nothing to report.</p>'
        : `<table>
      <thead><tr><th>Criticality</th><th>Symbol</th><th>File</th><th>Layer</th><th>Verdict</th><th>Why</th></tr></thead>
      <tbody>${rows
        .map(
          (o) => `<tr class="sev-row-${severity(o.gap)}">
        <td><span class="sev sev-${severity(o.gap)}">${severity(o.gap)}</span></td>
        <td class="sym">${o.gap.symbol ? esc(o.gap.symbol) : '<em>—</em>'}</td>
        <td class="file">${esc(o.gap.file)}:${o.gap.lines[0]}</td>
        <td><span class="kind kind-${o.gap.kind}">${o.gap.kind}</span></td>
        <td><b>${esc(o.verdict)}</b></td>
        <td>${esc(WHY[o.verdict])}${o.note ? ` <em>(${esc(o.note)})</em>` : ''}</td>
      </tr>`,
        )
        .join('')}</tbody>
    </table>`
    }`

  return `<meta charset="utf-8">
<title>redbar — what the agent did — ${esc(repoName)}</title>
<style>
  body { font: 14px/1.5 ui-sans-serif, -apple-system, system-ui, sans-serif; color: #16181d;
         background: #fff; margin: 0; padding: 40px; max-width: 1000px; margin: 0 auto; }
  h1 { font-size: 28px; margin: 0 0 4px; letter-spacing: -0.02em; }
  h1 .bar { color: #d92b2b; }
  h2 { font-size: 16px; margin: 32px 0 10px; }
  .sub { color: #5c6370; font-size: 13px; margin-bottom: 20px; }
  .lead { background: #f7f8fa; border-left: 3px solid #16181d; padding: 12px 16px;
          margin-bottom: 16px; font-size: 13px; }
  .lead.said { border-left-color: #d97706; background: #fdf9f2; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  thead th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em;
             color: #5c6370; border-bottom: 1.5px solid #d6dae0; padding: 0 8px 7px; }
  tbody td { padding: 7px 8px; border-bottom: 1px solid #eef0f3; vertical-align: baseline; }
  .sev { display: inline-block; min-width: 62px; text-align: center; padding: 1px 7px;
         border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
  .sev-critical { background: #c0392b; color: #fff; }
  .sev-high { background: #f6d9b8; color: #8a4a06; }
  .sev-medium { background: #f8ecc4; color: #7a5c04; }
  .sev-low { background: #eef0f3; color: #6b727c; }
  tbody tr.sev-row-critical { background: #fdf4f3; }
  .sym { font-family: ui-monospace, Menlo, monospace; font-weight: 600; }
  .file { font-family: ui-monospace, Menlo, monospace; font-size: 11.5px; color: #5c6370; }
  .kind { display: inline-block; padding: 1px 7px; border-radius: 20px; font-size: 10.5px; }
  .kind-unit { background: #e8f2fd; color: #1a5fa8; }
  .kind-integration { background: #fdf1e3; color: #a3620d; }
  .kind-e2e { background: #f2e9fb; color: #6b3aa8; }
  @media print { body { padding: 0; } @page { margin: 14mm; size: A4; } }
</style>
<h1>red<span class="bar">bar</span> — what the agent did</h1>
<div class="sub"><b>${esc(repoName)}</b> · agent <b>${esc(agentId)}</b> ·
  <b>${count('closed')}</b> closed of <b>${outcomes.length}</b> gaps</div>
${block(
  'Measured',
  `redbar re-ran <code>${esc(inspection.runner.coverageCommand)}</code> and crossed the fresh report
   with the diff again. <b>No language model produced any verdict in this block.</b>`,
  rankOutcomes(outcomes.filter((o) => isMeasured(o.verdict))),
)}
${block(
  'What the agent says',
  `<span class="said"></span>The agent's own account of work redbar could not verify.
   <b>Not a measurement.</b> It is here because the reason a test could not be written is worth two
   minutes of a human's time.`,
  rankOutcomes(outcomes.filter((o) => !isMeasured(o.verdict))),
).replace('<div class="lead">', '<div class="lead said">')}
`
}

/**
 * The audit renderers. Same three audiences as the gap renderers above, same numbers in all three:
 * terminal, PR comment, shareable HTML.
 */

/** Fixed width, stated once: two categories — and two projects — are comparable by eye only if
 *  every bar is drawn on the same scale. No colour, no terminal width detection. */
const BAR_WIDTH = 20

// eighths of a block, so a 48 and a 52 do not draw the same bar
const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']

/** floor, never round: the bar must never draw more than was measured */
const bar = (score: number): string => {
  const filled = (Math.max(0, Math.min(100, score)) / 100) * BAR_WIDTH
  const whole = Math.floor(filled)
  return '█'.repeat(whole) + EIGHTHS[Math.floor((filled - whole) * 8)]
}

/** Display order, fixed. `scores` is Partial on purpose — a category absent from it was never
 *  computed, and printing a 0 there would claim a measurement that never happened. */
const CATEGORIES: Category[] = ['setup', 'coverage', 'rigor', 'pyramid']

const CATEGORY_LABEL: Record<Category, string> = {
  setup: 'Setup',
  coverage: 'Coverage',
  rigor: 'Rigor',
  pyramid: 'Pyramid',
}

// widest label + breathing room, so the scores and the details line up in one column
const LABEL_WIDTH = 11

const measuredCategories = (audit: Audit): Category[] =>
  CATEGORIES.filter((c) => audit.scores[c] !== undefined)

// `checks` arrives ordered by audit.ts. Filtering preserves that order; nothing re-sorts.
const failedChecks = (audit: Audit): Check[] => audit.checks.filter((c) => !c.passed)
const passedChecks = (audit: Audit): Check[] => audit.checks.filter((c) => c.passed)

/** The audit reads the whole tree, not a diff, so it states its own provenance — the same claim
 *  `provenance` makes for the gap report, over the sources the audit actually used. */
const auditProvenance = (inspection: Inspection, tick = '`'): string =>
  `From ${tick}${inspection.runner.reportPath}${tick}, the git-tracked file tree and the manifest. ` +
  `No language model produced these numbers.`

/**
 * The weight rule, stated ONCE, right under the bars where the reader meets the word Pyramid.
 * `kindPriority` is the same order `scorePyramid` turned into ×3, ×2, ×1, and the profile that
 * chose it is already in the header — so no Pyramid row repeats either.
 */
const pyramidRule = (profile: Profile): string =>
  `Pyramid weighs the layers heaviest first: ${kindPriority(profile).join(', ')}.`

/** No Pyramid row, nothing to explain — a project whose layers have no product line at all. */
const explainsPyramid = (audit: Audit): boolean =>
  audit.checks.some((c) => c.category === 'pyramid')

/** The handoff, not decoration: audit diagnoses the project, inspect names the symbols. */
const HANDOFF = 'redbar inspect --all'
const HANDOFF_WHY = 'for the symbols, ranked by criticality'

/** Setup === 0. One instruction, and nothing else — scoring coverage for someone with no tests is
 *  a correct answer to a question they did not ask. */
const NO_TESTS = [
  'This repository has no tests. Coverage, Rigor and Pyramid are unmeasurable, not zero,',
  'so no overall score is computed — one category out of four is not comparable to a repo',
  'where all four were measured.',
]

/**
 * What stands where the overall score would be when three of the four categories were never
 * computed. Printing the weighted Setup score there — 50 × 0.20 = 10 — puts a number above a
 * paragraph saying the other three are not in it, and no reader can get from 50 to 10 without
 * assuming exactly what that paragraph forbids.
 */
const NO_OVERALL = 'overall not computed'
const INIT = 'redbar init'
const INIT_WHY = 'to set up a runner and a coverage report'

/** The terminal report. */
export function renderAuditText(audit: Audit, inspection: Inspection): string {
  const { language, runner } = inspection
  const out = [
    `redbar audit · ${language.name} · ${runner.name} · ${profileLabel(audit.profile)}`,
    '',
    audit.unmeasurable ? `  ${NO_OVERALL}` : `  ${String(audit.overall).padStart(3)}   overall`,
    '',
  ]

  for (const category of measuredCategories(audit)) {
    const score = audit.scores[category]!
    out.push(
      `  ${CATEGORY_LABEL[category].padEnd(LABEL_WIDTH)}${String(score).padStart(3)}  ${bar(score)}`.trimEnd(),
    )
  }

  if (explainsPyramid(audit)) out.push('', `  ${pyramidRule(audit.profile)}`)

  if (audit.stale) {
    out.push(
      '',
      `WARNING: ${runner.reportPath} is older than the source. Code written since the last`,
      `         coverage run is absent from the report, and absent reads as untested.`,
      `         This score is a LOWER BOUND.`,
      `         Regenerate: ${runner.coverageCommand}`,
    )
  }

  const block = (title: string, checks: Check[]) =>
    checks.length === 0
      ? []
      : [
          '',
          title,
          ...checks.map((c) => `  ${CATEGORY_LABEL[c.category].padEnd(LABEL_WIDTH)}${c.detail}`),
        ]

  out.push(...block('FAILED', failedChecks(audit)))
  // before the unmeasurable branch returns: the checks Setup was computed from are worth 25 points
  // each, and a Setup of 50 with nothing under it cannot be re-derived by the reader
  out.push(...block('PASSED', passedChecks(audit)))

  if (audit.unmeasurable) {
    out.push('', ...NO_TESTS, '', auditProvenance(inspection, ''), '', `  → ${INIT}    ${INIT_WHY}`)
    return out.join('\n')
  }

  out.push('', auditProvenance(inspection, ''), '', `  → ${HANDOFF}    ${HANDOFF_WHY}`)

  return out.join('\n')
}

/** The audit's own anchor. It cannot share `MARKER` with the gap comment: a PR bot greps for its
 *  marker to edit its previous comment in place, and two comments answering to one anchor would
 *  overwrite each other on every push. */
export const AUDIT_MARKER = '<!-- redbar-audit -->'

/** GitHub pull request comment. No emoji — `AGENTS.md` forbids them in anything written to a PR. */
export function renderAuditMarkdown(audit: Audit, inspection: Inspection): string {
  const { language, runner } = inspection
  const out = [
    AUDIT_MARKER,
    '## redbar audit',
    '',
    `**${audit.unmeasurable ? NO_OVERALL : `${audit.overall} / 100`}** — ${language.name} · ${runner.name} · ${profileLabel(audit.profile)}`,
    '',
  ]

  if (audit.stale) {
    out.push(
      `**This score is a lower bound.** \`${runner.reportPath}\` is older than the source. Code ` +
        `written since the last coverage run is absent from the report, and absent reads as ` +
        `untested. Regenerate with \`${runner.coverageCommand}\` and audit again.`,
      '',
    )
  }

  out.push('| category | score | |', '| --- | --: | --- |')
  for (const category of measuredCategories(audit)) {
    out.push(`| ${CATEGORY_LABEL[category]} | ${audit.scores[category]} | \`${bar(audit.scores[category]!)}\` |`)
  }
  out.push('')

  if (explainsPyramid(audit)) out.push(pyramidRule(audit.profile), '')

  const block = (title: string, checks: Check[]) =>
    checks.length === 0
      ? []
      : [
          `### ${title}`,
          '',
          ...checks.map((c) => `- **${CATEGORY_LABEL[c.category]}** — ${mdEsc(c.detail)}`),
          '',
        ]

  out.push(...block('Failed', failedChecks(audit)))
  out.push(...block('Passed', passedChecks(audit)))

  if (audit.unmeasurable) {
    out.push(NO_TESTS.join(' '), '', `<sub>${auditProvenance(inspection)}</sub>`, '', `\`${INIT}\` ${INIT_WHY}.`)
    return out.join('\n')
  }

  out.push(`<sub>${auditProvenance(inspection)}</sub>`, '', `\`${HANDOFF}\` ${HANDOFF_WHY}.`)

  return out.join('\n')
}

/**
 * The scorecard, self-contained, with a print stylesheet — four scores and two lists, never a gap
 * table. `renderHtml` already owns that.
 *
 * ponytail: third hand-written stylesheet in this file. Extracting a shared shell would put two
 * working, tested renderers at risk for zero behaviour change — do it when a fourth one arrives.
 */
export function renderAuditHtml(audit: Audit, inspection: Inspection, repoName: string): string {
  const { language, runner } = inspection

  const scoreRow = (category: Category) => {
    const score = audit.scores[category]!
    return `
    <div class="row">
      <div class="cat">${CATEGORY_LABEL[category]}</div>
      <div class="n">${score}</div>
      <div class="track"><div class="fill" style="width:${score}%"></div></div>
    </div>`
  }

  const list = (title: string, checks: Check[]) =>
    checks.length === 0
      ? ''
      : `<h2>${title}</h2>
    <ul class="checks">${checks
      .map(
        (c) =>
          `<li><span class="cat">${CATEGORY_LABEL[c.category]}</span><span>${esc(c.detail)}</span></li>`,
      )
      .join('')}</ul>`

  return `<meta charset="utf-8">
<title>redbar audit — ${esc(repoName)}</title>
<style>
  body { font: 14px/1.5 ui-sans-serif, -apple-system, system-ui, sans-serif; color: #16181d;
         background: #fff; margin: 0 auto; padding: 40px; max-width: 760px;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1 { font-size: 28px; margin: 0 0 4px; letter-spacing: -0.02em; }
  h1 .bar { color: #d92b2b; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: #5c6370;
       margin: 28px 0 8px; }
  .sub { color: #5c6370; font-size: 13px; margin-bottom: 26px; }
  .overall { font-size: 56px; font-weight: 650; letter-spacing: -0.03em; line-height: 1; }
  .overall span { font-size: 14px; font-weight: 400; color: #5c6370; letter-spacing: 0;
                  text-transform: uppercase; }
  .scores { margin: 22px 0 4px; }
  .row { display: grid; grid-template-columns: 110px 44px 1fr; align-items: center; gap: 12px;
         padding: 5px 0; }
  .row .cat { font-size: 13px; }
  .row .n { text-align: right; font-weight: 650; font-variant-numeric: tabular-nums; }
  .track { background: #eef0f3; border-radius: 3px; height: 10px; }
  .fill { background: #16181d; border-radius: 3px; height: 10px; }
  .checks { list-style: none; margin: 0; padding: 0; }
  .checks li { display: grid; grid-template-columns: 110px 1fr; gap: 12px; padding: 4px 0;
               border-bottom: 1px solid #eef0f3; font-size: 13px; }
  .checks .cat { color: #5c6370; }
  .stale { background: #fdf4f3; border-left: 3px solid #c0392b; padding: 12px 16px;
           margin: 22px 0; font-size: 13px; color: #7d2419; }
  .stale b { color: #c0392b; }
  .stale code, .next code { background: #fff; padding: 1px 5px; border-radius: 3px; font-size: 12px; }
  .next { background: #f7f8fa; border-left: 3px solid #16181d; padding: 12px 16px; margin-top: 26px;
          font-size: 13px; }
  .next code { background: #fff; font-family: ui-monospace, Menlo, monospace; }
  footer { margin-top: 22px; color: #8b929c; font-size: 11.5px; }
  @media print { body { padding: 0; } @page { margin: 14mm; size: A4; } }
</style>
<h1>red<span class="bar">bar</span> audit</h1>
<div class="sub"><b>${esc(repoName)}</b> · ${esc(language.name)} · ${esc(runner.name)} ·
  ${esc(profileLabel(audit.profile))}</div>
<div class="overall">${audit.unmeasurable ? `<span>${NO_OVERALL}</span>` : `${audit.overall} <span>overall</span>`}</div>
<div class="scores">${measuredCategories(audit).map(scoreRow).join('')}
</div>
${explainsPyramid(audit) ? `<div class="sub">${esc(pyramidRule(audit.profile))}</div>` : ''}
${
  audit.stale
    ? `<div class="stale">
  <b>This score is a lower bound.</b> <code>${esc(runner.reportPath)}</code> is older
  than the source code it describes. Anything written since the last coverage run is absent from the
  report, and absent reads as untested. Regenerate with <code>${esc(runner.coverageCommand)}</code>
  and audit again.
</div>`
    : ''
}
${list('Failed', failedChecks(audit))}
${list('Passed', passedChecks(audit))}
<div class="next">${
    audit.unmeasurable
      ? `${esc(NO_TESTS.join(' '))} <code>${INIT}</code> ${INIT_WHY}.`
      : `<code>${HANDOFF}</code> ${HANDOFF_WHY}.`
  }</div>
<footer>${esc(auditProvenance(inspection, ''))}</footer>
`
}
