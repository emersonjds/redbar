/**
 * `runExecute` in-process: real git, in a throwaway repo — never the repo this suite runs in — and
 * a mocked process boundary (`node:child_process`) standing in for the coding agent, the per-test
 * runner and the coverage command. `git` itself passes straight through to the real binary, because
 * the dirty-tree gate and the diff have to be genuine for this test to mean anything.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { confirm, runExecute, testRunCommand } from '../src/cli.js'

// mutable knobs the mocked child_process reads — reset in beforeEach, overridden per test
const mockState = vi.hoisted(() => ({
  commandFound: false, // `command -v <bin>` — whether onPath() finds an agent
  agentBin: 'claude',
  agentAction: 'write-good-test' as 'write-good-test' | 'none' | 'throw' | 'touch-source',
  agentStdout: 'wrote src/calc.test.ts',
  testFileContent: '',
  afterLcov: '',
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    // git runs for real — everything else (the agent, `command -v`, the one-file test runner)
    // is the process-spawning boundary this test replaces instead of invoking a model or a browser
    execFileSync: vi.fn((cmd: string, args: string[] = [], opts: Record<string, unknown> = {}) => {
      if (cmd === 'git') return actual.execFileSync(cmd, args, opts as never)
      if (cmd === 'command') {
        if (!mockState.commandFound) throw new Error('not found')
        return ''
      }
      if (cmd === 'sh') return '' // the ONE test file, never really run
      if (cmd === mockState.agentBin) {
        if (mockState.agentAction === 'throw') throw new Error('ETIMEDOUT: the agent hung')
        if (mockState.agentAction === 'write-good-test') {
          writeFileSync(join(opts.cwd as string, 'src', 'calc.test.ts'), mockState.testFileContent)
        }
        if (mockState.agentAction === 'touch-source') {
          // the misbehaving agent: writes the test AND "fixes" the product file to make it pass
          writeFileSync(join(opts.cwd as string, 'src', 'calc.test.ts'), mockState.testFileContent)
          writeFileSync(join(opts.cwd as string, 'src', 'calc.ts'), FEATURE_CALC.replace('div by zero', 'nope'))
        }
        return mockState.agentStdout
      }
      return '' // anything else (a browser found by htmlToPdf on this machine) — harmless
    }),
    // the SECOND measurement's coverage command — faked, not run, so this test never shells out
    // to a real vitest
    execSync: vi.fn((_cmd: string, opts: Record<string, unknown> = {}) => {
      writeFileSync(join(opts.cwd as string, 'coverage', 'lcov.info'), mockState.afterLcov)
      return Buffer.from('')
    }),
  }
})

vi.mock('node:readline', () => ({ createInterface: vi.fn() }))

function answerWith(answer: string): void {
  vi.mocked(createInterface).mockReturnValue({
    question: (_q: string, cb: (a: string) => void) => cb(answer),
    close: vi.fn(),
  } as never)
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

const INITIAL_CALC = 'export function add(a: number, b: number): number {\n  return a + b\n}\n'

// `divide` is new on the feature branch — a real `git diff` produces this gap, nothing injected.
// One `if` → 1 branch → severity "high" (fullyUncovered, 1-4 branches), not the default "critical".
const FEATURE_CALC =
  INITIAL_CALC +
  '\n' +
  "export function divide(a: number, b: number): number {\n  if (b === 0) throw new Error('div by zero')\n  return a / b\n}\n"

// lines 5-8 are `divide`'s body — entirely uncovered
const BEFORE_LCOV = 'SF:src/calc.ts\nDA:1,1\nDA:2,1\nDA:3,1\nDA:5,0\nDA:6,0\nDA:7,0\nDA:8,0\nend_of_record\n'
// the "after" report a passing test for divide would actually produce
const AFTER_LCOV = 'SF:src/calc.ts\nDA:1,1\nDA:2,1\nDA:3,1\nDA:5,1\nDA:6,1\nDA:7,1\nDA:8,1\nend_of_record\n'

const GOOD_TEST =
  "import { describe, expect, it } from 'vitest'\n" +
  "import { divide } from './calc.js'\n\n" +
  "describe('divide', () => {\n" +
  "  it('divides two numbers', () => {\n" +
  '    expect(divide(4, 2)).toBe(2)\n' +
  '  })\n' +
  '  it(\'throws on zero\', () => {\n' +
  "    expect(() => divide(1, 0)).toThrow()\n" +
  '  })\n' +
  '})\n'

/** A real repo: `main` has only `add`, `feat` adds `divide` — a genuine `git diff`, a real gap. */
function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'redbar-cli-execute-'))
  git(root, ['init', '--quiet', '-b', 'main'])
  git(root, ['config', 'user.email', 'redbar-test@example.com'])
  git(root, ['config', 'user.name', 'redbar test'])
  writeFileSync(join(root, '.gitignore'), 'coverage/\n.redbar/\nnode_modules/\n')
  writeFileSync(join(root, 'package.json'), '{"name":"fixture","devDependencies":{"vitest":"^4.0.0"}}')
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src', 'calc.ts'), INITIAL_CALC)
  // a pre-existing test, committed on both branches: the "after" measurement re-runs the coverage
  // command only when hasTests() finds ONE test file in the tree, and a gate that deletes the
  // agent's own test file (touched-source, too-many-files) must not also delete this project's
  // only reason to have a coverage command at all
  mkdirSync(join(root, 'test'), { recursive: true })
  writeFileSync(
    join(root, 'test', 'sanity.test.ts'),
    "import { expect, it } from 'vitest'\nit('sanity', () => { expect(1).toBe(1) })\n",
  )
  git(root, ['add', '-A'])
  git(root, ['commit', '--quiet', '-m', 'base'])

  git(root, ['checkout', '--quiet', '-b', 'feat'])
  writeFileSync(join(root, 'src', 'calc.ts'), FEATURE_CALC)
  git(root, ['add', '-A'])
  git(root, ['commit', '--quiet', '-m', 'add divide'])

  mkdirSync(join(root, 'coverage'), { recursive: true })
  writeFileSync(join(root, 'coverage', 'lcov.info'), BEFORE_LCOV)

  return root
}

