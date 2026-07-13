import type { CoverageFormat, TestKind } from './types.js'

/**
 * A test runner for a language. One language can have several (jest vs vitest, maven vs
 * gradle), and they do NOT share a command or a report path — telling a jest user to run
 * vitest prints a command that can never produce the report redbar is waiting for.
 */
export type Runner = {
  name: string
  /** matches the project manifest when this runner is the one in use */
  detect: RegExp
  /** the command that GENERATES the report */
  coverageCommand: string
  /** where that command drops the report, relative to root */
  reportPath: string
}

export type Language = {
  id: string
  name: string
  /** files identifying the project root; first match wins */
  markers: string[]
  format: CoverageFormat
  /** runners this language can use; the first whose `detect` matches the manifest wins,
   *  and the first in the list is the fallback when the manifest names none */
  runners: Runner[]
  /**
   * Where sources live, for formats whose report keys are package-relative (JaCoCo).
   * Multi-module and Kotlin repos break without this: the coverage keys never intersect the
   * git paths, and inspect() returns zero gaps with no error. engine.ts probes for the one
   * that exists on disk.
   */
  sourceRoots?: string[]
  /**
   * Extensions holding product code. A changed file with one of these that is ABSENT from the
   * coverage report is not "uninstrumented" — it is a file no test imports, i.e. the largest
   * gap there is. Jest and pytest only instrument what a test imported, so the untested file
   * never shows up in the report at all.
   */
  sourceExtensions: string[]
  /** test/spec/fixture files — changed, but never themselves a gap */
  testFilePattern: RegExp
  /** matches an exported/public symbol declaration; group 1 = the name */
  symbolPatterns: RegExp[]
  /** test libs `init` proposes — the human approves, the tool never installs */
  testLibs: Record<TestKind, string[]>
  installCommand: (libs: string[]) => string
  /** does the agent write tests in this language? false = inspect only */
  canFix: boolean
}

