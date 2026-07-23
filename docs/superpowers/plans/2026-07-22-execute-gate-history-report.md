# Execute gate + history + why in the report — Implementation plan

> **For agentic workers:** implement task-by-task, TDD, micro-commits. Steps use checkboxes.

**Goal:** `execute` cuts by band and asks for authorization showing the measured why; runs become a dated history via `compare`; the report exposes the measured why per gap.

**Architecture:** testable pure functions (filter by band, flag parsing, authorization decision, run diff, plan/trend rendering) + the I/O (readline, symlink, disk) confined to the commands in `cli.ts`. No LLM in any number, text, or decision. Derives from `docs/superpowers/specs/2026-07-22-execute-gate-and-run-history-design.md`.

**Tech Stack:** TypeScript, vitest, zero new dependency (`node:readline` already used in mcp.ts).

## Global Constraints

- Zero-LLM in any measured number/text/decision. The "why" is `bandReason`/`scoreArithmetic`, byte-identical.
- `executeGaps`/`attemptGap` (the 3 gates, 7 verdicts) do NOT change.
- MCP does not change (no `redbar_execute`).
- Determinism: only the run folder name and `summary.date` touch the clock; never a score/band/line.
- Commits: author Emerson, no `Co-Authored-By`, no 🤖, no mention of AI. Conventional, lowercase, no trailing period.

---

## Plan A — execute: gate by band + authorization + noise

### Task A1: noise in the registry (`languages.ts`)
**Files:** Modify `src/languages.ts:331` · Test `test/languages.test.ts`
- [ ] Test: the TS `testFilePattern` matches `src/features/x/mocks/handlers.ts` and `src/routeTree.gen.ts` (they are excluded), and does NOT match `src/mocks-helper.ts` nor `src/gen.ts`.
- [ ] Run → fails.
- [ ] Add `mocks` to the segment alternation and `\.gen\.[jt]sx?$`, with the comment "found in a real repo".
- [ ] Run → passes. Commit: `feat(languages): exclude mocks/ and *.gen.ts from the gap (real-repo noise)`.

### Task A2: filter by band (`severity.ts`)
**Files:** Modify `src/severity.ts` · Test `test/severity.test.ts`
- [ ] Test: `meetsSeverity(criticalGap,'high')===true`, `meetsSeverity(lowGap,'critical')===false`, `meetsSeverity(highGap,'high')===true`.
- [ ] `export function meetsSeverity(gap, threshold: Severity): boolean` = `RANK[severity(gap)] <= RANK[threshold]`.
- [ ] Passes. Commit: `feat(severity): meetsSeverity — band as a filter`.

### Task A3: parse --severity + authorization decision (`cli.ts`, pure)
**Files:** Modify `src/cli.ts` · Test `test/cli.test.ts`
- [ ] Test `parseSeverityThreshold`: `undefined→'critical'`, `'high'→'high'`, `'all'→'all'`, invalid throws.
- [ ] Test `authorizationOutcome`: `{yes:true}→'proceed'`, `{yes:false,isTTY:true}→'ask'`, `{yes:false,isTTY:false}→'stop'`.
- [ ] Implement the two exported pure functions. Passes. Commit: `feat(execute): parse --severity and authorization decision`.

### Task A4: render the authorization plan (`cli.ts`/`explain.ts`, pure)
**Files:** Modify `src/explain.ts` (export `bandReason`) + `src/cli.ts` · Test `test/cli.test.ts`
- [ ] Test `renderExecutePlan(gaps)`: contains symbol, band, `scoreArithmetic`, `bandReason`; contains no generated text.
- [ ] `export` `bandReason`; implement `renderExecutePlan`. Passes. Commit: `feat(execute): authorization plan with the measured why`.

### Task A5: wire it all together in `runExecute` (effects)
**Files:** Modify `src/cli.ts` (`runExecute`, `main` async, HELP)
- [ ] Filter `before.gaps` by `meetsSeverity(threshold)` (when ≠ 'all') before the `slice(max)`; message if empty.
- [ ] Print `renderExecutePlan`; `authorizationOutcome` → proceed / `confirm()` readline y/N / stop (prints "re-run with --yes" and exits).
- [ ] `runExecute` becomes async; `main` async awaits the execute case; `--severity`/`--yes` in parseArgs and in HELP.
- [ ] `npm run typecheck && npx vitest run test/cli.test.ts`. Commit: `feat(execute): gate by band and authorization before the agent`.

---

## Plan B — history + compare

### Task B1: `.redbar/` in gitignore
**Files:** Modify `.gitignore`
- [ ] If `.redbar/` is not there, add it. Commit: `chore(git): ignore .redbar/ (run artifacts and history)`.

### Task B2: dated run + summary (`cli.ts`)
**Files:** Modify `src/cli.ts` (`runBriefing`, `runExecute`) · Test `test/cli.test.ts`
- [ ] Test `runDirName(new Date('2026-07-22T21:55:30Z'))==='2026-07-22T21-55-30'` and `bandCounts(gaps)` = counts by band.
- [ ] Implement `runDirName` (pure) and `bandCounts` (pure, reuses `severity`).
- [ ] `runBriefing`: writes `TESTING.md/REDBAR.html/REDBAR.pdf/gaps.json/summary.json` into `.redbar/runs/<ts>/`, updates the `.redbar/latest` symlink. `inspect` keeps writing `.redbar/gaps.json` (the skills handoff, untouched).
- [ ] `runExecute`: OUTCOME.* also in the run dir. Typecheck+test. Commit: `feat(history): dated runs in .redbar/runs/<ts>/ + latest`.

### Task B3: pure run diff (`compare.ts`, new)
**Files:** Create `src/compare.ts` · Test `test/compare.test.ts`
- [ ] Test: identity `(file,symbol)` — a gap present in A and absent in B = `closed`; only in B = `added`; delta by band; a different line does NOT count as reopened.
- [ ] `export function compareRuns(a: Gap[], b: Gap[]): {closed, added, deltaByBand}`. Passes. Commit: `feat(compare): diff two runs by (file,symbol)`.

### Task B4: `compare` command + TREND (`cli.ts`)
**Files:** Modify `src/cli.ts` (new `runCompare`, `canonical`, HELP, switch) · Test `test/cli.test.ts`
- [ ] Test `canonical` does not break; `compare` in the switch.
- [ ] `runCompare`: latest vs previous, or two dates; reads the `gaps.json` from the run dirs; `compareRuns`; prints; `renderTrendHtml`→`htmlToPdf` `TREND.pdf`.
- [ ] Typecheck+test. Commit: `feat(compare): redbar compare command + TREND.pdf`.

---

## Plan C — measured why in the report

### Task C1: `<details>` with the measured why in `renderHtml`
**Files:** Modify `src/report.ts` (`renderHtml`) · Test `test/report.test.ts`
- [ ] Test: a gap's HTML contains `scoreArithmetic(gap)` and `bandReason(gap)` inside a `<details>`.
- [ ] Per ranking row, add `<details>` with band, uncovered lines, `scoreArithmetic`, `bandReason` (reuses `explain.ts`). Terminal/PDF: same information; in the PDF the details stays open.
- [ ] Typecheck+test. Commit: `feat(report): measured why per gap, expandable in the html`.

---

## Self-review
- Spec coverage: A=decisions 1/2/3; B=4/5; C=7; MCP(6) and formulas(gap/severity) untouched by design. ✔
- No placeholder. ✔
- Consistent names: `meetsSeverity`, `parseSeverityThreshold`, `authorizationOutcome`, `renderExecutePlan`, `runDirName`, `bandCounts`, `compareRuns`, `renderTrendHtml`. ✔
