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

  // Found on a real Next.js repo: public/ holds SERVED assets, and MSW drops its generated
  // mockServiceWorker.js there. It ranked as the repo's #3 gap — 153 lines of vendor code nobody
  // should ever test. public/ is never product code.
  describe('the ts nonProductPattern keeps non-product files out of the gap list', () => {
    const ts = byId('ts')!

    it('excludes anything under public/', () => {
      expect(ts.nonProductPattern.test('public/mockServiceWorker.js')).toBe(true)
      expect(ts.nonProductPattern.test('apps/web/public/sw.js')).toBe(true)
    })

    it('still treats real source as product code', () => {
      expect(ts.nonProductPattern.test('src/features/busca/aplicar-busca.ts')).toBe(false)
      expect(ts.nonProductPattern.test('src/republic/office.ts')).toBe(false) // "public" inside a name
    })

    // Found on a real admin front-end: MSW handlers under mocks/ and a generated TanStack router
    // (routeTree.gen.ts) both ranked as gaps. Same class of noise as public/ and .d.ts — never
    // product code a test should chase.
    it('excludes MSW handlers under mocks/ and generated *.gen files', () => {
      expect(ts.nonProductPattern.test('src/features/financial-accounts/mocks/handlers.ts')).toBe(true)
      expect(ts.nonProductPattern.test('src/routeTree.gen.ts')).toBe(true)
    })

    it('does not over-match a name that merely contains "mocks" or "gen"', () => {
      expect(ts.nonProductPattern.test('src/mocks-helper.ts')).toBe(false)
      expect(ts.nonProductPattern.test('src/gen.ts')).toBe(false)
    })
  })

  /**
   * The POSITIVE question, and the one `nonProductPattern` cannot answer: every rejection below is
   * a real file that lives beside the tests, is collected by no runner, and asserts nothing.
   * `vitest.config.ts` and `conftest.py` are the two that started this — grading either as a silent
   * test is an accusation redbar cannot back up.
   */
  describe('testPattern is what the runner collects, and nothing else', () => {
    const cases: Record<string, { accepts: string[]; rejects: string[] }> = {
      // vitest/jest collect `*.test.*` and `*.spec.*`; `app.e2e-spec.ts` is the NestJS default
      ts: {
        accepts: ['src/math.test.ts', 'test/gap.spec.tsx', 'test/app.e2e-spec.ts', 'src/x.test.mjs'],
        rejects: ['vitest.config.ts', 'jest.setup.js', 'src/release.latest.ts', 'e2e/pages/login.page.ts', 'src/types.d.ts'],
      },
      // pytest: python_files = test_*.py *_test.py. conftest.py is fixtures, collected as none.
      python: {
        accepts: ['tests/test_api.py', 'app/api_test.py'],
        rejects: ['tests/conftest.py', 'tests/factories.py', 'src/contest.py'],
      },
      // go test compiles _test.go and nothing else; testutil/ and testdata are ordinary packages
      go: {
        accepts: ['pkg/api/handler_test.go'],
        rejects: ['internal/testutil/mock.go', 'pkg/api/testdata.go'],
      },
      // cargo builds each file at the TOP level of tests/ as its own crate; tests/common/mod.rs is
      // the Book's own shared-helper file and is deliberately not one
      rust: {
        accepts: ['tests/api.rs'],
        rejects: ['tests/common/mod.rs', 'src/lib.rs', 'build.rs'],
      },
      // surefire's suffix rule. Its `Test*` PREFIX rule is left out on purpose: it collects
      // TestUtils.java, a helper that asserts nothing.
      java: {
        accepts: ['src/test/java/app/UserTest.java', 'src/test/kotlin/app/UserTests.kt'],
        rejects: ['src/test/java/app/TestUtils.java', 'src/test/java/app/Fixtures.java'],
      },
      // phpunit's default testSuffix is Test.php, case-sensitive — Laravel's abstract TestCase.php
      // is the base class, not a test
      php: {
        accepts: ['tests/Unit/UserTest.php'],
        rejects: ['tests/TestCase.php', 'src/Release/Latest.php', 'tests/bootstrap.php'],
      },
    }

    for (const [id, { accepts, rejects }] of Object.entries(cases)) {
      it(`${id}: collects the runner test files and rejects the helpers beside them`, () => {
        const lang = byId(id)!
        for (const file of accepts) {
          expect(lang.testPattern.test(file), `${id} should collect ${file}`).toBe(true)
        }
        for (const file of rejects) {
          expect(lang.testPattern.test(file), `${id} must not call ${file} a test`).toBe(false)
        }
      })
    }

    it('covers every language in the registry', () => {
      expect(Object.keys(cases).sort()).toEqual(LANGUAGES.map((l) => l.id).sort())
    })
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
