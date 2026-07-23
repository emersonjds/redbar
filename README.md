<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo-dark.svg">
  <img alt="redbar" src=".github/assets/logo-light.svg" width="480">
</picture>

</div>

# 🟥 [redbar](https://github.com/emersonjds/redbar)

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
```

Or install it once, globally:

```bash
npm i -g redbar
redbar inspect              # short aliases: i · b · x · why X
```

Every command has a short alias (`i`, `b`, `x`, `why`). Add `--all` to scan the whole repo instead of the diff.

**The `execute` authorization gate.** Before the agent touches anything, `execute` prints the plan — each gap, the measured why, which layer — and asks yes/no. The working tree must be clean, so redbar can tell your edits apart from the agent's.

```bash
redbar execute --severity high --max 3   # only 3 high-severity gaps
redbar execute --yes                     # CI-friendly: skip the prompt
```

`--severity <band>` filters by triage — `critical` (default), `high`, `medium`, `low`, or `all`. `--max <n>` caps the count within the band. `--yes` skips the prompt for CI; without an interactive terminal and without `--yes`, execute stops without editing.

**Run history and `compare`.** Each `briefing` or `execute` saves a timestamped directory under `.redbar/runs/<timestamp>/`, never overwritten — `TESTING.md`, `REDBAR.html`, `REDBAR.pdf`, and a snapshot of the gaps (`gaps.json`). `.redbar/latest` points to the newest. `redbar compare [<runA> <runB>]` diffs two kept runs by (file, symbol), tolerant to line shift: which gap closed, which is new, and the per-severity delta. With no arguments it compares the two most recent runs.

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

Set up in your project, redbar unlocks three slash commands for your agent:

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
runner:   jest
base:     origin/master
gaps:     289

! [5742] e2e          src/pages/Checkout/index.tsx:124  Checkout  — 99 lines, 28 branches
  [ 564] integration  src/api.ts:15                     request   — 47 lines, 11 branches
```

Each row: the symbol, the layer of the missing test (unit / integration / e2e), and its score. The score is arithmetic, not opinion — `uncovered lines × (zero coverage ? 2 : 1) × (1 + branches)` — and you can check any number by hand with `redbar explain <symbol>`.

The flow is measure → write → re-measure:

```
  MEASURE (no AI)      coverage report × git diff → ranked gaps
        ▼
  THE DOCUMENT         .redbar/TESTING.md — what to test, in what order,
                       at which layer, to whose official docs
        ▼
  WRITE (the agent)    one gap at a time, plus the layer's standard;
                       four mechanical gates judge what it wrote
        ▼
  MEASURE AGAIN        re-runs coverage: "closed" is measured, not claimed
        ▼
  OUTCOME.md           what was MEASURED stays separate from what the agent CLAIMS
```

Finding the gap is git and the coverage report. Writing is the agent. Checking is the coverage report again. A test that asserts nothing raises coverage and proves nothing — redbar **deletes it** and marks `no-assertion`. An agent that "fixes" your code to make its test pass — redbar **reverts it** and marks `touched-source`.

**The AI never grades its own exam.** The number comes from arithmetic; the agent only writes the test, and the test is checked.

`redbar ci --max-critical 0` runs the same measurement as a PR gate: it fails the build when the change carries branching logic no test executes, and posts the table as a PR comment. Ready-to-copy workflow: [.github/workflows/redbar.yml](.github/workflows/redbar.yml).

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