const roots: string[] = []
function trackedRepo(): string {
  const root = makeRepo()
  roots.push(root)
  return root
}

let originalIsTTY: boolean | undefined

beforeEach(() => {
  vi.clearAllMocks()
  mockState.commandFound = false
  mockState.agentBin = 'claude'
  mockState.agentAction = 'write-good-test'
  mockState.agentStdout = 'wrote src/calc.test.ts'
  mockState.testFileContent = GOOD_TEST
  mockState.afterLcov = AFTER_LCOV
  answerWith('no') // safe default: an unexpected prompt never accidentally proceeds

  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  originalIsTTY = process.stdout.isTTY
})

afterEach(() => {
  vi.restoreAllMocks()
  if (originalIsTTY === undefined) delete (process.stdout as { isTTY?: boolean }).isTTY
  else process.stdout.isTTY = originalIsTTY
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function stderrText(): string {
  return (process.stderr.write as unknown as { mock: { calls: unknown[][] } }).mock.calls
    .map((c) => String(c[0]))
    .join('')
}

describe('runExecute — the dirty-tree refusal', () => {
  it('refuses before touching anything when the working tree is not clean', async () => {
    const root = trackedRepo()
    writeFileSync(join(root, 'oops.txt'), 'a human was here\n') // untracked, not gitignored

    await expect(runExecute([root, '--agent', 'claude', '--yes', '--base', 'main'])).rejects.toThrow(
      /working tree is not clean/,
    )
    expect(execFileSync).not.toHaveBeenCalledWith('claude', expect.anything(), expect.anything())
  })
})

describe('runExecute — agent selection', () => {
  it('throws on an unknown --agent', async () => {
    const root = trackedRepo()
    await expect(
      runExecute([root, '--agent', 'not-a-real-agent', '--yes', '--base', 'main']),
    ).rejects.toThrow(/unknown agent "not-a-real-agent"/)
  })

  it('throws when no agent is on PATH and none was named', async () => {
    const root = trackedRepo()
    mockState.commandFound = false // `command -v` fails for every candidate
    await expect(runExecute([root, '--yes', '--base', 'main'])).rejects.toThrow(
      /no coding agent found on PATH/,
    )
  })
})

describe('runExecute — no work to do', () => {
  it('reports no gaps at all when the diff is empty', async () => {
    const root = trackedRepo()
    await runExecute([root, '--agent', 'claude', '--yes', '--base', 'feat']) // HEAD vs itself

    expect(console.log).toHaveBeenCalledWith('redbar: no gaps. Nothing for the agent to do.')
    expect(existsSync(join(root, '.redbar'))).toBe(false)
  })

  it('reports the band is empty when the only gap sits below the default "critical" threshold', async () => {
    const root = trackedRepo() // divide is severity "high": 1 branch, not the 5+ "critical" needs
    await runExecute([root, '--agent', 'claude', '--yes', '--base', 'main'])

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('no gaps at or above "critical". 1 gap(s) exist below it'),
    )
    expect(existsSync(join(root, '.redbar'))).toBe(false)
  })
})

describe('runExecute — --max validation', () => {
  it('rejects a non-integer --max', async () => {
    const root = trackedRepo()
    await expect(
      runExecute([root, '--agent', 'claude', '--yes', '--base', 'main', '--severity', 'high', '--max', 'nope']),
    ).rejects.toThrow(/--max must be a positive integer/)
  })

  it('rejects --max 0', async () => {
    const root = trackedRepo()
    await expect(
      runExecute([root, '--agent', 'claude', '--yes', '--base', 'main', '--severity', 'high', '--max', '0']),
    ).rejects.toThrow(/--max must be a positive integer/)
  })
})

describe('runExecute — the authorization gate', () => {
  it('stops without touching anything when there is no TTY and no --yes', async () => {
    const root = trackedRepo()
    process.stdout.isTTY = false

    await runExecute([root, '--agent', 'claude', '--base', 'main', '--severity', 'high'])

    expect(stderrText()).toContain('not a terminal and no --yes')
    expect(createInterface).not.toHaveBeenCalled()
    expect(existsSync(join(root, 'src', 'calc.test.ts'))).toBe(false)
    expect(existsSync(join(root, '.redbar'))).toBe(false)
  })

  it('aborts and touches nothing when the human answers no at the prompt', async () => {
    const root = trackedRepo()
    process.stdout.isTTY = true
    answerWith('n')

    await runExecute([root, '--agent', 'claude', '--base', 'main', '--severity', 'high'])

    expect(stderrText()).toContain('redbar: aborted. Nothing was touched.')
    expect(existsSync(join(root, 'src', 'calc.test.ts'))).toBe(false)
    expect(execFileSync).not.toHaveBeenCalledWith('claude', expect.anything(), expect.anything())
  })

  it('proceeds through the prompt when the human answers yes', async () => {
    const root = trackedRepo()
    process.stdout.isTTY = true
    answerWith('yes')

    await runExecute([root, '--agent', 'claude', '--base', 'main', '--severity', 'high'])

    expect(createInterface).toHaveBeenCalledTimes(1)
    expect(existsSync(join(root, '.redbar', 'latest'))).toBe(true)
  })
})

describe('runExecute — the full run: agent handoff, the gap loop, the verdict, run-directory bookkeeping', () => {
  it('hands the gap to the agent, measures the fix, and writes a kept run', async () => {
    const root = trackedRepo()

    await runExecute([root, '--agent', 'claude', '--yes', '--base', 'main', '--severity', 'high'])

    // the agent handoff: the plan is printed before consent, then the agent actually ran
    expect(stderrText()).toContain('redbar: agent claude')
    expect(stderrText()).toContain('divide')
    expect(execFileSync).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['-p']),
      expect.objectContaining({ cwd: root }),
    )

    // the per-gap loop reported progress, and the gate accepted what the agent wrote
    expect(stderrText()).toMatch(/closed\s+divide/)

    // the second measurement really ran — the report was regenerated, not read stale
    expect(readFileSync(join(root, 'coverage', 'lcov.info'), 'utf8')).toBe(AFTER_LCOV)

    // run-directory bookkeeping: a fresh dated run, `.redbar/latest` pointing at it
    const runDirs = readdirSync(join(root, '.redbar', 'runs'))
    expect(runDirs).toHaveLength(1)
    const runDir = join(root, '.redbar', 'runs', runDirs[0]!)
    expect(existsSync(join(runDir, 'OUTCOME.md'))).toBe(true)
    expect(existsSync(join(runDir, 'OUTCOME.html'))).toBe(true)
    expect(existsSync(join(runDir, 'gaps.json'))).toBe(true)
    expect(existsSync(join(runDir, 'summary.json'))).toBe(true)
    expect(existsSync(join(root, '.redbar', 'latest'))).toBe(true)

    const outcome = readFileSync(join(runDir, 'OUTCOME.md'), 'utf8')
    expect(outcome).toContain('divide')
    expect(outcome.toLowerCase()).toContain('closed')

    // the outcome is on stdout too — for whoever piped the command
    expect(console.log).toHaveBeenCalledWith(outcome)
    expect(stderrText()).toContain(join(runDir, 'OUTCOME.md'))
  })

  it('carries --max within the band without widening it', async () => {
    const root = trackedRepo()

    await runExecute([root, '--agent', 'claude', '--yes', '--base', 'main', '--severity', 'high', '--max', '1'])

    // exactly the one gap in band, handed to the agent exactly once
    const agentCalls = vi
      .mocked(execFileSync)
      .mock.calls.filter(([cmd]) => cmd === 'claude')
    expect(agentCalls).toHaveLength(1)
  })

  it('reverts product code the agent touched and does not close the gap — measured, not the agent\'s word', async () => {
    const root = trackedRepo()
    mockState.agentAction = 'touch-source'

    await runExecute([root, '--agent', 'claude', '--yes', '--base', 'main', '--severity', 'high'])

    // git, not the agent's claim: the product file is back to what the diff actually committed
    expect(readFileSync(join(root, 'src', 'calc.ts'), 'utf8')).toBe(FEATURE_CALC)
    expect(stderrText()).toMatch(/touched-source\s+divide/)

    const runDirs = readdirSync(join(root, '.redbar', 'runs'))
    const outcome = readFileSync(join(root, '.redbar', 'runs', runDirs[0]!, 'OUTCOME.md'), 'utf8')
    expect(outcome.toLowerCase()).toContain('touched-source')
  })
})

