# Changelog

All notable changes to redbar are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versioning
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

While the major version is `0`, the public surface — the CLI flags, the `gaps.json` shape, and the
`Language` registry type — may still change in a minor release. It will be noted here when it does.

## [Unreleased]

## [0.2.1] — 2026-07-23

### Fixed

- **`execute` now writes tests across every supported agent.** The agent is driven headless
  (`agent -p <prompt>`), and in that mode each CLI (claude, codex, copilot, gemini, cursor) **denies
  a file write it cannot get a human to approve**: the agent ran, wrote nothing, and `execute`
  recorded `no-output` for every gap. Each row of the agent registry now carries its vendor's
  headless auto-approve flag (`--permission-mode acceptEdits`, `--sandbox workspace-write`,
  `--allow-tool write`, `--approval-mode auto_edit`, `-f`). redbar does not force a model — it drives
  the agent on the developer's own config. Spec in
  `docs/superpowers/specs/2026-07-23-execute-multi-llm-headless-write.md`.

## [0.2.0] — 2026-07-22

The agent writes the tests, redbar decides which and checks. `execute` hands the ranked gaps to your
coding agent one at a time, judges each attempt with mechanical gates, and re-measures coverage — and
run history plus `compare` turn one run against another into a before-and-after.

### Added

- **`redbar execute`** — hands the ranked gaps to your coding agent one at a time; four mechanical
  gates (scope, one file, assertion, execution) judge each attempt; redbar re-runs coverage and writes
  `OUTCOME.md`, which keeps what was MEASURED separate from what the agent CLAIMS.
- **Severity gate + authorization on `execute`.** `--severity <band>` (`critical` default, down to
  `all`) filters by triage band; `--max <n>` caps the count within it. Before the agent touches the
  tree, `execute` prints the plan with the measured "why" per gap and asks — `--yes` skips it for CI;
  a clean working tree is required.
- **Run history.** Every `briefing` / `execute` writes a dated, kept run under
  `.redbar/runs/<timestamp>/`, never overwritten; `.redbar/latest` points at the newest.
- **`redbar compare [<runA> <runB>]`** — diffs two kept runs by (file, symbol), tolerant to line
  shift; reports what closed, what's new, and the per-severity delta; writes `TREND.html` /
  `TREND.pdf`.

### Changed

- The report shows the measured "why" per gap, expandable in the HTML.
- Gap detection excludes `mocks/` and `*.gen.ts` — real-repo noise that isn't yours to test.

## [0.1.2] — 2026-07-22

The MCP server discovery fix. After `npm link`, Codex (and the other clients) couldn't find `redbar`:
the MCP host spawns the server with a sanitized PATH, without npm's global bin, so a bare
`command: "redbar"` never resolved. Found in #13, running redbar on a real setup.

### Fixed

- **The MCP server wasn't discovered after `npm link`** (#13). The cause is the host's sanitized PATH
  — npm's global bin isn't in the spawn environment, so the bare `redbar` command doesn't resolve.
  Registration now uses a **portable `npx` launch** (`npx -y redbar mcp`), which depends on no link or
  absolute path and works on any machine.

### Added

- **`redbar mcp-config [client]`** — prints the MCP server registration in each client's exact
  format. New `src/clients.ts` registry, one row of data per client (same law as `languages.ts`),
  covering Claude, Codex, Cursor, Copilot, Gemini, and VS Code, each with its verified syntax. The
  command prints; the owner runs.
- **`--local`** on `mcp-config`, for those working from a clone: emits the launch with an absolute
  path (`process.execPath` + `dist/cli.js`) instead of `npx`.
- **A team of specialist agents** (`core`, `arquiteto`, `qa`, `llm-mcp`, `oss`, `scribe`) and the
  routing between them, documented in `AGENTS.md` — the single source of truth for Claude Code,
  Codex, Cursor, and Copilot.

### Changed

- **Install via `npx redbar`**, no clone for the end user — the README now presents `mcp-config`
  instead of the manual registration with a bare `redbar`.
