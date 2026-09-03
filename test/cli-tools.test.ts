import { execFileSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// runMcp hands its tools to serve(), which binds readline to the real process.stdin — doing that
// in a test worker would leave the process waiting on a line that never comes. The real transport
// is already exercised end to end, over a spawned subprocess, in mcp-e2e.test.ts. Stubbing the
// transport boundary here is what lets the actual business logic inside runMcp's tools run
// in-process, where istanbul/v8 can see it — a spawned subprocess would not count toward coverage.
vi.mock('../src/mcp.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/mcp.js')>()
  return { ...actual, serve: vi.fn() }
})

// runCompare prints a PDF through the browser already on the machine. On a machine that has one,
// the real call launches headless Chrome and the test dies on the 5s timeout; the PDF path itself
// is covered against a mocked browser in pdf.test.ts.
vi.mock('../src/pdf.js', () => ({ htmlToPdf: vi.fn(() => false), findBrowser: vi.fn(() => null) }))

import {
  briefingFor,
  newRunDir,
  readConventions,
  resolveRun,
  runCompare,
  runExplain,
  runInit,
  runMcp,
  runMcpConfig,
  updateLatest,
} from '../src/cli.js'
import type { Inspection } from '../src/engine.js'
import { byId } from '../src/languages.js'
import * as mcpModule from '../src/mcp.js'
import type { ToolArgs, ToolBox } from '../src/mcp.js'
import type { Gap } from '../src/types.js'

const TS = byId('ts')!
const VITEST_RUNNER = TS.runners[0]!

function tmpRoot(prefix = 'redbar-cli-tools-'): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

type RepoFiles = Record<string, string>

/** package.json + product files + a (possibly empty) coverage report. Never touches git. */
function makeRepo(
  root: string,
  opts: { manifest?: object; files?: RepoFiles; lcov?: string } = {},
): void {
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify(
      opts.manifest ?? {
        name: 'fixture',
        devDependencies: { vitest: '^1.0.0', '@vitest/coverage-v8': '^1.0.0' },
      },
    ),
  )

  const files = opts.files ?? { 'src/math.ts': 'export function add(a, b) {\n  return a + b\n}\n' }
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), content)
  }

  mkdirSync(join(root, 'coverage'), { recursive: true })
  writeFileSync(join(root, 'coverage', 'lcov.info'), opts.lcov ?? '')
}

/** The lcov the fixture ships, built from the same {covered, uncovered} shape the other tests use. */
function lcov(entries: Record<string, { covered: number[]; uncovered: number[] }>): string {
  const records = Object.entries(entries).map(([file, { covered, uncovered }]) => {
    const da = [...covered.map((l) => `DA:${l},1`), ...uncovered.map((l) => `DA:${l},0`)]
    return `TN:\nSF:${file}\n${da.join('\n')}\nLF:${covered.length + uncovered.length}\nLH:${covered.length}\nend_of_record`
  })
  return records.length === 0 ? '' : `${records.join('\n')}\n`
}

/**
 * Same fixture, committed to `main` with HEAD pointing at that same commit — `git diff
 * main...HEAD` is then empty. runMcp always computes this diff first (there is no --all flag on
 * an MCP call unless the agent passes one), so this is the real base every runMcp test needs
 * before it can exercise the "fall back to the whole repo" branch.
 */
function makeGitRepo(root: string, opts: Parameters<typeof makeRepo>[1] = {}): void {
  makeRepo(root, opts)
  git(root, ['init', '--quiet', '-b', 'main'])
  git(root, ['config', 'user.email', 'redbar-test@example.com'])
  git(root, ['config', 'user.name', 'redbar test'])
  git(root, ['add', '-A'])
  git(root, ['commit', '--quiet', '-m', 'init'])
}

const gap = (overrides: Partial<Gap> = {}): Gap => ({
  file: 'src/foo.ts',
  symbol: 'foo',
  lines: [1],
  fullyUncovered: true,
  branches: 6,
  kind: 'unit',
  score: 100,
  ...overrides,
})

