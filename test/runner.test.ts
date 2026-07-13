import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { byId } from '../src/languages.js'
import { selectRunner } from '../src/runner.js'

const ts = byId('ts')!
const java = byId('java')!

function repo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'redbar-runner-'))
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content)
  return dir
}

describe('selectRunner', () => {
  // found on a real React Native repo: redbar told the user to run vitest on a jest project,
  // so the command it printed could never produce the report it was waiting for
  it('picks jest on a jest project', () => {
    const dir = repo({
      'package.json': JSON.stringify({ devDependencies: { jest: '^29.7.0' } }),
    })
    const runner = selectRunner(dir, ts)

    expect(runner.name).toBe('jest')
    expect(runner.coverageCommand).toContain('jest')
    expect(runner.coverageCommand).not.toContain('vitest')
  })

  it('picks vitest on a vitest project', () => {
    const dir = repo({
      'package.json': JSON.stringify({ devDependencies: { vitest: '^4.1.10' } }),
    })
    expect(selectRunner(dir, ts).name).toBe('vitest')
  })

  // "ts-jest" and "jest-environment-jsdom" must not make a vitest project look like jest
  it('does not mistake a jest-adjacent package for the jest runner', () => {
    const dir = repo({
      'package.json': JSON.stringify({
        devDependencies: { vitest: '^4.1.10', 'jest-environment-jsdom': '^29.0.0' },
      }),
    })
    expect(selectRunner(dir, ts).name).toBe('vitest')
  })

  it('falls back to the first runner when the manifest names none', () => {
    const dir = repo({ 'package.json': '{}' })
    expect(selectRunner(dir, ts).name).toBe('vitest')
  })

  it('picks gradle over maven when the project is gradle', () => {
    const dir = repo({ 'build.gradle': 'plugins { id "jacoco" }' })
    const runner = selectRunner(dir, java)

    expect(runner.name).toBe('gradle')
    expect(runner.coverageCommand).toContain('gradlew')
    expect(runner.reportPath).toBe('build/reports/jacoco/test/jacocoTestReport.xml')
  })

  it('picks maven on a pom project', () => {
    const dir = repo({ 'pom.xml': '<project><artifactId>x</artifactId></project>' })
    const runner = selectRunner(dir, java)

    expect(runner.name).toBe('maven')
    expect(runner.reportPath).toBe('target/site/jacoco/jacoco.xml')
  })

  it('the jest command collects coverage from files no test imports', () => {
    const dir = repo({ 'package.json': JSON.stringify({ devDependencies: { jest: '^29' } }) })
    // without collectCoverageFrom, jest only reports files a test imported — the untested
    // file never lands in the report at all
    expect(selectRunner(dir, ts).coverageCommand).toContain('collectCoverageFrom')
  })
})