// ORDER MATTERS: the first matching marker wins detection. Specific first, generic last —
// `package.json` shows up in plenty of polyglot repos, so it goes at the bottom.
// The escape hatch is always there: redbar.config.json { "language": "rust" }.
export const LANGUAGES: Language[] = [
  {
    id: 'rust',
    name: 'Rust',
    markers: ['Cargo.toml'],
    format: 'lcov',
    runners: [
      {
        name: 'cargo-llvm-cov',
        detect: /\[package\]/,
        coverageCommand: 'cargo llvm-cov --lcov --output-path lcov.info',
        reportPath: 'lcov.info',
      },
    ],
    sourceExtensions: ['.rs'],
    testFilePattern: /(^|\/)tests\/|_test\.rs$/,
    symbolPatterns: [
      /^\s*pub\s+(?:async\s+)?fn\s+(\w+)/,
      /^\s*pub\s+struct\s+(\w+)/,
      /^\s*pub\s+enum\s+(\w+)/,
      /^\s*impl\s+(?:\w+\s+for\s+)?(\w+)/,
    ],
    testLibs: {
      unit: ['cargo-llvm-cov'],
      integration: ['tokio', 'reqwest'],
      e2e: ['@playwright/test'],
    },
    installCommand: (libs) => `cargo add --dev ${libs.join(' ')}`,
    canFix: true,
  },
  {
    id: 'go',
    name: 'Go',
    markers: ['go.mod'],
    format: 'cobertura',
    runners: [
      {
        name: 'go-test',
        detect: /^module\s/m,
        coverageCommand:
          'go test ./... -coverprofile=coverage.out && gocover-cobertura < coverage.out > coverage.xml',
        reportPath: 'coverage.xml',
      },
    ],
    sourceExtensions: ['.go'],
    testFilePattern: /_test\.go$/,
    symbolPatterns: [/^func\s+(?:\([^)]*\)\s+)?([A-Z]\w*)/, /^type\s+([A-Z]\w*)/],
    testLibs: {
      unit: ['github.com/stretchr/testify'],
      integration: ['github.com/testcontainers/testcontainers-go'],
      e2e: ['@playwright/test'],
    },
    installCommand: (libs) => `go get ${libs.join(' ')}`,
    canFix: false, // flips to true once conventions/go/ exists
  },
  {
    id: 'java',
    name: 'Java',
    markers: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    format: 'jacoco',
    runners: [
      {
        name: 'gradle',
        detect: /plugins\s*\{|apply\s+plugin/,
        coverageCommand: './gradlew test jacocoTestReport',
        reportPath: 'build/reports/jacoco/test/jacocoTestReport.xml',
      },
      {
        name: 'maven',
        detect: /<project[\s>]/,
        coverageCommand: 'mvn -q test jacoco:report',
        reportPath: 'target/site/jacoco/jacoco.xml',
      },
    ],
    sourceRoots: ['src/main/java', 'src/main/kotlin', 'src/main/scala'],
    sourceExtensions: ['.java', '.kt', '.scala'],
    testFilePattern: /(^|\/)src\/test\/|Tests?\.(java|kt|scala)$/,
    symbolPatterns: [
      /^\s*public\s+(?:abstract\s+|final\s+)?class\s+(\w+)/,
      /^\s*public\s+(?:static\s+|final\s+|synchronized\s+|abstract\s+)*[\w<>\[\].]+\s+(\w+)\s*\(/,
    ],
    testLibs: {
      unit: ['org.junit.jupiter:junit-jupiter', 'org.mockito:mockito-core'],
      integration: [
        'org.springframework.boot:spring-boot-starter-test',
        'org.testcontainers:junit-jupiter',
      ],
      e2e: ['com.microsoft.playwright:playwright'],
    },
    // maven has no install-by-command: init prints the block for the human to paste
    installCommand: (libs) =>
      `# add to pom.xml (<dependencies>, with <scope>test</scope>):\n${libs
        .map((l) => `#   ${l}`)
        .join('\n')}`,
    canFix: true,
  },
  {
    id: 'php',
    name: 'PHP',
    markers: ['composer.json'],
    format: 'cobertura',
    runners: [
      {
        name: 'phpunit',
        detect: /"phpunit\/phpunit"/,
        coverageCommand: 'vendor/bin/phpunit --coverage-cobertura coverage.xml',
        reportPath: 'coverage.xml',
      },
    ],
    sourceExtensions: ['.php'],
    testFilePattern: /(^|\/)tests?\/|Test\.php$/i,
    symbolPatterns: [
      /^\s*(?:final\s+|abstract\s+)?class\s+(\w+)/,
      /^\s*public\s+(?:static\s+)?function\s+(\w+)/,
    ],
    testLibs: {
      unit: ['phpunit/phpunit'],
      integration: ['phpunit/phpunit', 'guzzlehttp/guzzle'],
      e2e: ['@playwright/test'],
    },
    installCommand: (libs) => `composer require --dev ${libs.join(' ')}`,
    canFix: true,
  },
  {
    id: 'python',
    name: 'Python',
    markers: ['pyproject.toml', 'setup.py', 'setup.cfg'],
    format: 'cobertura',
    runners: [
      {
        name: 'pytest',
        detect: /pytest/,
        coverageCommand: 'pytest --cov --cov-report=xml',
        reportPath: 'coverage.xml',
      },
    ],
    sourceExtensions: ['.py'],
    testFilePattern: /(^|\/)tests?\/|(^|\/)test_[^\/]+\.py$|_test\.py$/,
    symbolPatterns: [/^def\s+(\w+)/, /^class\s+(\w+)/],
    testLibs: {
      unit: ['pytest', 'pytest-cov'],
      integration: ['pytest', 'httpx', 'testcontainers'],
      e2e: ['pytest-playwright'],
    },
    installCommand: (libs) => `pip install -U ${libs.join(' ')}`,
    canFix: true,
  },
  {
    id: 'ts',
    name: 'TypeScript',
    markers: ['package.json'],
    format: 'lcov',
    runners: [
      {
        name: 'vitest',
        detect: /"vitest"\s*:/,
        // lcov is NOT a vitest default reporter — plain `--coverage` writes clover/html and
        // leaves reportPath missing, so the error would tell the user to run a command that
        // cannot fix the error
        coverageCommand: 'npx vitest run --coverage --coverage.reporter=lcov',
        reportPath: 'coverage/lcov.info',
      },
      {
        name: 'jest',
        // `"jest":` and not /jest/ — otherwise ts-jest or jest-environment-jsdom sitting in a
        // vitest project would win the match
        detect: /"jest"\s*:/,
        // collectCoverageFrom is not optional: without it jest only instruments what a test
        // IMPORTED, so a file no test touches never reaches the report and its gap is invisible
        coverageCommand:
          "npx jest --coverage --coverageReporters=lcov --collectCoverageFrom='src/**/*.{ts,tsx,js,jsx}'",
        reportPath: 'coverage/lcov.info',
      },
    ],
    sourceExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    // `.d.ts` is not testable at all — it declares types and emits no runtime. Tooling files
    // (jest.resolver.js, vite.config.ts, metro.config.js) are build config, not product code.
    // Both showed up as "gaps" on a real repo, which is noise in a report meant to be a to-do list.
    testFilePattern:
      /(^|\/)(__tests__|__mocks__|e2e)\/|\.(test|spec)\.[jt]sx?$|\.d\.ts$|(^|\/)[\w.-]*\.(config|setup|resolver)\.[jt]sx?$|(^|\/)(jest|vitest|metro|babel|eslint)\.[\w.]*[jt]sx?$/,
    // A top-level declaration is one at column 0 — `export` is NOT required. Real React code
    // writes `const Button = (...)` and exports it at the bottom with `export default Button`;
    // demanding the keyword here left every component in a real app named "(no symbol)".
    symbolPatterns: [
      /^export\s+default\s+(?:async\s+)?function\s+(\w+)/,
      /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
      /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/,
      /^(?:export\s+)?(?:const|let)\s+(\w+)/,
    ],
    testLibs: {
      unit: ['vitest', '@vitest/coverage-v8'],
      integration: ['vitest', 'supertest'],
      e2e: ['@playwright/test'],
    },
    installCommand: (libs) => `npm install -D ${libs.join(' ')}`,
    canFix: true,
  },
]

export function byId(id: string): Language | null {
  return LANGUAGES.find((l) => l.id === id) ?? null
}