function loggedText(): string {
  return (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls
    .map((c) => String(c[0]))
    .join('\n')
}

function stderrText(): string {
  return (process.stderr.write as unknown as { mock: { calls: unknown[][] } }).mock.calls
    .map((c) => String(c[0]))
    .join('')
}

/** The most recent ToolBox handed to serve() — captured instead of a real stdio transport. */
function lastTools(): ToolBox {
  const calls = vi.mocked(mcpModule.serve).mock.calls
  return calls[calls.length - 1]![0] as ToolBox
}

/** One tool off that ToolBox. A missing name is the test failing, not an optional call. */
function tool(name: string): (args: ToolArgs) => string {
  const fn = lastTools()[name]
  if (!fn) throw new Error(`the server registered no tool named ${name}`)
  return fn
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('readConventions', () => {
  it('reads the shipped standard for unit, integration and e2e', () => {
    const root = tmpRoot()

    const conventions = readConventions(root, TS)

    expect(conventions.unit).toContain('Vitest')
    expect(conventions.integration).toBeTruthy()
    expect(conventions.e2e).toBeTruthy()
  })

  it('appends a project override after the shipped standard, never replacing it', () => {
    const root = tmpRoot()
    mkdirSync(join(root, '.redbar', 'conventions', 'ts'), { recursive: true })
    writeFileSync(join(root, '.redbar', 'conventions', 'ts', 'unit.md'), 'Use MSW, never nock.')

    const conventions = readConventions(root, TS)

    expect(conventions.unit).toContain('Vitest')
    expect(conventions.unit).toContain('Use MSW, never nock.')
    expect(conventions.unit!.indexOf('Vitest')).toBeLessThan(conventions.unit!.indexOf('Use MSW'))
  })

  it('picks the e2e convention for the tool the project actually declares, not always Playwright', () => {
    const root = tmpRoot()
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ devDependencies: { cypress: '^13.0.0' } }),
    )

    const conventions = readConventions(root, TS)

    expect(conventions.e2e).toContain('Cypress')
  })
})

describe('briefingFor', () => {
  it('assembles the whole document from a real root: profile, e2e tool and conventions together', () => {
    const root = tmpRoot()
    makeRepo(root)
    const inspection: Inspection = {
      language: TS,
      runner: VITEST_RUNNER,
      base: '(whole repository)',
      gaps: [],
      coverage: new Map(),
    }

    const doc = briefingFor(root, inspection)

    expect(doc).toContain(`Testing brief — ${basename(resolve(root))}`)
    expect(doc).toMatch(/no gaps/i)
  })
})

describe('newRunDir', () => {
  it('creates a dated run directory under .redbar/runs', () => {
    const root = tmpRoot()

    const dir = newRunDir(root, new Date('2026-07-22T09:10:00Z'))

    expect(dir).toBe(join(root, '.redbar', 'runs', '2026-07-22T09-10-00'))
    expect(statSync(dir).isDirectory()).toBe(true)
  })

  it('creates the parent .redbar/runs tree even when .redbar does not exist yet', () => {
    const root = tmpRoot()
    expect(existsSync(join(root, '.redbar'))).toBe(false)

    newRunDir(root, new Date('2026-07-22T09:10:00Z'))

    expect(existsSync(join(root, '.redbar', 'runs'))).toBe(true)
  })

  it('gives two different runs made a second apart two different directories', () => {
    const root = tmpRoot()

    const a = newRunDir(root, new Date('2026-07-22T09:10:00Z'))
    const b = newRunDir(root, new Date('2026-07-22T09:10:01Z'))

    expect(a).not.toBe(b)
  })
})

describe('updateLatest', () => {
  /** resolves .redbar/latest whether the platform gave us a symlink or the text-file fallback */
  function readLatest(root: string): string {
    const link = join(root, '.redbar', 'latest')
    const target = lstatSync(link).isSymbolicLink() ? readlinkSync(link) : readFileSync(link, 'utf8')
    return resolve(join(root, '.redbar'), target)
  }

  it('points .redbar/latest at the run directory just created', () => {
    const root = tmpRoot()
    const runDir = newRunDir(root, new Date('2026-07-22T09:10:00Z'))

    updateLatest(root, runDir)

    expect(existsSync(join(root, '.redbar', 'latest'))).toBe(true)
    expect(readLatest(root)).toBe(runDir)
  })

  it('repoints latest at a newer run, replacing the old link rather than leaving it stale', () => {
    const root = tmpRoot()
    const first = newRunDir(root, new Date('2026-07-22T09:10:00Z'))
    const second = newRunDir(root, new Date('2026-07-29T09:10:00Z'))

    updateLatest(root, first)
    updateLatest(root, second)

    expect(readLatest(root)).toBe(second)
  })
})

