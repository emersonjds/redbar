// usage: npx tsx scripts/report.ts <repo-path> [base] [--out <file.html>]
//
// Renders an inspection as a self-contained HTML report with a print stylesheet, so the browser
// makes the PDF. No headless-browser dependency in the project — redbar stays at zero runtime
// deps, and the file is useful on its own.
import { writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { inspect } from '../src/engine.js'
import { renderHtml } from '../src/report.js'

const args = process.argv.slice(2)
const outFlag = args.indexOf('--out')
const out = outFlag === -1 ? 'REDBAR.html' : (args[outFlag + 1] ?? 'REDBAR.html')
const positional = args.filter((a, i) => a !== '--out' && i !== outFlag + 1)
const [root, base] = positional

if (!root) {
  console.error('usage: npx tsx scripts/report.ts <repo-path> [base] [--out <file.html>]')
  process.exit(1)
}

const inspection = inspect(root, base ? { base } : {})
const html = renderHtml(inspection, basename(resolve(root)))
writeFileSync(out, html)

const untested = inspection.gaps.filter((g) => g.fullyUncovered).length
console.log(`${out} — ${inspection.gaps.length} gaps (${untested} with zero coverage)`)
