import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { hasTests } from '../src/files.js'
import { byId } from '../src/languages.js'
import { ensureCoverage } from '../src/prepare.js'

const ts = byId('ts')!
const runner = ts.runners[0]! // vitest

const roots: string[] = []

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'redbar-prepare-'))
  roots.push(root)

  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, content)
  }
  return root
}

/** touch, with an explicit time — the staleness rule is a comparison of mtimes and nothing else */
const setMtime = (path: string, secondsFromEpoch: number) =>
  utimesSync(path, secondsFromEpoch, secondsFromEpoch)

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('ensureCoverage', () => {
  it('refuses to run anything when the project has no test files at all', () => {
    const root = repo({ 'package.json': '{"devDependencies":{"vitest":"1"}}', 'src/a.ts': 'export const a = 1' })

    // running the suite here would write an empty report, which crosses to "no gaps" — a wrong
    // answer that sounds like good news. Stopping is the only honest move.
    expect(() => ensureCoverage(root, ts, runner, 'coverage/lcov.info', true)).toThrow(
      /no test files/,
    )
  })

  it('prints the runner command and stops when run is off', () => {
    const root = repo({
      'package.json': '{"devDependencies":{"vitest":"1"}}',
      'src/a.ts': 'export const a = 1',
      'src/a.test.ts': 'it("x", () => {})',
    })

    expect(() => ensureCoverage(root, ts, runner, 'coverage/lcov.info', false)).toThrow(
      /coverage report not found.*vitest/s,
    )
  })

  it('uses the report as-is when it is newer than the source', () => {
    const root = repo({
      'package.json': '{"devDependencies":{"vitest":"1"}}',
      'src/a.ts': 'export const a = 1',
      'coverage/lcov.info': 'SF:src/a.ts\nDA:1,1\nend_of_record',
    })
    setMtime(join(root, 'src/a.ts'), 1_000)
    setMtime(join(root, 'coverage/lcov.info'), 2_000)

    expect(ensureCoverage(root, ts, runner, 'coverage/lcov.info', false)).toEqual({
      ran: false,
      stale: false,
    })
  })

  it('flags the report stale when any source file is newer than it', () => {
    const root = repo({
      'package.json': '{"devDependencies":{"vitest":"1"}}',
      'src/a.ts': 'export const a = 1',
      'coverage/lcov.info': 'SF:src/a.ts\nDA:1,1\nend_of_record',
    })
    setMtime(join(root, 'coverage/lcov.info'), 1_000)
    setMtime(join(root, 'src/a.ts'), 2_000) // edited after the last coverage run

    expect(ensureCoverage(root, ts, runner, 'coverage/lcov.info', false).stale).toBe(true)
  })

  it('a newer TEST file does not make the report stale — only product code does', () => {
    const root = repo({
      'package.json': '{"devDependencies":{"vitest":"1"}}',
      'src/a.ts': 'export const a = 1',
      'src/a.test.ts': 'it("x", () => {})',
      'coverage/lcov.info': 'SF:src/a.ts\nDA:1,1\nend_of_record',
    })
    setMtime(join(root, 'src/a.ts'), 1_000)
    setMtime(join(root, 'coverage/lcov.info'), 2_000)
    setMtime(join(root, 'src/a.test.ts'), 3_000)

    // a test edited after the run may well be the reason to re-run, but it does not make the
    // report LIE about the product code — and crying wolf on every test edit trains people to
    // ignore the warning that matters
    expect(ensureCoverage(root, ts, runner, 'coverage/lcov.info', false).stale).toBe(false)
  })
})

describe('hasTests', () => {
  it('is true when a test file exists', () => {
    const root = repo({ 'package.json': '{}', 'src/a.test.ts': '' })
    expect(hasTests(root, ts)).toBe(true)
  })

  it('is false for a project with only product code', () => {
    const root = repo({ 'package.json': '{}', 'src/a.ts': '' })
    expect(hasTests(root, ts)).toBe(false)
  })

  it('does not mistake node_modules for the project having tests', () => {
    const root = repo({ 'package.json': '{}', 'node_modules/dep/index.test.js': '' })
    expect(hasTests(root, ts)).toBe(false)
  })
})