describe('resolveRun', () => {
  it('names every run it knows in the error when nothing matches', () => {
    const runs = ['2026-01-01T00-00-00', '2026-02-02T00-00-00']

    expect(() => resolveRun(runs, '2020')).toThrow(/2026-01-01T00-00-00, 2026-02-02T00-00-00/)
  })

  it('reports "(none)" rather than an empty list when there are no runs at all', () => {
    expect(() => resolveRun([], 'anything')).toThrow(/\(none\)/)
  })
})

describe('runCompare', () => {
  const originalCwd = process.cwd()

  afterEach(() => process.chdir(originalCwd))

  function writeRun(root: string, name: string, gaps: Gap[]): void {
    const dir = join(root, '.redbar', 'runs', name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'gaps.json'), JSON.stringify({ gaps }))
  }

  it('throws when redbar has never kept a run in this project', () => {
    const root = tmpRoot()
    process.chdir(root)

    expect(() => runCompare([])).toThrow(/redbar briefing/i)
  })

  it('throws when only one run has ever been kept', () => {
    const root = tmpRoot()
    writeRun(root, '2026-01-01T00-00-00', [])
    process.chdir(root)

    expect(() => runCompare([])).toThrow(/need two runs/i)
  })

  it('diffs the two most recent kept runs by default and writes TREND.html beside .redbar/runs', () => {
    const root = tmpRoot()
    writeRun(root, '2026-01-01T00-00-00', [gap({ file: 'src/a.ts', symbol: 'A' })])
    writeRun(root, '2026-01-02T00-00-00', [])
    process.chdir(root)

    runCompare([])

    expect(loggedText()).toContain('closed: 1')
    expect(existsSync(join(root, '.redbar', 'TREND.html'))).toBe(true)
  })

  it('compares the repository named by --path, not the process working directory', () => {
    const root = tmpRoot()
    writeRun(root, '2026-01-01T00-00-00', [gap({ file: 'src/a.ts', symbol: 'A' })])
    writeRun(root, '2026-01-02T00-00-00', [])
    // deliberately NOT chdir'd: the positionals are run ids, so the repo can only arrive as a flag

    runCompare(['--path', root])

    expect(loggedText()).toContain('closed: 1')
    expect(existsSync(join(root, '.redbar', 'TREND.html'))).toBe(true)
  })

  it('diffs two named runs when they are given explicitly, instead of the two most recent', () => {
    const root = tmpRoot()
    writeRun(root, 'run-a', [gap({ file: 'src/a.ts', symbol: 'A' })])
    writeRun(root, 'run-b', [])
    writeRun(root, 'run-c', [gap({ file: 'src/z.ts', symbol: 'Z' })]) // most recent by name — ignored
    process.chdir(root)

    runCompare(['run-a', 'run-b'])

    // A closed between run-a and run-b; Z (only in run-c) never enters this comparison at all
    expect(loggedText()).toContain('closed: 1')
    expect(loggedText()).not.toContain('Z')
  })

  it('throws, naming the run, when a kept run has no gaps.json', () => {
    const root = tmpRoot()
    mkdirSync(join(root, '.redbar', 'runs', 'no-gaps-a'), { recursive: true })
    mkdirSync(join(root, '.redbar', 'runs', 'no-gaps-b'), { recursive: true })
    process.chdir(root)

    expect(() => runCompare([])).toThrow(/no-gaps-a.*no gaps\.json/)
  })
})

