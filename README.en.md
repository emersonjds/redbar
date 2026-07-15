<div align="center">

# redbar

### The agent writes the tests. redbar decides which — and checks.

**Finding what's untested is arithmetic: coverage report × `git diff`, zero AI.
Writing the test is the agent, following the library's own docs.
Checking whether it closed is arithmetic again.**

[![release](https://img.shields.io/github/v/release/emersonjds/redbar?label=release&color=0A7EA4&sort=semver)](https://github.com/emersonjds/redbar/releases/latest)
[![ci](https://github.com/emersonjds/redbar/actions/workflows/ci.yml/badge.svg)](https://github.com/emersonjds/redbar/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![runtime dependencies: 0](https://img.shields.io/badge/runtime%20deps-0-success)](package.json)
[![zero LLM in analysis](https://img.shields.io/badge/analysis-zero%20LLM-critical)](docs/design.md#the-analysis-is-zero-llm-and-that-is-the-whole-point)

[Português](README.md) · **English**

</div>

---

## The problem

Every repository is missing tests, and nobody knows **where**. Coverage says "43%" — it doesn't say whether *the thing you changed yesterday* is tested. And when an AI writes the test, it comes out in whatever style the model woke up with: six prompts, six styles.

Two different problems, and redbar uses AI in neither place where it hurts:

1. **Where are the holes?** A *data* problem. The answer already exists in the coverage report and in git — no model gets a vote.
2. **In what style should the test be written?** A *convention* problem. The answer already exists in each library's official docs — nobody argues with the Playwright docs in a code review.

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

## Getting started

```bash
redbar i         # inspect — what did I change that nothing tests? (generates coverage if missing)
redbar b         # briefing — the document for your agent + HTML + PDF for management
redbar x         # execute — the agent writes, redbar judges and re-measures
redbar why X     # explain — where X's number came from, step by step
```

Every shortcut has a full name (`inspect`, `briefing`, `execute`, `explain`), and `--all` on any of them scans the whole repo instead of the diff.

Not on npm yet — run from the clone:

```bash
git clone https://github.com/emersonjds/redbar.git && cd redbar && npm install && npm link
```

## MCP: plug into the agent you already use

The MCP server exposes the engine to any client (Claude Code, Cursor, Codex...):

```bash
claude mcp add redbar -- redbar mcp
```

or in the project's `.mcp.json`:

```json
{ "mcpServers": { "redbar": { "command": "redbar", "args": ["mcp"] } } }
```

| Tool | What it does |
|---|---|
| `redbar_briefing` | **the main one** — the complete document: ranked gaps + the standard for each layer. The agent uses it as the source of truth for writing the tests |
| `redbar_inspect` | the gap list, measured |
| `redbar_explain` | the audit of one number — the answer to "is this a hallucination?" |

With MCP, the agent stops **guessing** what to test: it asks the engine and gets a measurement. `execute` is CLI-only on purpose — whoever calls the MCP already *is* a model; it doesn't spawn another one.

## The engine reads the project's shape

All detected from the manifest, mechanically, no model:

- **Runner** — jest or vitest, maven or gradle. It doesn't assume; it reads.
- **e2e tool** — Cypress in `package.json` → the Cypress standard; otherwise Playwright.
- **Profile** — React/Vue → frontend (e2e first in focus); Express/Spring/FastAPI → backend (integration first); Next/Nuxt → fullstack. It becomes the report's "Focus" section — **without touching the score**, which stays pure counting.

## The CI gate

`redbar ci --max-critical 0` fails the PR when the change carries branching logic no test executes — and posts the table as a PR comment, editing its own comment on every push. Ready-to-copy workflow: [.github/workflows/redbar.yml](.github/workflows/redbar.yml).

## Languages

**JavaScript/TypeScript · Java · Python · Rust · PHP · Go** — adding a language is **one line of data** in `src/languages.ts`. Three parsers (lcov, Cobertura, JaCoCo) cover all the ecosystems.

## Status

| | |
|---|---|
| ✅ Engine, CLI, MCP, CI gate, `execute` with re-measurement | verified on real repositories |
| ✅ Conventions | TS, Python, Java, Rust, PHP, Go — every rule traceable to the library's docs |
| 🚧 `fix` worker pool | |

## Documentation

The deep dive — every design decision and why — lives in [docs/design.md](docs/design.md). Specs and plans in [docs/superpowers/](docs/superpowers/).

## License

[MIT](LICENSE) © Emerson Silva
