import type { Coverage } from '../types.js'
import { addLine, type LineHits, toCoverage } from './merge.js'

// ponytail: same call as jacoco.ts — regex over machine-generated XML, zero dependency.
// number and hits are read independently: XML attribute order is not guaranteed by any writer.
const CLASS = /<class\s+[^>]*filename="([^"]*)"[^>]*>([\s\S]*?)<\/class>/g
const LINE = /<line\b[^>]*>/g
const NUMBER = /\bnumber="(\d+)"/
const HITS = /\bhits="(\d+)"/
const SOURCE = /<source>([^<]*)<\/source>/g

/**
 * `filename` is relative to `<source>`, NOT to the repo root — and `<source>` is whatever directory
 * the coverage command was pointed at. `pytest --cov=app` writes `<source>/abs/repo/app</source>`
 * with `filename="calc.py"`, and git knows that same file as `app/calc.py`.
 *
 * Keying it as `calc.py` was silent data loss: the file never intersected the diff, so it read as
 * ABSENT from the report — and an absent file is treated (correctly, elsewhere) as one that no test
 * imports, i.e. a total gap. A half-covered file therefore came back fully uncovered and the whole
 * report inflated to critical. Found on a real pytest repo; no fixture had a `<source>` below the
 * root, which is exactly the class of bug a fixture cannot find.
 */
export function parseCobertura(xml: string, root = ''): Coverage {
  const acc: LineHits = new Map()
  const sources = [...xml.matchAll(SOURCE)].map(([, s]) => clean(s ?? ''))

  for (const [, filename, body] of xml.matchAll(CLASS)) {
    const file = resolveFile(clean(filename ?? ''), sources, clean(root))

    for (const [tag] of (body ?? '').matchAll(LINE)) {
      const nr = NUMBER.exec(tag)?.[1]
      const hits = HITS.exec(tag)?.[1]
      if (nr === undefined || hits === undefined) continue
      addLine(acc, file, Number(nr), Number(hits) > 0)
    }
  }
  return toCoverage(acc)
}

const clean = (p: string) => p.trim().replaceAll('\\', '/').replace(/\/$/, '')

/**
 * The repo-relative key for one class, given the report's `<source>` entries.
 *
 * A report can carry several sources (a monorepo, a multi-package pytest run), so each is tried and
 * the first that lands the file INSIDE the root wins. When none does — a report generated in a CI
 * container against a different checkout — the raw filename is kept, rather than a `../../..` path
 * that would match nothing. Same rule as the lcov parser: never invent a path.
 */
function resolveFile(filename: string, sources: string[], root: string): string {
  const bare = filename.replace(/^\.?\//, '')
  if (!root) return bare

  const prefix = `${root}/`
  const strip = (p: string) => (p.startsWith(prefix) ? p.slice(prefix.length) : null)

  for (const source of sources) {
    // `<source>.</source>`, and a source equal to the root, both mean "already repo-relative"
    if (!source || source === '.' || source === root) {
      return strip(bare) ?? bare
    }
    const inside = strip(`${source}/${bare}`)
    if (inside) return inside
  }

  // no <source> matched: the filename may itself be absolute (some writers emit no <source>)
  return strip(bare) ?? bare
}
