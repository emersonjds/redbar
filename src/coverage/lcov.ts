import type { Coverage } from '../types.js'
import { addLine, type LineHits, toCoverage } from './merge.js'

/** `SF:` can be absolute (cargo-llvm-cov) or relative; `root`, when given, is stripped. */
export function parseLcov(text: string, root = ''): Coverage {
  const acc: LineHits = new Map()
  let current: string | null = null

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('SF:')) {
      current = normalize(line.slice(3), root)
    } else if (line.startsWith('DA:') && current) {
      const [nr, hits] = line.slice(3).split(',')
      const n = Number(nr)
      if (!Number.isInteger(n)) continue
      addLine(acc, current, n, Number(hits) > 0)
    } else if (line === 'end_of_record') {
      current = null
    }
  }
  return toCoverage(acc)
}

function normalize(file: string, root: string): string {
  const p = file.replaceAll('\\', '/')
  // the trailing `/` is the path boundary: root `/home/u/proj` must not eat `/home/u/proj-ui/…`
  const prefix = root ? `${root.replace(/\/$/, '')}/` : ''
  return (prefix && p.startsWith(prefix) ? p.slice(prefix.length) : p).replace(/^\.?\//, '')
}
