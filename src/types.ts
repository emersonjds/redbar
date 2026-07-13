export type TestKind = 'unit' | 'integration' | 'e2e'

export type CoverageFormat = 'lcov' | 'jacoco' | 'cobertura'

/** Coverage for one file. Executable lines only — a line in neither list is not executable. */
export type FileCoverage = {
  /** relative to repo root, `/` separator, no leading `./` */
  file: string
  covered: number[]
  uncovered: number[]
}

/** Key = FileCoverage.file */
export type Coverage = Map<string, FileCoverage>

/** Lines added/changed by the diff. Key = path relative to repo root. */
export type ChangedLines = Map<string, number[]>

export type Gap = {
  file: string
  /** the public symbol containing these lines; null when it could not be attributed */
  symbol: string | null
  /** lines that changed AND are uncovered */
  lines: number[]
  /** the symbol has no covered line anywhere in the file */
  fullyUncovered: boolean
  /** branches (if/for/while/case/catch/&&/||/?) within the symbol — criticality proxy */
  branches: number
  /** which kind of test this gap is asking for */
  kind: TestKind
  score: number
}
