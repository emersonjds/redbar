import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { changedLines, detectBase } from '../src/git.js'

let repo: string

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'redbar-git-'))
  git(repo, 'init', '-b', 'main')
  git(repo, 'config', 'user.email', 't@t')
  git(repo, 'config', 'user.name', 't')
  writeFileSync(join(repo, 'a.ts'), 'const a = 1\nconst b = 2\nconst c = 3\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-m', 'base')

  git(repo, 'checkout', '-b', 'feat')
  // change line 2, add lines 4 and 5, and create a new file
  writeFileSync(
    join(repo, 'a.ts'),
    'const a = 1\nconst b = 22\nconst c = 3\nconst d = 4\nconst e = 5\n',
  )
  writeFileSync(join(repo, 'new.ts'), 'export const z = 0\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-m', 'feat')
})

describe('changedLines', () => {
  it('returns the new/changed lines per file', () => {
    const changed = changedLines(repo, 'main')
    expect(changed.get('a.ts')).toEqual([2, 4, 5])
    expect(changed.get('new.ts')).toEqual([1])
  })

  it('leaves out files that did not change', () => {
    expect(changedLines(repo, 'main').has('missing.ts')).toBe(false)
  })
})

describe('detectBase', () => {
  it('falls back to main when there is no remote', () => {
    expect(detectBase(repo)).toBe('main')
  })
})
