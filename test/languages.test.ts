import { describe, expect, it } from 'vitest'
import { LANGUAGES, byId } from '../src/languages.js'

describe('language registry', () => {
  it('covers the languages in scope', () => {
    const ids = LANGUAGES.map((l) => l.id)
    expect(ids).toEqual(expect.arrayContaining(['ts', 'java', 'python', 'rust', 'php', 'go']))
  })

  it('every coverage format maps to one of the three parsers — no orphan format', () => {
    for (const lang of LANGUAGES) {
      expect(['lcov', 'jacoco', 'cobertura']).toContain(lang.format)
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
