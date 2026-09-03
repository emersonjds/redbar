import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { main, opts, parseArgs, readVersion, runCi } from '../src/cli.js'

// `mcp` blocks on stdin via readline forever — the real transport is already exercised end to
// end, over a spawned subprocess, in mcp-e2e.test.ts. Here `main` only needs to prove it reaches
// the right case and hands off; stubbing `serve` is the one substitute for an I/O boundary the
// unit convention allows.
vi.mock('../src/mcp.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/mcp.js')>()
  return { ...actual, serve: vi.fn() }
})

import * as mcpModule from '../src/mcp.js'

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

/** A minimal, real git repo: package.json + package.json marker only, no tests, no report. */
function bareRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'redbar-cli-bare-'))
  writeFileSync(join(root, 'package.json'), '{"devDependencies":{"vitest":"^4.0.0"}}')
  return root
}

/**
 * Two commits on `main`: the base has only `add`, the second (`feature`) plants a function whose
 * lines are entirely new — a real `git diff` produces the gap, nothing is injected.
 */
function ciRepo(featureSource: string, lcov: string): { root: string; base: string } {
  const root = mkdtempSync(join(tmpdir(), 'redbar-cli-ci-'))
  git(root, ['init', '--quiet', '-b', 'main'])
  git(root, ['config', 'user.email', 'redbar-test@example.com'])
  git(root, ['config', 'user.name', 'redbar test'])
  writeFileSync(root + '/package.json', '{"devDependencies":{"vitest":"^4.0.0"}}')
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src', 'math.ts'), 'export function add(a, b) {\n  return a + b\n}\n')
  git(root, ['add', '-A'])
  git(root, ['commit', '--quiet', '-m', 'base'])
  const base = git(root, ['rev-parse', 'HEAD']).trim()

  writeFileSync(join(root, 'src', 'math.ts'), featureSource)
  mkdirSync(join(root, 'coverage'), { recursive: true })
  writeFileSync(join(root, 'coverage', 'lcov.info'), lcov)
  git(root, ['add', '-A'])
  git(root, ['commit', '--quiet', '-m', 'feature'])

  return { root, base }
}

// 1 branch, fully uncovered → severity "high" (branches 1-4, DENSE is 5)
const HIGH_SOURCE =
  'export function add(a, b) {\n  return a + b\n}\n\n' +
  "export function divide(a, b) {\n  if (b === 0) throw new Error('nope')\n  return a / b\n}\n"
const HIGH_LCOV =
  'TN:\nSF:src/math.ts\nDA:1,1\nDA:2,1\nDA:5,0\nDA:6,0\nDA:7,0\nLF:5\nLH:2\nend_of_record\n'

// 5 `if`s, fully uncovered → severity "critical" (branches >= DENSE)
const CRITICAL_SOURCE =
  'export function add(a, b) {\n  return a + b\n}\n\n' +
  "export function classify(n) {\n  if (n === 1) return 'a'\n  if (n === 2) return 'b'\n" +
  "  if (n === 3) return 'c'\n  if (n === 4) return 'd'\n  if (n === 5) return 'e'\n" +
  "  return 'f'\n}\n"
const CRITICAL_LCOV =
  'TN:\nSF:src/math.ts\nDA:1,1\nDA:2,1\nDA:5,0\nDA:6,0\nDA:7,0\nDA:8,0\nDA:9,0\nDA:10,0\nDA:11,0\n' +
  'LF:9\nLH:2\nend_of_record\n'

let originalArgv: string[]
const originalCwd = process.cwd()

beforeEach(() => {
  originalArgv = process.argv
  process.exitCode = undefined
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
})

afterEach(() => {
  process.argv = originalArgv
  process.exitCode = undefined
  vi.restoreAllMocks()
})

function setArgv(...args: string[]): void {
  process.argv = ['node', 'cli.js', ...args]
}

