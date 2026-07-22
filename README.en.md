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

[Português](README.md) · **English**

</div>

---

## The problem it solves

- Every repository is missing tests, and nobody knows **where**. "43% coverage" doesn't say whether *the thing you changed yesterday* is tested.
- When an AI writes the test, it comes out in whatever style the model woke up with. Six prompts, six styles.
- And when the AI says "done, tested", nobody checks.

redbar solves all three: it **measures** where the holes are (no AI), hands the agent each library's **official standard** to write by, and **measures again** to check what actually closed.

## Why isn't this just an agent skill?

- A skill asks the model to **guess** what's covered. Coverage is a runtime fact: it is not visible in the source. The model guesses, confidently.
- Ask twice, get two lists. redbar gives the same answer byte for byte — and only a number that repeats can hold a CI gate.
- A skill is opt-in: it runs when someone remembers. The gate runs on every PR, including for people who don't use AI.

## What about TDD, SDD?

- TDD and SDD apply to code that **doesn't exist yet**, and demand discipline from everyone, every day.
- redbar acts **after**, on the repository that already exists. It asks nothing of anyone: it measures what was left untested.
- They don't compete. TDD prevents, redbar measures. A team doing perfect TDD doesn't need redbar — that team doesn't exist.

## What already exists, and where each one stops

| Tool | What it does | Where it stops |
|---|---|---|
| Codecov / Coveralls | shows the percentage | doesn't say **what** to test. A thermometer, not a plan |
| Copilot / Cursor "generate tests" | writes a test for the open file | doesn't know what's already covered — coverage is not visible in the source |
| Qodo and friends | AI writes tests until coverage rises | the AI decides what to cover, and nobody checks what it claims |
| Diffblue | generates tests without AI | Java only, a black box, doesn't talk to your agent |

redbar's space is the combination none of them ship: **measure without AI, write with the agent you already use, and check by measuring again.**

## The question it answers

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

## The whole flow

```
  your repo, on a branch with work on it
        │
        ▼
  MEASUREMENT (zero AI)   coverage report × git diff → ranked gaps
        │
        ▼
  THE DOCUMENT            .redbar/TESTING.md — what to test, in what order,
        │                 at which layer, to whose official docs
        ▼
  WRITING (the agent)     one gap at a time + the layer's standard;
        │                 4 mechanical gates judge what it wrote
        ▼
  MEASUREMENT AGAIN       re-runs coverage: "closed" is a measured fact, not a claim
        │
        ▼
  OUTCOME.md              what was MEASURED ≠ what the agent CLAIMS, never mixed
```

> **[See the whole flow as a diagram →](https://claude.ai/code/artifact/fac215b0-64a0-42c4-814f-eef64864049b)**

The split is the whole project: finding the hole is the compiler and git; writing is the agent; checking is the compiler again. A test that asserts nothing raises coverage and proves nothing — redbar **deletes it** and marks `no-assertion`. An agent that "fixes" your code to make its test pass — redbar **reverts it** and marks `touched-source`.

## How to use

Install once, run it in your repo, and it does the rest: detects the language and the runner, generates coverage if it's missing, and tells you what to test.

```bash
# install (not on npm yet — straight from the clone):
git clone https://github.com/emersonjds/redbar.git && cd redbar && npm install && npm link
```

```bash
cd /your/repo
redbar i         # inspect — what did I change that nothing tests?
redbar b         # briefing — the document for your agent + HTML + PDF for management
redbar x         # execute — the agent writes, redbar judges and re-measures
redbar why X     # explain — where X's number came from, step by step
```

Every shortcut has a full name (`inspect`, `briefing`, `execute`, `explain`), and `--all` on any of them scans the whole repo instead of the diff.

## MCP: plug into the agent you already use

The old way registered `redbar` bare — the MCP host couldn't find it in the sanitized PATH. Now redbar prints the line ready, with absolute paths.

**Setup:**

```bash
redbar mcp-config codex    # just for Codex
redbar mcp-config          # shows all clients
```

redbar prints the exact line for your terminal. Each client has its form — Claude Code and Codex use `--`, Gemini CLI doesn't, Copilot CLI is JSON. The command prints it in the right format already. Copy the output and run it — that's the authorization.

**After it's connected, the flow is:**

1. Ask your agent to use redbar → it calls `redbar_briefing`
2. redbar scans your code, calculates gaps, and writes `.redbar/TESTING.md` — the ranked list of what to test, at each layer
3. The agent writes the tests top-down, following each layer's official standard

| Tool | What it does |
|---|---|
| `redbar_briefing` | **the main one** — the complete document: ranked gaps + the standard for each layer. The agent uses it as the source of truth for writing the tests |
| `redbar_inspect` | the gap list, measured |
| `redbar_explain` | the audit of one number — the answer to "is this a hallucination?" |

The artifacts (`TESTING.md`, `gaps.json`) are written into **your project**, under `.redbar/`.

When redbar hits npm, just `npx -y redbar mcp` on any machine — works without clone or link.

## The engine reads the project's shape

All detected from the manifest, mechanically, no model:

- **Runner** — jest or vitest, maven or gradle. It doesn't assume; it reads.
- **e2e tool** — Cypress in `package.json` → the Cypress standard; otherwise Playwright.
- **Profile** — React/Vue → frontend (e2e first in focus); Express/Spring/FastAPI → backend (integration first); Next/Nuxt → fullstack. It becomes the report's "Focus" section — **without touching the score**, which stays pure counting.

## The CI gate

`redbar ci --max-critical 0` fails the PR when the change carries branching logic no test executes — and posts the table as a PR comment, editing its own comment on every push. Ready-to-copy workflow: [.github/workflows/redbar.yml](.github/workflows/redbar.yml).

## Languages

- **JavaScript/TypeScript · Java · Python · Rust · PHP · Go**
- three coverage parsers (lcov, Cobertura, JaCoCo) cover every ecosystem
- adding a language is **one line of data** in `src/languages.ts` — no new code

## Status

| | |
|---|---|
| ✅ Engine, CLI, MCP, CI gate, `execute` with re-measurement | verified on real repositories |
| ✅ Conventions | TS, Python, Java, Rust, PHP, Go — every rule traceable to the library's docs |
| 🚧 `fix` worker pool | |

## Origin

Based on [lagune.ai](https://github.com/wellwelwel/lagune), by [Well Poku](https://github.com/wellwelwel).

The purpose fits in one sentence: **the AI never grades its own exam.**

## Documentation

The deep dive — every design decision and why — lives in [docs/design.md](docs/design.md). Specs and plans in [docs/superpowers/](docs/superpowers/).

## License

[MIT](LICENSE) © Emerson Silva
