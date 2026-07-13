import { execFileSync } from 'node:child_process'
import type { ChangedLines } from './types.js'

function git(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

function tryGit(root: string, args: string[]): string | null {
  try {
    return git(root, args)
  } catch {
    return null
  }
}

export function detectBase(root: string): string {
  const head = tryGit(root, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'])
  if (head) return head.trim().replace('refs/remotes/', '')

  for (const branch of ['main', 'master']) {
    if (tryGit(root, ['rev-parse', '--verify', '--quiet', branch])) return branch
  }
  throw new Error('redbar: no base branch found (main/master). Pass --base <ref>')
}

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/

/** Lines added/changed in `base...HEAD`, per file. */
export function changedLines(root: string, base: string): ChangedLines {
  // quotePath=false: without it git octal-escapes every non-ascii path ("b/caf\303\251.ts"),
  // which then never matches a coverage key and drops the gap in silence
  const diff = git(root, ['-c', 'core.quotePath=false', 'diff', '-U0', `${base}...HEAD`])
  const changed: ChangedLines = new Map()
  let file: string | null = null
  let inHeader = false

  for (const line of diff.split('\n')) {
    // in a -U0 diff every content line carries a +/-/space prefix, so `diff --git` at column 0
    // is the one marker a file's CONTENT can never forge. Only inside a header is `+++ …` a path:
    // a changed line reading `++ x` renders as `+++ x` and used to hijack the file pointer.
    if (line.startsWith('diff --git ')) {
      file = null
      inHeader = true
      continue
    }
    if (inHeader && line.startsWith('+++ ')) {
      file = headerPath(line.slice(4))
      continue
    }
    const hunk = HUNK.exec(line)
    if (!hunk) continue
    inHeader = false
    if (!file) continue

    const start = Number(hunk[1])
    const count = hunk[2] === undefined ? 1 : Number(hunk[2])
    if (count === 0) continue // pure deletion: no new line

    const lines = changed.get(file) ?? []
    for (let n = start; n < start + count; n++) lines.push(n)
    changed.set(file, lines)
  }
  return changed
}

/** the `+++` side of a header: `b/src/a.ts`, `b/with space.ts\t`, `"b/weird\"name.ts"`, `/dev/null` */
function headerPath(rest: string): string | null {
  const tab = rest.indexOf('\t')
  let path = tab >= 0 ? rest.slice(0, tab) : rest
  if (path.startsWith('"') && path.endsWith('"')) {
    path = path.slice(1, -1).replace(/\\(.)/g, '$1') // still quoted: a `"` or a control char
  }
  if (path === '/dev/null') return null // a deletion: nothing to cover
  return path.startsWith('b/') ? path.slice(2) : path
}
