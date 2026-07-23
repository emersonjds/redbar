// Pure: two gap lists in, a diff out. No disk, no clock. `redbar compare` reads two runs' gaps.json
// and hands them here. Zero-LLM — it is set arithmetic, the same answer twice.
import { bandCounts } from './history.js'
import type { Severity } from './severity.js'
import type { Gap } from './types.js'

/**
 * A gap's identity ACROSS runs is `(file, symbol)` — deliberately not the line. Lines drift as code
 * moves; an import added above a function would otherwise report it "closed and reopened" every run.
 * `(file, symbol)` is stable under line drift, which is the tolerance a progress report needs.
 */
const key = (gap: Gap): string => `${gap.file}::${gap.symbol ?? ''}`

export type RunDiff = {
  /** in A, gone in B — the gaps that got covered */
  closed: Gap[]
  /** only in B — new untested code since A */
  added: Gap[]
  /** B's per-band count minus A's: negative is progress */
  deltaByBand: Record<Severity, number>
}

export function compareRuns(a: Gap[], b: Gap[]): RunDiff {
  const aKeys = new Set(a.map(key))
  const bKeys = new Set(b.map(key))

  const closed = a.filter((gap) => !bKeys.has(key(gap)))
  const added = b.filter((gap) => !aKeys.has(key(gap)))

  const countsA = bandCounts(a)
  const countsB = bandCounts(b)
  const deltaByBand: Record<Severity, number> = {
    critical: countsB.critical - countsA.critical,
    high: countsB.high - countsA.high,
    medium: countsB.medium - countsA.medium,
    low: countsB.low - countsA.low,
  }

  return { closed, added, deltaByBand }
}

const BANDS: Severity[] = ['critical', 'high', 'medium', 'low']

// negative is progress, so it gets the ✓
const signed = (n: number): string => (n < 0 ? `${n} ✓` : n > 0 ? `+${n}` : '0')

export function renderTrendText(diff: RunDiff, from: string, to: string): string {
  const out = [
    `redbar compare — ${from} → ${to}`,
    ``,
    `  closed: ${diff.closed.length}   new: ${diff.added.length}`,
    `  ${BANDS.map((b) => `${b} ${signed(diff.deltaByBand[b])}`).join('   ')}`,
    ``,
  ]
  if (diff.closed.length) {
    out.push(`  closed:`)
    for (const g of diff.closed) out.push(`    ${g.symbol ?? '(no symbol)'} — ${g.file}`)
    out.push(``)
  }
  if (diff.added.length) {
    out.push(`  new:`)
    for (const g of diff.added) out.push(`    ${g.symbol ?? '(no symbol)'} — ${g.file}`)
    out.push(``)
  }
  return out.join('\n')
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function renderTrendHtml(diff: RunDiff, from: string, to: string): string {
  const row = (g: Gap): string => `<li><code>${esc(g.symbol ?? '(no symbol)')}</code> — ${esc(g.file)}</li>`
  const band = (b: Severity): string =>
    `<span class="b ${b}">${b} ${esc(signed(diff.deltaByBand[b]))}</span>`
  return `<!doctype html><meta charset="utf-8"><title>redbar trend</title>
<style>
  body{font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:820px;margin:40px auto;padding:0 20px}
  h1{font-size:20px}h1 b{color:#c0392b}.sub{color:#666}
  .cards{display:flex;gap:12px;margin:20px 0}
  .card{flex:1;border:1px solid #eee;border-radius:8px;padding:14px}
  .card .n{font-size:28px;font-weight:700}
  .b{display:inline-block;margin-right:10px;font-variant-numeric:tabular-nums}
  .critical{color:#c0392b}.high{color:#e67e22}.medium{color:#b7950b}.low{color:#7f8c8d}
  h2{font-size:15px;margin-top:24px}code{background:#f6f6f6;padding:1px 4px;border-radius:3px}
  ul{padding-left:18px}li{margin:2px 0}
</style>
<h1>red<b>bar</b> — trend</h1>
<p class="sub">${esc(from)} → ${esc(to)}. The same numbers as <code>redbar compare</code>: a set diff of two runs, zero-LLM.</p>
<div class="cards">
  <div class="card"><div class="n">${diff.closed.length}</div>closed</div>
  <div class="card"><div class="n">${diff.added.length}</div>new</div>
</div>
<p>${BANDS.map(band).join('')}</p>
${diff.closed.length ? `<h2>Closed</h2><ul>${diff.closed.map(row).join('')}</ul>` : ''}
${diff.added.length ? `<h2>New</h2><ul>${diff.added.map(row).join('')}</ul>` : ''}
`
}
