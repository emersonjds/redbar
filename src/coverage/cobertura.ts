import type { Coverage } from '../types.js'
import { addLine, type LineHits, toCoverage } from './merge.js'

// ponytail: same call as jacoco.ts — regex over machine-generated XML, zero dependency.
// number and hits are read independently: XML attribute order is not guaranteed by any writer.
const CLASS = /<class\s+[^>]*filename="([^"]*)"[^>]*>([\s\S]*?)<\/class>/g
const LINE = /<line\b[^>]*>/g
const NUMBER = /\bnumber="(\d+)"/
const HITS = /\bhits="(\d+)"/

export function parseCobertura(xml: string): Coverage {
  const acc: LineHits = new Map()

  for (const [, filename, body] of xml.matchAll(CLASS)) {
    const file = (filename ?? '').replaceAll('\\', '/').replace(/^\.?\//, '')
    for (const [tag] of (body ?? '').matchAll(LINE)) {
      const nr = NUMBER.exec(tag)?.[1]
      const hits = HITS.exec(tag)?.[1]
      if (nr === undefined || hits === undefined) continue
      addLine(acc, file, Number(nr), Number(hits) > 0)
    }
  }
  return toCoverage(acc)
}
