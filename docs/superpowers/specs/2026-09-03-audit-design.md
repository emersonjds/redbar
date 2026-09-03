# `redbar audit` — a Lighthouse score for a project's test health

**Date:** 2026-09-03
**Status:** draft

## The problem

`redbar inspect` answers one question very well: *what did I change on this branch that no test
covers?* That question has a precondition — you are on a branch, mid-work, with a diff. It is the
right default, and it is the wrong question in three moments that happen constantly:

1. **First contact.** A developer runs `redbar` on `main` with an empty diff and is told "0 gaps"
   while the repository has 400 untested functions. `--all` exists for this, but it answers with a
   ranked list of symbols — a to-do list, not a diagnosis. Nobody can look at 400 rows and say
   whether the project is in decent shape.
2. **Choosing a repository to fix.** A tech lead with six services needs to know which one is worst,
   and needs it as one comparable number, not six lists of different lengths.
3. **The failure mode `inspect` structurally cannot see.** `inspect` reads the coverage report and
   crosses it with git. A project whose tests assert nothing, or whose suite is half `.skip`, or
   whose backend has no integration test at all, produces a coverage report that looks fine.
   `inspect` will honestly report few gaps. The project is still broken.

Lighthouse solved the equivalent problem for web pages: one score per category, one overall number,
and a list of exactly what cost you the points — each item re-derivable, each item actionable.

## The shape

A new command, `redbar audit`, beside `inspect` and `execute`.

- `inspect` = the diff. `audit` = the project.
- `audit` diagnoses. It writes no tests, edits nothing, and fails no build.
- `audit` ends by pointing at `inspect --all`, which is where the ranked symbols already live.

It reuses everything: `detect` (language), `selectRunner` (runner), `ensureCoverage` (report),
`inspect({ all: true })` (whole-repo gaps), `detectProfile`/`kindPriority` (project shape),
`countAssertions` (rigor), `walk`/`hasTests`/`isProductFile` (file tree), and the three renderers in
`report.ts` (terminal, markdown, HTML). The only new engine code is the scoring itself.

### Invariant, inherited unchanged

**No model produces any digit.** Every number in the report is arithmetic over the coverage report,
the git-tracked file tree, and the manifest — and every failed line in the report carries the
arithmetic that produced it, exactly as `redbar explain` does today for a gap's score. A reader must
be able to reach the number with a calculator and no trust in us.

## The four categories

### Setup — 0 to 100

Three boolean checks. This is the 0-to-1 axis: without these, nothing else is measurable.

| check | weight | source |
| --- | --- | --- |
| the repository contains at least one test file | 50 | `hasTests(root, language)` |
| the manifest names a runner (not the fallback) | 25 | `selectRunner` matched vs. fell through |
| a coverage report exists and parses | 25 | `ensureCoverage` |

`Setup === 0` short-circuits the whole report: the other three categories are not computed, not
displayed, and not averaged. A project with no tests gets one instruction — run `redbar init` — and
nothing else. Scoring coverage for someone who has no tests is a correct answer to a question they
did not ask.

### Coverage — 0 to 100

```
Coverage = 100 × (covered lines ÷ executable lines in product files)
```

The rule that makes this number honest is already load-bearing in `gap.ts`: **a product file absent
from the coverage report counts as fully uncovered**, not as "uninstrumented". Jest and pytest only
instrument what a test imported, so a wholly untested file never appears in the report at all.
Reading absence as "nothing to do" is how redbar once reported 6 gaps on a repository with 93
untested changed files.

That rule forces one decision to be explicit, because the two kinds of file are counted from
different sources. For a file **present** in the report, "executable lines" means exactly what the
report says: `covered.length + uncovered.length` — blank lines, imports and closing braces are
already excluded by the instrumenter. For a file **absent** from the report, redbar has no
instrumenter output and must count from the source, so it counts every non-blank line, which
overstates that file's weight slightly. The overstatement is deliberate and runs in the safe
direction: it inflates the cost of a file nobody tests at all, which is the file that deserves the
weight. The footer states this, and no other definition of "executable" is invented per language.

Concentration is **not** folded into the score as a hidden multiplier. It is reported as a failed
line ("31 of 82 product files have no coverage at all"). The score is one number; the problems are a
list. Two numbers multiplied together produce a third that nobody can reason about.

### Rigor — 0 to 100

```
Rigor = 100 × (clean test files ÷ test files)
```

A test file is **clean** when it contains at least one assertion **and** no disabled-test marker.

- Assertions come from `countAssertions`, which runs over `stripNonCode` output — a commented-out
  `// expect(...)` does not count, the same gate `execute` already uses.
- Disabled-test markers enter the `Language` registry as data beside `assertionPatterns`: one
  regex per language covering `.skip` / `.only` / `xit` / `xdescribe` / `@Disabled` /
  `@pytest.mark.skip` / `#[ignore]`. Adding a language is one line, no branching.

`.only` is reported with its own sentence, because its consequence is different in kind: `.skip`
disables one test, `.only` silently disables every other test in the file.

### Pyramid — 0 to 100

Measures whether the untested surface is concentrated in the layer that matters most **for this kind
of project**. Untested integration code in a backend is worse than untested e2e code in a backend,
and that statement is about project types, not about opinions.

For each `TestKind`, over the whole-repo gap set:

```
rate[kind]  = gap lines of that kind ÷ product lines of that kind
weight[kind] = 3, 2, 1 by position in kindPriority(profile)
Pyramid = 100 × (1 − Σ(weight × rate) ÷ Σ weight)
```

