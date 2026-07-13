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

  it('every language declares markers, a coverage command, and libs for all 3 kinds', () => {
    for (const lang of LANGUAGES) {
      expect(lang.markers.length, `${lang.id} has no markers`).toBeGreaterThan(0)
      expect(lang.coverageCommand, `${lang.id} has no coverageCommand`).toBeTruthy()
      expect(lang.testLibs.unit, `${lang.id} has no unit libs`).toBeDefined()
      expect(lang.testLibs.integration, `${lang.id} has no integration libs`).toBeDefined()
      expect(lang.testLibs.e2e, `${lang.id} has no e2e libs`).toBeDefined()
      expect(lang.symbolPatterns.length, `${lang.id} has no symbolPatterns`).toBeGreaterThan(0)
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
