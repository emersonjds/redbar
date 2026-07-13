import type { Coverage, FileCoverage } from '../types.js'

/** `SF:` can be absolute (cargo-llvm-cov) or relative; `root`, when given, is stripped. */
export function parseLcov(text: string, root = ''): Coverage {
  const cov: Coverage = new Map()
  let current: FileCoverage | null = null

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('SF:')) {
      current = { file: normalize(line.slice(3), root), covered: [], uncovered: [] }
      cov.set(current.file, current)
    } else if (line.startsWith('DA:') && current) {
      const [nr, hits] = line.slice(3).split(',')
      const n = Number(nr)
      if (!Number.isInteger(n)) continue
      ;(Number(hits) > 0 ? current.covered : current.uncovered).push(n)
    } else if (line === 'end_of_record') {
      current = null
    }
  }
  return cov
}

function normalize(file: string, root: string): string {
  let p = file.replaceAll('\\', '/')
  if (root && p.startsWith(root)) p = p.slice(root.length)
  return p.replace(/^\.?\//, '')
}
