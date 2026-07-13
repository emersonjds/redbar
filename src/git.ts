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
const NEWFILE = /^\+\+\+ (?:b\/)?(.+)$/

/** Lines added/changed in `base...HEAD`, per file. */
export function changedLines(root: string, base: string): ChangedLines {
  const diff = git(root, ['diff', '-U0', `${base}...HEAD`])
  const changed: ChangedLines = new Map()
  let file: string | null = null

  for (const line of diff.split('\n')) {
    const newFile = NEWFILE.exec(line)
    if (newFile) {
      const path = newFile[1]!
      file = path === '/dev/null' ? null : path
      continue
    }
    const hunk = HUNK.exec(line)
    if (!hunk || !file) continue

    const start = Number(hunk[1])
    const count = hunk[2] === undefined ? 1 : Number(hunk[2])
    if (count === 0) continue // pure deletion: no new line

    const lines = changed.get(file) ?? []
    for (let n = start; n < start + count; n++) lines.push(n)
    changed.set(file, lines)
  }
  return changed
}
