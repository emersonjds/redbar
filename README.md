<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo-dark.svg">
  <img alt="redbar" src=".github/assets/logo-light.svg" width="480">
</picture>

</div>

[![release](https://img.shields.io/github/v/release/emersonjds/redbar?label=release&color=0A7EA4&sort=semver)](https://github.com/emersonjds/redbar/releases/latest)
[![ci](https://github.com/emersonjds/redbar/actions/workflows/ci.yml/badge.svg)](https://github.com/emersonjds/redbar/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![runtime dependencies: 0](https://img.shields.io/badge/runtime%20deps-0-success)](package.json)
[![no AI in the measurement](https://img.shields.io/badge/measurement-no%20AI-critical)](docs/design.md)
[![no API key needed](https://img.shields.io/badge/No%20API%20Key%20Needed-0A7EA4)](docs/design.md)

**redbar** finds what you changed that no test covers. It hands each gap to your own AI agent to write the test, then checks the result by measuring coverage again. No API key: it runs through the agent you already use (Claude, Codex, Copilot, Gemini, Cursor). No model ever produces the number.

---

## Table of Contents

- 🟥 [**Get Started**](#get-started)
  - ⌨️ [**CLI**](#cli) | [**MCP**](#mcp)
  - 💬 [**Skills**](#skills)
- 💽 [**Requirements**](#requirements)
- ⚙️ [**How it works**](#how-it-works)
- 🖖 [**Acknowledgements**](#acknowledgements)
- 🧑‍⚖️ [**License**](#license)

---

## Get Started

> [!TIP]
>
> No API key is needed. redbar runs through your own agent (**Claude**, **Codex**, **Copilot**, **Gemini**, **Cursor**), and no model ever produces the number.

### CLI

#### › Install

No install needed — run it through `npx`:

```bash
npx -y redbar inspect       # what did I change that nothing tests?
npx -y redbar briefing      # the document for your agent, plus HTML and PDF
npx -y redbar execute       # the agent writes; redbar judges and re-measures
npx -y redbar explain X     # where X's number came from, step by step
npx -y redbar compare       # diff two kept runs: what closed, what's new
npx -y redbar audit         # the whole project's test health, scored 0-100
```

Or install it once, globally:

```bash
npm i -g redbar
redbar inspect              # short aliases: i · b · x · why X · a
```

Every command has a short alias (`i`, `b`, `x`, `why`, `a`). Add `--all` to scan the whole repo instead of the diff.

**The `execute` authorization gate.** Before the agent touches anything, `execute` prints the plan — each gap, the measured why, which layer — and asks yes/no. The working tree must be clean, so redbar can tell your edits apart from the agent's.

```bash
redbar execute --severity high --max 3   # only 3 high-severity gaps
redbar execute --yes                     # CI-friendly: skip the prompt
```

`--severity <band>` filters by triage — `critical` (default), `high`, `medium`, `low`, or `all`. `--max <n>` caps the count within the band. `--yes` skips the prompt for CI; without an interactive terminal and without `--yes`, execute stops without editing.

**Run history and `compare`.** Each `briefing` or `execute` saves a timestamped directory under `.redbar/runs/<timestamp>/`, never overwritten — `TESTING.md`, `REDBAR.html`, `REDBAR.pdf`, and a snapshot of the gaps (`gaps.json`). `.redbar/latest` points to the newest. `redbar compare [<runA> <runB>]` diffs two kept runs by (file, symbol), tolerant to line shift: which gap closed, which is new, and the per-severity delta. With no arguments it compares the two most recent runs.

**The whole project, scored: `audit`.** `inspect` looks at what you changed. `audit` looks at everything and scores the repository's test health out of 100, from four measured categories, each printed with the arithmetic behind it.

```bash
redbar audit                 # the scorecard in your terminal
redbar audit --md audit.md   # the same numbers, for a PR comment
```

- **Setup** — are there test files, does the manifest name a runner, is there a coverage report?
- **Coverage** — how many executable lines of product code run under a test?
- **Rigor** — does every test file assert something, and does any of them disable a test?
- **Pyramid** — is the layer that matters most for this kind of project the one that is tested?

### MCP

Run `redbar mcp-config` to print the exact registration line for your client. Copy the printed line, run it in your terminal — that command is the authorization.

```bash
redbar mcp-config claude     # prints the ready line for one client
redbar mcp-config            # shows all clients
```

Working from a clone before publishing? Add `--local` to emit the absolute-path form instead of `npx`.

Once connected, ask your agent to use redbar:

| Tool | What it does |
|---|---|
| `redbar_briefing` | the main one — the full document: ranked gaps plus the standard for each layer |
| `redbar_inspect` | the gap list, measured |
| `redbar_explain` | the audit of one number — the answer to "is this a hallucination?" |

Artifacts land in your project, under `.redbar/`.

### Skills

Set up in your project, redbar adds three slash commands for your agent:

| Command | What it does |
|---|---|
| `/redbar.inspect` | runs the engine and reports the gaps — it never analyzes coverage itself |
| `/redbar.fix` | walks the gaps and has the agent write the tests |
| `/redbar.init` | proposes the missing test libraries; it prints the command, you run it |

---

## Requirements

- [**Node.js (LTS)**](https://nodejs.org/en/download/package-manager) — redbar runs on Node under the hood; you use whatever language you want.
- At least one supported agent for `execute` and MCP: **Claude**, **Codex**, **Copilot**, **Gemini**, or **Cursor**.
- A test runner that emits a coverage report — **lcov**, **Cobertura**, or **JaCoCo**. Between them they cover **JavaScript/TypeScript · Java · Python · Rust · PHP · Go**.

---

## How it works

Point redbar at your repo. It answers one question:

> **What did I just change that nothing tests?**

```
language: TypeScript
runner:   vitest
base:     origin/main
gaps:     3

! [ 76] unit        src/cli.ts:976 main — 2 line(s), 18 branch(es)
! [ 72] unit        src/cli.ts:331 runAudit — 12 line(s), 2 branch(es)
  [  5] unit        src/report.ts:706 renderAuditMarkdown — 1 line(s), 4 branch(es)
```

That is real output from this repository. Each row is one gap: score, layer of the missing test, file, line, symbol, and the two figures the score is built from. The `!` means not one line of that symbol is covered by anything.

### Where the numbers come from

Two files on disk, crossed with each other.

1. **The coverage report your own runner wrote.** redbar detects the language from the project markers, picks the runner the manifest names, and reads the report that runner produces (lcov, Cobertura, or JaCoCo). If the report is missing, redbar runs the project's own coverage command to make one. If the project has no test files, it stops with an error instead of answering "no gaps", which would be wrong and would sound like good news.
2. **`git diff <base>...HEAD`.** The lines you changed on this branch.

The gap list is the intersection: `changed ∩ uncovered`. That is the whole calculation. No model reads your code, ranks it, or produces a single digit. Two things follow: the same repo gives the same answer every run, and you can redo any number by hand.

`redbar explain <symbol>` prints that check for one gap:

```
runAudit — src/cli.ts:331
high · score 72 · missing a unit test

Where the number came from

  1. coverage/lcov.info
       12 of the changed line(s) in this symbol are marked NOT executed.
       The runner measured this. It is not an inference about the code.

  2. git diff origin/main...HEAD
       lines 331–352 of src/cli.ts changed on this branch.

  3. changed ∩ uncovered = 12 line(s): 331-332, 334, 336-338, 341, 345, 347-348, 351-352
```

### What a gap is

Changed lines that no test executes, attributed to the symbol containing them.

- Only product code counts. Tests, fixtures, configs and generated files change too, and are never a gap.
- Lines group by symbol identity, not by name. Two overloads sharing a name in one file are two gaps.
- **A product file absent from the coverage report is fully uncovered, not "uninstrumented".** This is the rule the whole tool rests on. jest, vitest and pytest only instrument files a test imported, so a file nothing tests never appears in the report at all. Reading that absence as "nothing to do" is how an earlier redbar reported 6 gaps on a repo with 93 untested changed files.

### How a gap is ranked

Two measured figures do all the work: how many uncovered lines, and how many branches. Branches are counted from the source (`if`, `for`, `while`, `case`, `catch`, `elif`, `switch`, `&&`, `||`), over code with comments, strings and regex literals stripped out.

The score orders the list:

```
score = uncovered lines × (no coverage at all ? 2 : 1) × (1 + branches)
```

The band decides what you fix now. It is a lookup on the same two figures:

|  | 0 branches | 1-4 branches | 5+ branches |
|---|---|---|---|
| **no coverage at all** | medium | high | critical |
| **partly covered** | low | low | medium |

Five branches is McCabe's classic "this needs a test" line. Untested branching logic is the worst cell: every branch is a path nothing has ever run. Partly covered code already has a test pointing at it, so the job is to extend one, not write one. `--severity high` keeps critical and high and drops the rest.

### What the agent is allowed to do

Write exactly one test file. Touch nothing else.

`execute` sends one gap per prompt, never the list. The prompt carries the measured facts about that gap and the official documentation for that layer's library, so the agent follows the library's published style instead of one redbar invented. Nothing starts until the working tree is clean, which is what lets redbar tell your edits from the agent's. redbar prints the plan and waits for a yes.

Then it checks what came back. Which files changed comes from `git`, not from what the agent says it did.

| Check | What it catches | What redbar does |
|---|---|---|
| **Scope** | the agent edited source to make its test pass | reverts the source, deletes the test, `touched-source` |
| **One file** | more than one test file appeared, so part of it was never judged | deletes all of them, `too-many-files` |
| **Assertions** | the test asserts nothing | deletes the test, `no-assertion` |
| **Execution** | the test failed twice in a row (one retry, for flakes) | deletes the test, `needs-human` |

The assertion check runs **before** the test runs. A test that asserts nothing always passes, so running it first would only confirm the trick.

### How the result is judged

By measuring again. redbar deletes the coverage report, re-runs the project's coverage command, and compares the fresh report against the gaps it started with.

A gap is `closed` when none of its original uncovered lines are still uncovered. Matched by line number, never by symbol name, never by the agent's claim.

One exception, and it is the point: **a rejected attempt stays rejected even if the gap disappeared.** A test that asserts nothing still executes the lines, so coverage rises and the gap leaves the report. Trusting the report there would launder the exact trick the assertion check just caught.

`OUTCOME.md` keeps the two apart: what redbar measured in one block, what the agent claimed in another. `needs-human` is the only line in the document whose reason came from a model, and the document says so.

### `inspect` vs `audit`

`inspect` asks about your diff. `audit` asks about the repository. Real output, same repo as above:

```
redbar audit · TypeScript · vitest · no clear frontend/backend signal

   83   overall

  Setup      100  ████████████████████
  Coverage    70  ██████████████
  Rigor      100  ████████████████████
  Pyramid     76  ███████████████▏

  Pyramid weighs the layers heaviest first: unit, integration, e2e.

FAILED
  Coverage   351 of 1,181 executable lines are untested

PASSED
  Setup      32 test file(s) match /\.(?:[\w-]+-)?(?:test|spec)\.[cm]?[jt]sx?$/
  Setup      vitest is named in the manifest
  Setup      coverage/lcov.info parsed, 32 file(s) in it
  Coverage   all 31 product file(s) have at least one covered line
  Coverage   denominator: 1,181 executable line(s) — 1,181 from coverage/lcov.info
  Coverage   left out: 3 product file(s) in directories the report never measured
  Rigor      all 32 test file(s) assert something
  Rigor      no test file disables a test
  Pyramid    unit weighs ×3 — 346 of 1,151 lines (30%) untested
  Pyramid    integration weighs ×2 — 5 of 19 lines (26%) untested
  Pyramid    e2e weighs ×1 — 0 of 11 lines (0%) untested

From coverage/lcov.info, the git-tracked file tree and the manifest. No language model produced these numbers.
```

Four categories, fixed weights:

| Category | Weight | The arithmetic |
|---|---|---|
| **Setup** | 20% | test files exist (50) + the manifest names the runner (25) + the report parses (25) |
| **Coverage** | 40% | covered ÷ executable lines of product code |
| **Rigor** | 20% | test files that assert something and disable nothing, ÷ test files |
| **Pyramid** | 20% | untested lines per layer, the layers weighted ×3 / ×2 / ×1 by which one matters for this kind of project (read from the frameworks in your manifest) |

The weights are not configurable. A weight you can tune makes two projects' scores incomparable.

The report prints its own denominator on purpose. redbar's percentage and the one your coverage tool prints are read from the same file, and those two lines are every line redbar added and every line it left out. Without them, the numbers differ and nobody can say why.

No test files means the other three categories are absent from the report, not zero. A zero would claim a measurement that never happened.

### What redbar does not know

- **It counts assertions. It does not judge them.** `expect(true).toBe(true)` counts as one and passes every check. The honest answer is mutation testing, and that costs a mutation tool per language, which would end both the zero-dependency and the any-language promise. What redbar catches is the failure that actually happens: the test that asserts *nothing*.
- **A stale report makes every number a lower bound.** Code written after the last coverage run is absent from the report, and absent reads as "nothing to test". redbar compares your source timestamps against the report and prints a warning at the top of every output when the report is older. It cannot tell you what the stale report is hiding.
- **The layer is a heuristic**, from path and content patterns. A wrong guess costs a test at the wrong layer, not a broken test.
- **`audit` excludes what the report could never reach.** A product file in a top-level directory the coverage config never touched (`scripts/`, `tools/`) is left out of the score rather than charged against it. That runs in the flattering direction, so the count is printed in the denominator line instead of hidden.
- **The branch count skips the ternary.** In TypeScript `?` also spells an optional property and optional chaining. A missed ternary costs less than a wrong number in the first row.

### As a PR gate

`redbar ci --max-critical 0` runs the same measurement in CI. It fails the build when the change carries branching logic no test executes, and posts the table as a PR comment. Ready-to-copy workflow: [.github/workflows/redbar.yml](.github/workflows/redbar.yml).

> [!IMPORTANT]
>
> See the full [**design documentation**](docs/design.md) for every decision and why it was made.

---

## Acknowledgements

redbar is based on [**lagune**](https://github.com/wellwelwel/lagune) by [**Weslley Araújo / Well Poku**](https://github.com/wellwelwel) — the shape of the tool, the agent-driven flow, and much of the thinking. Thank you.

Thanks to everyone who reports a bug or opens a pull request. Every real fix in this tool came from running it on a real repository.

---

## Contributing

Clone the repo and read [**CONTRIBUTING.md**](CONTRIBUTING.md).

---

## License

**redbar** is under the [**MIT License**](LICENSE).<br />
Copyright © 2026-present [**Emerson Silva**](https://github.com/emersonjds).