- `prepublishOnly` now runs `typecheck` and the tests before packing, so a broken release doesn't
  ship.

## [0.1.1] — 2026-07-13

The engine, the CLI, and the agent skills. Verified against a production React Native app and
against redbar itself.

### Added

- **Engine.** Crosses the project's coverage report with `git diff main...HEAD` and reports which
  changed symbols nothing executes. **No model is called** — the number comes from the coverage
  report and git, which is what makes it auditable.
- **Language registry** (`src/languages.ts`). One row of data per language: markers, runners,
  coverage format, symbol patterns, test libraries. Adding a language is one line, never a new
  module. Ships with TypeScript/JavaScript, Java, Python, Rust, PHP, and Go.
- **Three coverage parsers** — lcov, JaCoCo XML, Cobertura XML — which between them read every
  language above. Hand-written; **zero runtime dependencies.**
- **Runner detection.** jest vs vitest, maven vs gradle. They share neither a command nor a report
  path, and assuming one of them prints a command that can never produce the report redbar waits
  for.
- **Criticality bands** (`critical` / `high` / `medium` / `low`), from two measured facts: whether
  the symbol has any coverage, and how much branching it hides. The threshold of 5 branches is
  McCabe's.
- **Layer classification.** Each gap is tagged `unit`, `integration`, or `e2e`, inferred from the
  file — a route is e2e, an I/O boundary is integration.
- **CLI** — `redbar inspect`, `redbar init`, `redbar ci`.
  - `init` proposes the missing test libraries and **never installs them**. It prints the command;
    the human presses enter.
  - `ci` is the gate: it exits non-zero when the branch carries gaps above the threshold.
- **Reports** — `.redbar/gaps.json` for the agent, and a printable HTML/PDF table for the human and
  the pull request.
- **Agent skills** — `/redbar.inspect`, `/redbar.fix`, `/redbar.init`. The skill never analyzes
  coverage itself: it runs the engine and reports what came back.
- **Conventions** for TypeScript (unit, integration, e2e). Every rule is traceable to the library's
  own documentation — Playwright's best practices, the Vitest/Jest docs, Testcontainers. **Not a
  house style:** nobody argues with the Playwright docs in a code review.
- **Agent instructions** — `AGENTS.md`, with `CLAUDE.md` and `.github/copilot-instructions.md`
  pointing at it. One source of truth, loaded by the agent without anyone installing anything.

### Fixed

Every one of these was found by running redbar on a real repository. **Not one was caught by a
hand-written fixture** — which is the most useful thing we learned.

- **A file that no test imports never appears in the coverage report at all**, so the engine skipped
  it as "uninstrumented". The file with zero tests was invisible to the tool built to find files
  with zero tests — the exact inverse of the promise. A changed source file absent from the report
  is now a total gap.
- The lcov and Cobertura parsers **overwrote** instead of merging when one file appeared in two
  blocks (a concatenated monorepo report, a PHP trait, a C# lambda). This both lost real gaps and
  **fabricated** false ones by reporting covered lines as uncovered.
- `init` told a **jest** project to install **vitest**, which would have broken its own setup. Unit
  libraries belong to the runner, not to the language.
- Branch counting read keywords out of comments, strings, and regex literals — a static data table
  scored 21 phantom branches and topped the ranking.
- `classify` treated any `app/` path as a Next.js route, so every Python module under `app/` (a
  Flask/FastAPI package) was misfiled as e2e.
- Symbol extraction required the `export` keyword, so real React (`const Button = …`, exported at
  the bottom) came out as `(no symbol)` on every component.
- `git diff` parsing dropped paths with spaces or non-ASCII characters, and a content line beginning
  with `++ ` could hijack the file pointer.
- JaCoCo source roots were unreachable from `inspect()`, so any Kotlin or multi-module Maven repo
  returned **zero gaps with no error**.

[Unreleased]: https://github.com/emersonjds/redbar/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/emersonjds/redbar/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/emersonjds/redbar/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/emersonjds/redbar/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/emersonjds/redbar/releases/tag/v0.1.1