function loggedText(): string {
  return (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls
    .map((c) => String(c[0]))
    .join('\n')
}

describe('parseArgs', () => {
  it('splits value flags from positionals and consumes the next slot', () => {
    const { positional, flags } = parseArgs(['inspect', '--base', 'main', 'extra'], new Set(['base']))

    expect(positional).toEqual(['inspect', 'extra'])
    expect(flags).toEqual({ base: 'main' })
  })

  it('treats a flag not in valueFlags as a boolean, not a value consumer', () => {
    const { positional, flags } = parseArgs(['--all', 'src'], new Set(['base']))

    expect(flags).toEqual({ all: true })
    expect(positional).toEqual(['src'])
  })

  it('reads a value flag with nothing after it as an empty string, not the next flag', () => {
    const { flags } = parseArgs(['--base'], new Set(['base']))
    expect(flags).toEqual({ base: '' })
  })
})

describe('opts', () => {
  it('defaults run to true so the CLI runs the coverage command for a human at a terminal', () => {
    expect(opts({})).toEqual({ run: true })
  })

  it('turns run off only when --no-run is explicitly passed', () => {
    expect(opts({ 'no-run': true })).toEqual({ run: false })
  })

  it('carries --all through only when it is set', () => {
    expect(opts({ all: true })).toEqual({ run: true, all: true })
    expect(opts({})).not.toHaveProperty('all')
  })

  it('carries --base through only when it is a string', () => {
    expect(opts({ base: 'develop' })).toEqual({ run: true, base: 'develop' })
    expect(opts({ base: true })).toEqual({ run: true })
  })
})

describe('readVersion', () => {
  it('reads the version straight out of package.json — no drift between the two', () => {
    const pkg = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'),
    ) as { version: string }

    expect(readVersion()).toBe(pkg.version)
  })
})

describe('main — no command', () => {
  it('prints the help text and sets no exit code when no command is given', async () => {
    setArgv()
    await main()

    expect(loggedText()).toContain('Usage:')
    expect(process.exitCode).toBeUndefined()
  })

  it('prints the help text on --help', async () => {
    setArgv('--help')
    await main()
    expect(loggedText()).toContain('Usage:')
  })

  it('prints the help text on -h', async () => {
    setArgv('-h')
    await main()
    expect(loggedText()).toContain('Usage:')
  })
})

describe('main — --version / -v', () => {
  it('prints the package version on --version', async () => {
    setArgv('--version')
    await main()
    expect(console.log).toHaveBeenCalledWith(readVersion())
  })

  it('prints the package version on -v', async () => {
    setArgv('-v')
    await main()
    expect(console.log).toHaveBeenCalledWith(readVersion())
  })
})

describe('main — unknown command', () => {
  it('reports the unknown command, prints help, and fails the exit code', async () => {
    setArgv('nope')
    await main()

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('unknown command "nope"'))
    expect(loggedText()).toContain('Usage:')
    expect(process.exitCode).toBe(1)
  })
})

describe('main — the catch branch', () => {
  it('sets exitCode to 1 and prints the error message when a command throws', async () => {
    const root = mkdtempSync(join(tmpdir(), 'redbar-cli-empty-'))
    setArgv('explain', '--path', root)
    await main()

    expect(process.exitCode).toBe(1)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('no language recognized'))
  })
})