`kindPriority` and `detectProfile` already exist and already encode the ordering
(backend → integration, unit, e2e; frontend/fullstack → e2e, integration, unit; library → unit,
integration, e2e). A kind with no product lines at all contributes 0 to both sums, so a project with
no e2e surface is not penalised for having no e2e tests.

### Overall

```
overall = Setup×0.20 + Coverage×0.40 + Rigor×0.20 + Pyramid×0.20
```

The weights are **fixed and not configurable**. A configurable weight makes two projects'
scores incomparable, which is the one thing that would destroy the value of having a score at all.

## The report

Three renderers, the same three `report.ts` already serves: terminal (default), markdown (PR
comment), HTML (`--html`, shareable). One layout across all three.

```
redbar audit · typescript · vitest · a backend project

  62   overall

  Setup      100  ████████████████████
  Coverage    48  █████████▌
  Rigor       71  ██████████████▎
  Pyramid     55  ███████████

FAILED
  Coverage   31 of 82 product files (38%) have no coverage at all
  Coverage   1,204 of 2,310 executable lines are untested
  Rigor      4 test files assert nothing
  Rigor      2 tests use .only — the rest of those files never run
  Pyramid    integration weighs most for this profile and is 81% untested

PASSED
  Setup      82 test files · vitest in the manifest · coverage/lcov.info

  → redbar inspect --all    for the symbols, ranked by criticality
```

Two rules outrank the layout:

1. **Every FAILED line carries its arithmetic.** `31 of 82`, never "coverage is low". Same contract
   as `redbar explain`.
2. **The report ends in a command.** `audit` diagnoses the project, `inspect --all` names the
   symbols, `execute` writes the tests. One job each.

A `stale` coverage report is surfaced exactly as `inspect` surfaces it today: the score is then a
**lower bound**, and the report says so out loud. Code written after the last coverage run is absent
from the report, and absent reads as untested — so a stale report understates Setup-adjacent truth
and overstates the untested surface. The reader must be told which direction the error runs.

## Modules

New:

- `src/audit.ts` — pure. Takes the `Inspection` from `inspect({ all: true })`, the `Coverage` map,
  the manifest text, and the test-file list; returns `Audit`. No disk, no process, no model. Testable
  without a repository, the same way `execute.ts` is.

```ts
export type Category = 'setup' | 'coverage' | 'rigor' | 'pyramid'

/** One thing the audit checked. `passed` decides which block it renders in. */
export type Check = {
  category: Category
  passed: boolean
  /** the sentence shown to the human, arithmetic included */
  detail: string
}

/** Everything the audit needs, already gathered by the caller. Nothing here is read from disk. */
export type AuditInput = {
  /** the whole-repo inspection: gaps, language, runner, staleness */
  inspection: Inspection
  coverage: Coverage
  /** repo-relative paths matching language.testFilePattern */
  testFiles: string[]
  /** repo-relative paths of product files, whether or not the report knows them */
  productFiles: string[]
  readSource: (file: string) => string | null
  /** the project manifest, already read — the same text selectRunner reads */
  manifest: string
}

export type Audit = {
  scores: Record<Category, number>
  overall: number
  checks: Check[]
  profile: Profile
  /** Setup === 0: nothing else was computed. The report stops and points at `redbar init`. */
  unmeasurable: boolean
  stale?: boolean
}

export function audit(input: AuditInput): Audit
```

Changed:

- `src/languages.ts` — one new field on `Language`: `disabledTestPatterns: RegExp[]`. Registry data,
  one line per language.
- `src/report.ts` — one new renderer trio for `Audit`. If this pushes the file past what one file
  should hold, the audit renderers move to `src/report/audit.ts` and the existing ones stay put;
  the file is already 553 lines and is the natural seam.
- `src/cli.ts` — the `audit` command and its alias, beside `inspect`.

## Testing

`audit.ts` is pure, so its tests need no repository: a hand-built `Coverage` map, a hand-built gap
list, and a manifest string in, an `Audit` out. This mirrors `test/execute.test.ts`, which exercises
three gates and seven verdicts with no agent and no repo anywhere in sight.

Specific cases that must be covered, because each one is a way the score could lie:

- `Setup === 0` short-circuits: the other categories are absent, not zero.
- A product file absent from the coverage report counts as fully uncovered.
- A commented-out assertion does not make a test file clean.
- A `TestKind` with no product lines contributes nothing to the Pyramid sums (no divide-by-zero, no
  penalty for a layer the project does not have).
- Every FAILED check's `detail` contains the numbers it was derived from.
- The same repository audited twice produces byte-identical output.

## Deliberately out of scope

- **Mutation testing.** It is the honest answer to "is this assertion any good", and it costs a
  mutation tool per language — breaking both zero-dependency and any-language. The report's footer
  states this ceiling out loud, the same way `assertions.ts` states it in code today.
- **`--min-score` failing CI.** `audit` reports; it does not gate. The `ci` command already exists
  and gains this in one line on the day it hurts.
- **Score history and trend.** "Up 6 points since last week" needs storage and a contract about
  where it lives. Later.
- **Configurable category weights.** See above: it makes scores incomparable.
- **Flakiness detection.** Requires running the suite N times. Out.
- **`audit` feeding `execute`.** `inspect --all` already produces the ranked gap list `execute`
  consumes. Two paths to the same place is one path too many.