describe('runExecute — an agent that times out', () => {
  it('marks the gap timeout and still writes a kept run instead of throwing', async () => {
    const root = trackedRepo()
    mockState.agentAction = 'throw'

    await runExecute([root, '--agent', 'claude', '--yes', '--base', 'main', '--severity', 'high'])

    expect(stderrText()).toMatch(/timeout\s+divide/)
    const runDirs = readdirSync(join(root, '.redbar', 'runs'))
    const outcome = readFileSync(join(root, '.redbar', 'runs', runDirs[0]!, 'OUTCOME.md'), 'utf8')
    expect(outcome.toLowerCase()).toContain('timeout')
  })
})

describe('testRunCommand', () => {
  it('names the vitest one-file invocation', () => {
    expect(testRunCommand('vitest')).toBe('npx vitest run')
  })

  it('names the jest one-file invocation', () => {
    expect(testRunCommand('jest')).toBe('npx jest')
  })

  it('falls back to `npm test --` for a runner it does not recognize', () => {
    expect(testRunCommand('some-future-runner')).toBe('npm test --')
  })
})

describe('confirm', () => {
  it('resolves true for a y/yes answer, case-insensitively, and closes the interface', async () => {
    const close = vi.fn()
    vi.mocked(createInterface).mockReturnValue({
      question: (_q: string, cb: (a: string) => void) => cb('YES'),
      close,
    } as never)

    await expect(confirm('proceed? ')).resolves.toBe(true)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('resolves false for anything that is not y/yes', async () => {
    vi.mocked(createInterface).mockReturnValue({
      question: (_q: string, cb: (a: string) => void) => cb('nope'),
      close: vi.fn(),
    } as never)

    await expect(confirm('proceed? ')).resolves.toBe(false)
  })

  it('trims whitespace around the answer before matching', async () => {
    vi.mocked(createInterface).mockReturnValue({
      question: (_q: string, cb: (a: string) => void) => cb('  y  \n'),
      close: vi.fn(),
    } as never)

    await expect(confirm('proceed? ')).resolves.toBe(true)
  })
})
