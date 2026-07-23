<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo-dark.svg">
  <img alt="redbar" src=".github/assets/logo-light.svg" width="480">
</picture>

<br>

### The agent writes the tests. redbar decides which, and checks.

Coverage and `git diff` say what's left untested, with no AI in the middle.
Your agent writes the tests, following each library's official docs.
redbar measures again and says what actually closed.

<br>

[![release](https://img.shields.io/github/v/release/emersonjds/redbar?label=release&color=0A7EA4&sort=semver)](https://github.com/emersonjds/redbar/releases/latest)
[![ci](https://github.com/emersonjds/redbar/actions/workflows/ci.yml/badge.svg)](https://github.com/emersonjds/redbar/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![runtime dependencies: 0](https://img.shields.io/badge/runtime%20deps-0-success)](package.json)
[![zero LLM in analysis](https://img.shields.io/badge/analysis-zero%20LLM-critical)](docs/design.md)

**[How to use](#how-to-use)** · **[MCP](#mcp-plug-into-the-agent-you-already-use)** · **[The flow, drawn](https://claude.ai/code/artifact/fac215b0-64a0-42c4-814f-eef64864049b)** · **[Design](docs/design.md)**

</div>

---

## The problem it solves

- Every repository is missing tests, and nobody knows **where**. "43% coverage" doesn't say whether *the thing you changed yesterday* is tested.
- When an AI writes the test, it comes out in whatever style the model woke up with. Six prompts, six styles.
- And when the AI says "done, tested", nobody checks.

redbar does all three: it **measures** where the holes are (no AI), hands the agent each library's **official standard** to write by, and **measures again** to check what actually closed. The AI never grades its own exam.

## How it works: measure → write → re-measure

Point it at your repo. It answers one question:

> **What did I just change that nothing tests?**

```
language: TypeScript
runner:   jest
base:     origin/master
gaps:     289

! [5742] e2e          src/pages/Checkout/index.tsx:124  Checkout  — 99 lines, 28 branches
  [ 564] integration  src/api.ts:15                     request   — 47 lines, 11 branches
```

Each row: the symbol, the missing test's layer (unit / integration / e2e) and its criticality. The score is counting, not opinion — `uncovered lines × (zero coverage ? 2 : 1) × (1 + branches)` — and any number is auditable with `redbar explain <symbol>`.

```
  MEASUREMENT (zero AI)   coverage report × git diff → ranked gaps
        ▼
  THE DOCUMENT            .redbar/TESTING.md — what to test, in what order,
                          at which layer, to whose official docs
        ▼
  WRITING (the agent)     one gap at a time + the layer's standard;
                          4 mechanical gates judge what it wrote
        ▼
  MEASUREMENT AGAIN       re-runs coverage: "closed" is measured, not claimed
        ▼
  OUTCOME.md              what was MEASURED ≠ what the agent CLAIMS, never mixed
```

Finding the hole is the compiler and git; writing is the agent; checking is the compiler again. A test that asserts nothing raises coverage and proves nothing — redbar **deletes it** and marks `no-assertion`. An agent that "fixes" your code to make its test pass — redbar **reverts it** and marks `touched-source`.

> **[See the whole flow as a diagram →](https://claude.ai/code/artifact/fac215b0-64a0-42c4-814f-eef64864049b)**

## How to use

No install needed — run it via `npx`:

```bash
npx -y redbar inspect       # what did I change that nothing tests?
npx -y redbar briefing      # the document for your agent + HTML + PDF for management
npx -y redbar execute       # the agent writes, redbar judges and re-measures
npx -y redbar explain X     # where X's number came from, step by step
npx -y redbar compare       # diff two kept runs — what closed, what's new
```

Or install it globally once:

```bash
npm i -g redbar
redbar inspect              # short aliases: i · b · x · why X
```

Every command has a short alias (`i`, `b`, `x`, `why`). `--all` on any of them scans the whole repo instead of the diff.

### `execute` — the authorization gate

Before the agent touches anything, `execute` prints the plan — each gap, the measured why, which layer — and asks yes/no. The working tree must be clean: redbar can't tell your edits apart from the agent's.

```bash
redbar execute --severity high --max 3   # only 3 high-severity gaps
redbar execute --yes                     # CI-friendly: skip the prompt
```

`--severity <band>` cuts by triage — `critical` (default), `high`, `medium`, `low`, or `all`. `--max <n>` caps the count within the band, never widens it. `--yes` skips the prompt for CI; without an interactive terminal and without `--yes`, execute stops without editing.

### History and progress

Each `briefing` or `execute` saves a timestamped directory under `.redbar/runs/<timestamp>/`, never overwritten — `TESTING.md`, `REDBAR.html`, `REDBAR.pdf`, and a snapshot of the gaps (`gaps.json`). `.redbar/latest` points to the newest.

`redbar compare [<runA> <runB>]` diffs two kept runs by (file, symbol), tolerant to line shift — which hole closed (`✓`), which is new, and the per-severity delta. With no arguments it compares the two most recent runs, and writes `TREND.html` / `TREND.pdf` for whoever doesn't read terminals.

## MCP: plug into the agent you already use

Run `redbar mcp-config` to print the exact registration line for your client. Copy the output, run it in your terminal — that command is the authorization.

```bash
redbar mcp-config claude     # prints the ready line for one client
redbar mcp-config            # shows all clients
```

Working from a clone before publishing? Add `--local` to emit the absolute-path form instead of `npx`.

Once connected, ask your agent to use redbar. It calls `redbar_briefing`; redbar scans the code, ranks the gaps, and writes `.redbar/TESTING.md`; the agent writes the tests top-down, following each layer's official standard.

| Tool | What it does |
|---|---|
| `redbar_briefing` | **the main one** — the full document: ranked gaps + the standard for each layer, the agent's source of truth |
| `redbar_inspect` | the gap list, measured |
| `redbar_explain` | the audit of one number — the answer to "is this a hallucination?" |

Artifacts land in **your project**, under `.redbar/`. `npx -y redbar mcp` works on any machine, no clone or link needed.

## Languages

- **JavaScript/TypeScript · Java · Python · Rust · PHP · Go**
- three coverage parsers (lcov, Cobertura, JaCoCo) cover every ecosystem, hand-written, zero runtime dependencies
- adding a language is **one line of data** in `src/languages.ts` — no new code

## The CI gate

`redbar ci --max-critical 0` fails the PR when the change carries branching logic no test executes — and posts the table as a PR comment, editing its own comment on every push. Ready-to-copy workflow: [.github/workflows/redbar.yml](.github/workflows/redbar.yml).

## Status

| | |
|---|---|
| ✅ Engine, CLI, MCP, CI gate | verified on real repositories |
| ✅ `execute` — re-measurement, severity gate, authorization + plan | AI writes; redbar judges; a human authorizes |
| ✅ Run history, `compare` + TREND | before and after, for non-terminal readers |
| ✅ Conventions | TS, Python, Java, Rust, PHP, Go — every rule traceable to the library's docs |
| 🚧 `fix` worker pool | |

## Origin

Based on [lagune.ai](https://github.com/wellwelwel/lagune), by [Well Poku](https://github.com/wellwelwel). The deep dive — every design decision and why — lives in [docs/design.md](docs/design.md).

The purpose fits in one sentence: **the AI never grades its own exam.**

## License

[MIT](LICENSE) © Emerson Silva

## Contributing

Clone the repo — see [CONTRIBUTING.md](CONTRIBUTING.md).