describe('runExplain', () => {
  it('explains every gap when scanning the whole repository with --all', () => {
    const root = tmpRoot()
    makeRepo(root)

    runExplain(['--all', '--path', root])

    expect(loggedText()).toContain('add')
    expect(loggedText()).toContain('No language model')
  })

  it('matches by symbol and explains only that gap, not the rest of the repository', () => {
    const root = tmpRoot()
    makeRepo(root, {
      files: {
        'src/math.ts': 'export function add(a, b) {\n  return a + b\n}\n',
        'src/sub.ts': 'export function subtract(a, b) {\n  return a - b\n}\n',
      },
    })

    runExplain(['add', '--all', '--path', root])

    const out = loggedText()
    expect(out).toContain('add — src/math.ts')
    expect(out).not.toContain('subtract')
  })

  it('answers a query that matches nothing by naming how many gaps DO exist, inventing no near miss', () => {
    const root = tmpRoot()
    makeRepo(root)

    runExplain(['nonexistentSymbol', '--all', '--path', root])

    expect(loggedText()).toMatch(/no gap matches "nonexistentSymbol"/)
    expect(loggedText()).toContain('redbar inspect')
  })

  it('says there is nothing to explain when the repository has no gaps at all', () => {
    const root = tmpRoot()
    makeRepo(root, {
      files: { 'src/math.ts': 'export function add(a, b) {\n  return a + b\n}\n' },
      lcov: lcov({ 'src/math.ts': { covered: [1, 2, 3], uncovered: [] } }),
    })

    runExplain(['--all', '--path', root])

    expect(loggedText()).toMatch(/no gaps\. nothing to explain/i)
  })
})

describe('runInit', () => {
  it('reports no missing library when the manifest already carries the full unit + e2e toolkit', () => {
    const root = tmpRoot()
    makeRepo(root, {
      manifest: {
        devDependencies: {
          vitest: '^1.0.0',
          '@vitest/coverage-v8': '^1.0.0',
          supertest: '^6.0.0',
          '@playwright/test': '^1.0.0',
        },
      },
    })

    runInit([root])

    const out = loggedText()
    expect(out).toContain('language: TypeScript')
    expect(out).toContain('runner:   vitest')
    expect(out).toContain('missing:  none')
  })

  it('names every missing library and prints the install command for exactly those', () => {
    const root = tmpRoot()
    makeRepo(root, { manifest: { name: 'bare' } })

    runInit([root])

    const out = loggedText()
    expect(out).toContain('missing:  vitest, @vitest/coverage-v8, supertest, @playwright/test')
    expect(out).toContain('npm install -D vitest @vitest/coverage-v8 supertest @playwright/test')
  })
})

describe('runMcpConfig', () => {
  it('prints the paste-ready registration for every client, in the fixed registry order', () => {
    runMcpConfig([])

    const out = loggedText()
    expect(out).toContain('# Claude Code')
    expect(out).toContain('npx -y redbar mcp')
    expect(out.indexOf('Claude Code')).toBeLessThan(out.indexOf('Codex'))
  })

  it('prints only the requested client when one is named', () => {
    runMcpConfig(['cursor'])

    const out = loggedText()
    expect(out).toContain('.cursor/mcp.json')
    expect(out).not.toContain('# Claude Code')
  })

  it('throws for an unknown client, naming the ones it does know', () => {
    expect(() => runMcpConfig(['bogus-client'])).toThrow(/unknown client "bogus-client"/)
  })

  it('never mentions --local in the guidance for the default, path-free npx launch', () => {
    runMcpConfig([])

    expect(stderrText()).not.toContain('--local')
  })

  describe('--local', () => {
    const originalArgv1 = process.argv[1] ?? ''

    afterEach(() => {
      process.argv[1] = originalArgv1
    })

    it('emits the absolute node + absolute cli.js launch, resolved through realpathSync', () => {
      // a real file stands in for cli.js: realpathSync only needs something that exists on disk,
      // and using this test file itself proves the resolution actually ran rather than being
      // short-circuited by a path that was never touched
      const stand_in = fileURLToPath(import.meta.url)
      process.argv[1] = stand_in

      runMcpConfig(['claude', '--local'])

      const out = loggedText()
      expect(out).toContain(realpathSync(stand_in))
      expect(out).toContain(process.execPath)
    })

    it('explains --local on stderr and says how to drop it once redbar is on npm', () => {
      process.argv[1] = fileURLToPath(import.meta.url)

      runMcpConfig(['claude', '--local'])

      expect(stderrText()).toContain('--local')
      expect(stderrText()).toContain('npx -y redbar mcp')
    })
  })
})

