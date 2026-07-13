import { describe, expect, it } from 'vitest'
import { LANGUAGES, byId } from '../src/languages.js'

describe('language registry', () => {
  it('covers the languages in scope', () => {
    const ids = LANGUAGES.map((l) => l.id)
    expect(ids).toEqual(expect.arrayContaining(['ts', 'java', 'python', 'rust', 'php', 'go']))
  })

  // was: `expect([...]).toContain(lang.format)` — tautological, the type union already proved it
  // and the compiler made it unfailable. This one can actually fail: a jacoco language whose
  // report keys are package-relative is unusable without a source root, and the symptom is
  // zero gaps with no error.
  it('every jacoco language declares its source roots', () => {
    for (const lang of LANGUAGES.filter((l) => l.format === 'jacoco')) {
      expect(lang.sourceRoots?.length, `${lang.id} is jacoco but declares no sourceRoots`)
        .toBeGreaterThan(0)
    }
  })

  it('every language declares markers, source extensions, and the language-wide libs', () => {
    for (const lang of LANGUAGES) {
      expect(lang.markers.length, `${lang.id} has no markers`).toBeGreaterThan(0)
      expect(lang.sourceExtensions.length, `${lang.id} has no sourceExtensions`).toBeGreaterThan(0)
      expect(lang.testLibs.integration, `${lang.id} has no integration libs`).toBeDefined()
      expect(lang.testLibs.e2e, `${lang.id} has no e2e libs`).toBeDefined()
      expect(lang.symbolPatterns.length, `${lang.id} has no symbolPatterns`).toBeGreaterThan(0)
    }
  })

  // unit libs belong to the runner, never to the language — a jest project told to install
  // vitest would follow the advice and break its own setup
  it('no language claims a unit-test lib — that is the runner job', () => {
    for (const lang of LANGUAGES) {
      expect(lang.testLibs, `${lang.id} still owns unit libs`).not.toHaveProperty('unit')
    }
  })

  // a runner missing either half is unusable: the command that builds the report and the path
  // it lands at have to travel together, or redbar waits at the wrong place
  it('every language has at least one runner, and every runner is complete', () => {
    for (const lang of LANGUAGES) {
      expect(lang.runners.length, `${lang.id} has no runners`).toBeGreaterThan(0)
      for (const runner of lang.runners) {
        const where = `${lang.id}/${runner.name}`
        expect(runner.coverageCommand, `${where} has no coverageCommand`).toBeTruthy()
        expect(runner.reportPath, `${where} has no reportPath`).toBeTruthy()
        expect(runner.detect, `${where} has no detect pattern`).toBeInstanceOf(RegExp)
      }
    }
  })

  it('byId finds the language and returns null for an unknown id', () => {
    expect(byId('rust')?.name).toBe('Rust')
    expect(byId('cobol')).toBeNull()
  })

  it('installCommand builds the command for the language package manager', () => {
    expect(byId('ts')?.installCommand(['vitest'])).toBe('npm install -D vitest')
    expect(byId('php')?.installCommand(['phpunit/phpunit'])).toBe(
      'composer require --dev phpunit/phpunit',
    )
  })
})
