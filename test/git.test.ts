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

  // a file whose FIRST line, once changed, renders as `+++ …` in the diff
  writeFileSync(
    join(repo, 'hijack.ts'),
    'const a = 1\nconst b = 2\nconst c = 3\nconst d = 4\nconst e = 5\n',
  )
  git(repo, 'add', '.')
  git(repo, 'commit', '-m', 'hijack base')

  git(repo, 'checkout', '-b', 'feat')
  // change line 2, add lines 4 and 5, and create a new file
  writeFileSync(
    join(repo, 'a.ts'),
    'const a = 1\nconst b = 22\nconst c = 3\nconst d = 4\nconst e = 5\n',
  )
  writeFileSync(join(repo, 'new.ts'), 'export const z = 0\n')
  // git quotes and octal-escapes a non-ascii path, and appends a TAB after a path with a space
  writeFileSync(join(repo, '数学.ts'), 'export const pi = 3\n')
  writeFileSync(join(repo, 'with space.ts'), 'export const y = 1\n')
  // line 1 becomes a CONTENT line starting with `++ ` — it renders as `+++ hijacked`
  writeFileSync(
    join(repo, 'hijack.ts'),
    '++ hijacked\nconst b = 2\nconst c = 3\nconst d = 4\nconst e = 55\n',
  )
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

  it('keeps a non-ascii path readable instead of octal-escaping it', () => {
    expect(changedLines(repo, 'main').get('数学.ts')).toEqual([1])
  })

  it('keeps a path with a space, without the tab git terminates it with', () => {
    expect(changedLines(repo, 'main').get('with space.ts')).toEqual([1])
  })

  // a content line that renders as `+++ …` must not be mistaken for a file header, or every
  // later hunk is billed to a phantom file and the real file silently loses those lines
  it('a content line starting with ++ does not hijack the file pointer', () => {
    const changed = changedLines(repo, 'main')
    expect(changed.get('hijack.ts')).toEqual([1, 5])
    expect(changed.has('hijacked')).toBe(false)
  })
})

describe('detectBase', () => {
  it('falls back to main when there is no remote', () => {
    expect(detectBase(repo)).toBe('main')
  })
})