describe('runMcp', () => {
  it('registers exactly the three documented tools and starts the stdio transport', () => {
    const root = tmpRoot()
    makeGitRepo(root)

    runMcp([root])

    expect(mcpModule.serve).toHaveBeenCalledTimes(1)
    expect(Object.keys(lastTools()).sort()).toEqual([
      'redbar_briefing',
      'redbar_explain',
      'redbar_inspect',
    ])
  })

  describe('redbar_inspect', () => {
    it('falls back to the whole repository when this branch has no diff, and persists gaps.json', () => {
      const root = tmpRoot()
      makeGitRepo(root) // HEAD === main: `git diff main...HEAD` is empty

      runMcp([root])
      const text = tool('redbar_inspect')({})

      expect(text).toContain('language: TypeScript')

      const written = JSON.parse(readFileSync(join(root, '.redbar', 'gaps.json'), 'utf8')) as {
        base: string
        gaps: unknown[]
      }
      // the empty-diff result was 0 gaps; the fallback is what makes this the WHOLE repository
      expect(written.base).toBe('(whole repository)')
      expect(written.gaps.length).toBeGreaterThan(0)
    })

    it('keeps the empty-diff result instead of falling back when the caller explicitly passes all:false', () => {
      const root = tmpRoot()
      makeGitRepo(root)

      runMcp([root])
      tool('redbar_inspect')({ all: false })

      const written = JSON.parse(readFileSync(join(root, '.redbar', 'gaps.json'), 'utf8')) as {
        base: string
        gaps: unknown[]
      }
      expect(written.base).toBe('main')
      expect(written.gaps).toHaveLength(0)
    })

    it('analyzes the project named in args.path, not the root runMcp was started with', () => {
      const started = tmpRoot()
      makeGitRepo(started)
      const other = tmpRoot()
      makeGitRepo(other, { files: { 'src/other.ts': 'export function other() {\n  return 1\n}\n' } })

      runMcp([started])
      tool('redbar_inspect')({ path: other } satisfies ToolArgs)

      expect(existsSync(join(other, '.redbar', 'gaps.json'))).toBe(true)
      expect(existsSync(join(started, '.redbar', 'gaps.json'))).toBe(false)
    })
  })

  describe('redbar_briefing', () => {
    it('writes .redbar/TESTING.md in the analyzed project and returns the same document', () => {
      const root = tmpRoot()
      makeGitRepo(root)

      runMcp([root])
      const doc = tool('redbar_briefing')({})

      expect(doc).toContain('Testing brief —')
      expect(readFileSync(join(root, '.redbar', 'TESTING.md'), 'utf8')).toBe(doc)
    })

    it('truncates a document over 60,000 characters and points the agent at the file on disk', () => {
      const root = tmpRoot()
      const files: RepoFiles = {}
      for (let i = 0; i < 220; i++) {
        files[`src/gap${i}.ts`] = `export function gap${i}() {\n  return ${i}\n}\n`
      }
      makeGitRepo(root, { files })

      runMcp([root])
      const doc = tool('redbar_briefing')({})

      expect(doc.length).toBeLessThanOrEqual(60_000 + 300) // the cut plus the truncation notice
      expect(doc).toContain('[truncated by MCP:')
      expect(doc).toContain('.redbar/TESTING.md')

      // the FULL document, untruncated, is still the one written to disk
      const onDisk = readFileSync(join(root, '.redbar', 'TESTING.md'), 'utf8')
      expect(onDisk.length).toBeGreaterThan(60_000)
    })
  })

  describe('redbar_explain', () => {
    it('explains a matched gap with the full, measured audit trail', () => {
      const root = tmpRoot()
      makeGitRepo(root)

      runMcp([root])
      const out = tool('redbar_explain')({ symbol: 'add' })

      expect(out).toContain('No language model')
    })

    it('answers a query that matches nothing without inventing a near miss', () => {
      const root = tmpRoot()
      makeGitRepo(root)

      runMcp([root])
      const out = tool('redbar_explain')({ symbol: 'zzz-does-not-exist' })

      expect(out).toBe('redbar: no gap matches "zzz-does-not-exist".')
    })
  })
})
