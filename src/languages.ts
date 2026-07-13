import type { CoverageFormat, TestKind } from './types.js'

export type Language = {
  id: string
  name: string
  /** files identifying the project root; first match wins */
  markers: string[]
  format: CoverageFormat
  /** where the report lands, relative to root */
  reportPath: string
  /** the command that GENERATES the report */
  coverageCommand: string
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
    reportPath: 'lcov.info',
    coverageCommand: 'cargo llvm-cov --lcov --output-path lcov.info',
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
    reportPath: 'coverage.xml',
    coverageCommand:
      'go test ./... -coverprofile=coverage.out && gocover-cobertura < coverage.out > coverage.xml',
    // in Go, exported = leading uppercase. includes methods with a receiver.
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
    reportPath: 'target/site/jacoco/jacoco.xml',
    coverageCommand: 'mvn -q test jacoco:report',
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
    reportPath: 'coverage.xml',
    coverageCommand: 'vendor/bin/phpunit --coverage-cobertura coverage.xml',
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
    reportPath: 'coverage.xml',
    coverageCommand: 'pytest --cov --cov-report=xml',
    // top-level (column 0): an indented method inherits the name of its enclosing class
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
    reportPath: 'coverage/lcov.info',
    coverageCommand: 'npx vitest run --coverage',
    symbolPatterns: [
      /^export\s+(?:async\s+)?function\s+(\w+)/,
      /^export\s+(?:abstract\s+)?class\s+(\w+)/,
      /^export\s+(?:const|let)\s+(\w+)/,
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
