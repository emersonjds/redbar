import type { Coverage, FileCoverage } from '../types.js'

// ponytail: same call as jacoco.ts — regex over machine-generated XML, zero dependency.
const CLASS = /<class\s+[^>]*filename="([^"]*)"[^>]*>([\s\S]*?)<\/class>/g
const LINE = /<line\s+number="(\d+)"\s+hits="(\d+)"/g

export function parseCobertura(xml: string): Coverage {
  const cov: Coverage = new Map()

  for (const [, filename, body] of xml.matchAll(CLASS)) {
    const file = (filename ?? '').replaceAll('\\', '/').replace(/^\.?\//, '')
    const fc: FileCoverage = { file, covered: [], uncovered: [] }
    for (const [, nr, hits] of (body ?? '').matchAll(LINE)) {
      ;(Number(hits) > 0 ? fc.covered : fc.uncovered).push(Number(nr))
    }
    cov.set(file, fc)
  }
  return cov
}