describe('main — dispatch reaches each command', () => {
  it('inspect: runs inspect() and surfaces its error through the catch branch', async () => {
    const root = bareRepo()
    setArgv('inspect', root)
    await main()

    expect(process.exitCode).toBe(1)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('no test files'))
  })

  it('briefing: runs briefing() and surfaces its error through the catch branch', async () => {
    const root = bareRepo()
    setArgv('briefing', root)
    await main()

    expect(process.exitCode).toBe(1)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('no test files'))
  })

  it('audit: runs audit() and surfaces its error through the catch branch', async () => {
    const root = bareRepo()
    setArgv('audit', root)
    await main()

    expect(process.exitCode).toBe(1)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('no test files'))
  })

  it('compare: runs compare() and surfaces its own error, not inspect\'s', async () => {
    const root = bareRepo()
    setArgv('compare')
    process.chdir(root)
    try {
      await main()
    } finally {
      process.chdir(originalCwd)
    }

    expect(process.exitCode).toBe(1)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('no runs yet'))
  })

  it('execute: runs execute() and surfaces the git failure on a non-repo tree', async () => {
    const root = mkdtempSync(join(tmpdir(), 'redbar-cli-notgit-'))
    setArgv('execute', root)
    await main()

    expect(process.exitCode).toBe(1)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('git'))
  })

  it('init: runs init() and prints the detected language, no error', async () => {
    const root = bareRepo()
    setArgv('init', root)
    await main()

    expect(process.exitCode).toBeUndefined()
    expect(loggedText()).toContain('language:')
  })

  it('mcp-config: runs mcp-config() and prints the registration, no error', async () => {
    setArgv('mcp-config')
    await main()

    expect(process.exitCode).toBeUndefined()
    expect(loggedText()).toContain('#')
  })

  it('mcp-config: an unknown client throws, caught by the same catch branch', async () => {
    setArgv('mcp-config', 'nope-client')
    await main()

    expect(process.exitCode).toBe(1)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('unknown client "nope-client"'))
  })

  it('mcp: runs mcp() and hands off to serve() without touching stdin in this test', async () => {
    setArgv('mcp')
    await main()

    expect(mcpModule.serve).toHaveBeenCalledTimes(1)
    expect(process.exitCode).toBeUndefined()
  })

  it('ci: assigns process.exitCode from runCi() — the pass path', async () => {
    const { root, base } = ciRepo(HIGH_SOURCE, HIGH_LCOV)
    setArgv('ci', root, '--base', base)
    await main()

    expect(process.exitCode).toBe(0)
    expect(loggedText()).toContain('PASS')
  })

  it('ci: assigns process.exitCode from runCi() — the fail path', async () => {
    const { root, base } = ciRepo(CRITICAL_SOURCE, CRITICAL_LCOV)
    setArgv('ci', root, '--base', base)
    await main()

    expect(process.exitCode).toBe(1)
    expect(loggedText()).toContain('FAIL')
  })
})

describe('runCi', () => {
  it('passes and returns 0 when nothing exceeds the default limits', () => {
    const { root, base } = ciRepo(HIGH_SOURCE, HIGH_LCOV)

    expect(runCi([root, '--base', base])).toBe(0)
    expect(loggedText()).toContain('PASS')
    expect(loggedText()).toContain('high:     1')
  })

  it('fails on a critical gap even though --max-high is untouched', () => {
    const { root, base } = ciRepo(CRITICAL_SOURCE, CRITICAL_LCOV)

    expect(runCi([root, '--base', base])).toBe(1)
    expect(loggedText()).toContain('FAIL')
    expect(loggedText()).toContain('critical: 1')
  })

  it('fails on a high gap once --max-high is lowered below the count', () => {
    const { root, base } = ciRepo(HIGH_SOURCE, HIGH_LCOV)

    expect(runCi([root, '--base', base, '--max-high', '0'])).toBe(1)
    expect(loggedText()).toContain('FAIL')
  })

  it('passes a critical gap through when --max-critical is raised to allow it', () => {
    const { root, base } = ciRepo(CRITICAL_SOURCE, CRITICAL_LCOV)

    expect(runCi([root, '--base', base, '--max-critical', '1'])).toBe(0)
    expect(loggedText()).toContain('PASS')
  })

  it('writes the PR-comment markdown to --md, with the same PASS/FAIL verdict', () => {
    const { root, base } = ciRepo(HIGH_SOURCE, HIGH_LCOV)
    const mdPath = join(root, 'gate.md')

    const code = runCi([root, '--base', base, '--md', mdPath])

    expect(code).toBe(0)
    const md = readFileSync(mdPath, 'utf8')
    expect(md).toContain('## redbar')
    expect(md).toContain('PASS')
    expect(md).toContain('divide')
  })

  it('writes FAIL to --md when the gate does not pass', () => {
    const { root, base } = ciRepo(CRITICAL_SOURCE, CRITICAL_LCOV)
    const mdPath = join(root, 'gate.md')

    runCi([root, '--base', base, '--max-critical', '0', '--md', mdPath])

    expect(readFileSync(mdPath, 'utf8')).toContain('FAIL')
  })
})
