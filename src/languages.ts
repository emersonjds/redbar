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
  /**
   * The unit-test libraries THIS runner needs — not the language's.
   * A jest project must never be told to install vitest: following that advice breaks its setup.
   * The runner owns its libs for the same reason it owns its command.
   */
  unitLibs: string[]
}

/**
 * The canonical standard for one layer: the library's own documentation, never a house invention.
 *
 * This is the tie-breaker the whole project rests on. `conventions/<lang>/<layer>.md` spells the
 * standard out in full where we have written it down; where we have not, the briefing still names
 * the document and links it — and the model was TRAINED on that document, so it follows it far
 * more faithfully than it follows anything we could invent. That is why a language works on the
 * day it enters the registry, without waiting for a convention file to be authored for it.
 */
export type Standard = { name: string; url: string }

/**
 * An end-to-end tool a project might use. Detected from the manifest exactly like the unit runner —
 * "why Playwright and not Cypress?" is the same question as "why vitest and not jest?", and it has
 * the same answer: don't assume, read it from the project.
 *
 * First whose `detect` matches the manifest wins; the LAST entry is the default, so the tool that
 * ships with redbar's own convention (`e2e.md`) stays the fallback and nothing pre-existing breaks.
 */
export type E2eTool = { id: string; detect: RegExp; standard: Standard; conventionFile: string }

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
  /**
   * How an assertion is spelled in this language's test idiom.
   *
   * `execute` counts these in the file the agent wrote. Zero assertions means the test executes the
   * code and proves nothing: coverage rises, the suite goes green, and the gap looks closed. That is
   * the single most common failure mode of an AI test generator, and it is the reason the gate is
   * mechanical instead of a sentence in a prompt.
   */
  assertionPatterns: RegExp[]
  /**
   * Test libs `init` proposes for the layers that are language-wide. `unit` is NOT here:
   * it belongs to the runner (jest vs vitest), and putting it here is what made init tell a
   * jest project to install vitest. The human approves; the tool never installs.
   */
  testLibs: Record<Exclude<TestKind, 'unit'>, string[]>
  installCommand: (libs: string[]) => string
  /** the document the agent must follow for each layer. See `Standard`. */
  standards: Record<TestKind, Standard>
  /** e2e tools this language can use; first match wins, last is the default. See `E2eTool`. */
  e2eTools: E2eTool[]
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
        unitLibs: ['cargo-llvm-cov'],
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
    assertionPatterns: [/\bassert(_eq|_ne)?!\s*\(/, /\bpanic!\s*\(/],
    testLibs: {
      integration: ['tokio', 'reqwest'],
      e2e: ['@playwright/test'],
    },
    installCommand: (libs) => `cargo add --dev ${libs.join(' ')}`,
    standards: {
      unit: { name: 'The Rust Book, ch. 11 — Writing Tests', url: 'https://doc.rust-lang.org/book/ch11-01-writing-tests.html' },
      integration: { name: 'The Rust Book, ch. 11.3 — Test Organization', url: 'https://doc.rust-lang.org/book/ch11-03-test-organization.html' },
      e2e: { name: 'Playwright Best Practices', url: 'https://playwright.dev/docs/best-practices' },
    },
    // Playwright is the only realistic browser e2e tool wired today
    e2eTools: [
      { id: 'playwright', detect: /@playwright\/test|playwright/, standard: { name: 'Playwright Best Practices', url: 'https://playwright.dev/docs/best-practices' }, conventionFile: 'e2e.md' },
    ],
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
        unitLibs: ['github.com/stretchr/testify'],
      },
    ],
    sourceExtensions: ['.go'],
    testFilePattern: /_test\.go$/,
    symbolPatterns: [/^func\s+(?:\([^)]*\)\s+)?([A-Z]\w*)/, /^type\s+([A-Z]\w*)/],
    assertionPatterns: [/\bassert\.\w+\s*\(/, /\brequire\.\w+\s*\(/, /\bt\.(Error|Fatal)\w*\s*\(/],
    testLibs: {
      integration: ['github.com/testcontainers/testcontainers-go'],
      e2e: ['@playwright/test'],
    },
    installCommand: (libs) => `go get ${libs.join(' ')}`,
    standards: {
      unit: { name: 'the Go testing package', url: 'https://pkg.go.dev/testing' },
      integration: { name: 'Testcontainers for Go', url: 'https://golang.testcontainers.org/' },
      e2e: { name: 'Playwright Best Practices', url: 'https://playwright.dev/docs/best-practices' },
    },
    // Playwright is the only realistic browser e2e tool wired today
    e2eTools: [
      { id: 'playwright', detect: /@playwright\/test|playwright/, standard: { name: 'Playwright Best Practices', url: 'https://playwright.dev/docs/best-practices' }, conventionFile: 'e2e.md' },
    ],
    canFix: true,
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
        unitLibs: ['org.junit.jupiter:junit-jupiter', 'org.mockito:mockito-core'],
      },
      {
        name: 'maven',
        detect: /<project[\s>]/,
        coverageCommand: 'mvn -q test jacoco:report',
        reportPath: 'target/site/jacoco/jacoco.xml',
        unitLibs: ['org.junit.jupiter:junit-jupiter', 'org.mockito:mockito-core'],
      },
    ],
    sourceRoots: ['src/main/java', 'src/main/kotlin', 'src/main/scala'],
    sourceExtensions: ['.java', '.kt', '.scala'],
    testFilePattern: /(^|\/)src\/test\/|Tests?\.(java|kt|scala)$/,
    symbolPatterns: [
      /^\s*public\s+(?:abstract\s+|final\s+)?class\s+(\w+)/,
      /^\s*public\s+(?:static\s+|final\s+|synchronized\s+|abstract\s+)*[\w<>\[\].]+\s+(\w+)\s*\(/,
    ],
    assertionPatterns: [/\bassert\w*\s*\(/, /\bverify\s*\(/],
    testLibs: {
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
    standards: {
      unit: { name: 'the JUnit 5 User Guide', url: 'https://junit.org/junit5/docs/current/user-guide/' },
      integration: { name: 'Testcontainers for Java', url: 'https://java.testcontainers.org/' },
      e2e: { name: 'Playwright Best Practices', url: 'https://playwright.dev/docs/best-practices' },
    },
    e2eTools: [
      { id: 'playwright', detect: /playwright/, standard: { name: 'Playwright Best Practices', url: 'https://playwright.dev/docs/best-practices' }, conventionFile: 'e2e.md' },
    ],
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
        unitLibs: ['phpunit/phpunit'],
      },
    ],
    sourceExtensions: ['.php'],
    testFilePattern: /(^|\/)tests?\/|Test\.php$/i,
    symbolPatterns: [
      /^\s*(?:final\s+|abstract\s+)?class\s+(\w+)/,
      /^\s*public\s+(?:static\s+)?function\s+(\w+)/,
    ],
    assertionPatterns: [/\bassert\w*\s*\(/],
    testLibs: {
      integration: ['phpunit/phpunit', 'guzzlehttp/guzzle'],
      e2e: ['@playwright/test'],
    },
    installCommand: (libs) => `composer require --dev ${libs.join(' ')}`,
    standards: {
      unit: { name: 'the PHPUnit documentation', url: 'https://docs.phpunit.de/' },
      integration: { name: 'the PHPUnit documentation', url: 'https://docs.phpunit.de/' },
      e2e: { name: 'Playwright Best Practices', url: 'https://playwright.dev/docs/best-practices' },
    },
    // Playwright is the only realistic browser e2e tool wired today
    e2eTools: [
      { id: 'playwright', detect: /@playwright\/test|playwright/, standard: { name: 'Playwright Best Practices', url: 'https://playwright.dev/docs/best-practices' }, conventionFile: 'e2e.md' },
    ],
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
        unitLibs: ['pytest', 'pytest-cov'],
      },
    ],
    sourceExtensions: ['.py'],
    testFilePattern: /(^|\/)tests?\/|(^|\/)test_[^\/]+\.py$|_test\.py$/,
    symbolPatterns: [/^def\s+(\w+)/, /^class\s+(\w+)/],
    assertionPatterns: [/^\s*assert\b/m, /\bpytest\.raises\s*\(/, /\bself\.assert\w+\s*\(/],
    testLibs: {
      integration: ['pytest', 'httpx', 'testcontainers'],
      e2e: ['pytest-playwright'],
    },
    installCommand: (libs) => `pip install -U ${libs.join(' ')}`,
    standards: {
      unit: { name: 'the pytest documentation', url: 'https://docs.pytest.org/en/stable/how-to/index.html' },
      integration: { name: 'Testcontainers for Python', url: 'https://testcontainers-python.readthedocs.io/' },
      e2e: { name: 'Playwright Best Practices', url: 'https://playwright.dev/docs/best-practices' },
    },
    e2eTools: [
      { id: 'playwright', detect: /pytest-playwright|playwright/, standard: { name: 'Playwright Best Practices', url: 'https://playwright.dev/docs/best-practices' }, conventionFile: 'e2e.md' },
    ],
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
        unitLibs: ['vitest', '@vitest/coverage-v8'],
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
        unitLibs: ['jest'],
      },
    ],
    sourceExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    // `.d.ts` is not testable at all — it declares types and emits no runtime. Tooling files
    // (jest.resolver.js, vite.config.ts, metro.config.js) are build config, not product code.
    // Both showed up as "gaps" on a real repo, which is noise in a report meant to be a to-do list.
    // public/ carries SERVED assets (MSW drops its generated mockServiceWorker.js there) — found
    // ranking as a real repo's #3 gap. Never product code.
    // mocks/ (MSW request handlers) and *.gen.ts (a generated TanStack routeTree) both ranked as
    // gaps on a real admin front-end — the same class of noise: test scaffolding and generated code.
    testFilePattern:
      /(^|\/)(__tests__|__mocks__|mocks|e2e|public)\/|\.(test|spec)\.[jt]sx?$|\.d\.ts$|\.gen\.[jt]sx?$|(^|\/)[\w.-]*\.(config|setup|resolver)\.[jt]sx?$|(^|\/)(jest|vitest|metro|babel|eslint)\.[\w.]*[jt]sx?$/,
    // A top-level declaration is one at column 0 — `export` is NOT required. Real React code
    // writes `const Button = (...)` and exports it at the bottom with `export default Button`;
    // demanding the keyword here left every component in a real app named "(no symbol)".
    symbolPatterns: [
      /^export\s+default\s+(?:async\s+)?function\s+(\w+)/,
      /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
      /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/,
      /^(?:export\s+)?(?:const|let)\s+(\w+)/,
    ],
    assertionPatterns: [/\bexpect\s*\(/, /\bassert\w*\s*\(/],
    testLibs: {
      integration: ['supertest'],
      e2e: ['@playwright/test'],
    },
    installCommand: (libs) => `npm install -D ${libs.join(' ')}`,
    standards: {
      unit: { name: 'the Vitest / Jest documentation', url: 'https://vitest.dev/guide/' },
      integration: { name: 'Testcontainers for Node.js', url: 'https://node.testcontainers.org/' },
      e2e: { name: 'Playwright Best Practices', url: 'https://playwright.dev/docs/best-practices' },
    },
    e2eTools: [
      {
        id: 'cypress',
        detect: /"cypress"\s*:/,
        standard: { name: 'Cypress Best Practices', url: 'https://docs.cypress.io/app/core-concepts/best-practices' },
        conventionFile: 'e2e.cypress.md',
      },
      {
        id: 'playwright',
        detect: /"@playwright\/test"\s*:/,
        standard: { name: 'Playwright Best Practices', url: 'https://playwright.dev/docs/best-practices' },
        conventionFile: 'e2e.md',
      },
    ],
    canFix: true,
  },
]

export function byId(id: string): Language | null {
  return LANGUAGES.find((l) => l.id === id) ?? null
}
