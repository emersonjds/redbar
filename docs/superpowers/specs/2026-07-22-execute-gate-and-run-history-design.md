# redbar — Addendum: execute gates by band, asks first, and keeps a history

**Date:** 2026-07-22
**Status:** addendum to `2026-07-12-design.md`. **It reverses one decision** — `execute`'s default was "all gaps, cut by count"; it is now "critical only, cut by band". Where they conflict, this document wins. The count default is not deleted from the record; it is superseded here, on the precedent of `2026-07-13-conventions-are-library-standards.md`.

## Context

redbar shipped to npm (0.1.2) and ran on a real repo (an admin front-end). It produced 45 ranked gaps and the three-audience report — terminal, `REDBAR.html`, `REDBAR.pdf`, `TESTING.md`. Then the question that this document answers: **after the human reads the report, what is the next step, and what happens after it?**

## Problem

The report is a read model. The one command that acts on it, `redbar execute`, has three holes and the surrounding flow has a fourth.

1. **It cuts by the wrong axis.** `execute` defaults to *every* gap top-to-bottom, and `--max <n>` cuts by **count** (`src/cli.ts:315-322`). That contradicts the band's own stated job: *"the score answers 'how much?', this answers 'do I fix it now?' — a continuous number cannot be triaged"* (`src/severity.ts:11-13`). Cutting the worklist by score-count is triaging on the one axis severity.ts says cannot triage. The `redbar.fix` skill already knew better — it defaults to *the single most critical gap*. The command is the outlier.
2. **It does not ask.** After the slice, `src/cli.ts:324` writes one banner and enters the agent loop. The only guard is the dirty-tree refusal (`src/cli.ts:285`), which protects uncommitted work — not the human's consent to the scope. An LLM starts editing the tree before anyone approved what it was aimed at.
3. **It never shows the why.** The reason a gap ranks where it does exists as measured data — `bandReason`, `scoreArithmetic`, `coverageFact` in `src/explain.ts` — but the human watching `execute` sees only `[01/45] closed symbolName` (`src/cli.ts:383-386`).
4. **It forgets, and it invents noise.** `briefing`/`execute` overwrite `.redbar/` every run, so there is no before/after to show anyone. And a generated router file (`routeTree.gen.ts`) and MSW handlers (`mocks/handlers.ts`) reached the list as real gaps — the same class of noise `.d.ts` and `public/` were already excluded for (`src/languages.ts:325-329`).

## The decision

### 1. `execute` cuts by band, not by count

The band is the triage axis, so it is the filter.

| invocation | reaches the agent |
|---|---|
| `redbar execute` (no flag) | `critical` only |
| `redbar execute --severity high` | `critical` + `high` |
| `redbar execute --severity all` | everything (explicit escape hatch) |

- **`--max <n>` survives as an orthogonal cap**, not the primary filter. It refines *within* the chosen band — "the top 3 criticals" — and never widens it.
- **Everything below the chosen band never reaches the agent.** `low` and `medium` need no mechanism of their own; the band gate excludes them for free. That also settles the "don't fix everything" instinct: there is no invocation that quietly touches a `low`.
- This **reverses** the prior default (`max = before.gaps.length`, cut by count). The reversal is the record, not an erasure — a future reader sees that count-cutting was tried and superseded by band-cutting, and why.

### 2. Authorization is print-the-plan-and-stop

Before the first `runAgent`, `execute` prints the plan: each selected gap with its **measured** why — band, `file:line`, the score arithmetic, the layer — reusing `explain()` / `renderBriefing()`. Nothing here is model-authored. The "why" is `bandReason(gap)` and `scoreArithmetic(gap)`, byte-identical every run.

- `--yes` proceeds without stopping (CI-friendly).
- Interactive TTY asks `y/N` via `node:readline` — no new dependency, the same stdlib module already used in `src/mcp.ts:13`.
- No `--yes` and no TTY → print the plan and exit, touching nothing.

This is the law the tool already lives by: **print it, the owner runs it, running it is the authorization** (`redbar mcp-config`, `src/cli.ts:527`; `redbar init`, rule 6).

### 3. Noise is excluded in the registry, not in code

One addition to `testFilePattern` in `src/languages.ts:331`, beside `.d.ts` and `public/`, excluding `mocks/` (MSW handlers) and `*.gen.ts` (generated router trees), with the found-on-a-real-repo comment in the existing style. It is registry **data**, not a `switch (lang)` — the difference between languages stays a table (rule 3).

### 4. Runs are kept, not overwritten

`briefing` and `execute` stop clobbering `.redbar/`. Each run writes to `.redbar/runs/<timestamp>/`:

- the artifacts — `gaps.json`, `TESTING.md`, `REDBAR.html`, `REDBAR.pdf`
- `summary.json` — counts per band, the run date, and the base ref

A pointer `.redbar/latest -> runs/<timestamp>` names the newest run. `.redbar/` is added to `.gitignore`.

**Invariant made explicit:** the *content* of `gaps.json` stays deterministic — it is still `lcov × git diff`, the same document twice. Only the folder name and `summary.date` reflect the clock, and they are metadata, not measurement. **The timestamp must not leak into any measured number** — not a score, not a band, not a line list. The clock names the drawer; it never touches what is in it.

### 5. `redbar compare` — showing the boss the progress

A new command, a pure set diff of two runs.

- `redbar compare` — `latest` vs the run before it.
- `redbar compare <dateA> <dateB>` — two named runs.

It reports **closed** (in A, gone in B), **new** (only in B), and the per-band delta, and emits `TREND.pdf`. Zero-LLM — it is set arithmetic over two `summary.json`/`gaps.json` pairs.

**Gap identity across runs is `(file, symbol)`** — deliberately **not** including `line`. Lines shift between runs as code moves; keying on the line would report a gap as "closed and reopened" every time an import was added above it. `(file, symbol)` is stable under line drift, which is exactly the tolerance a progress report needs.

### 6. MCP does not change

No `redbar_execute` over MCP — a firm decision. Exposing execute on MCP would be a model-triggered edit of the working tree with no human touch, on a worse layer than the local, watched, gated command (rule 7). The MCP surface stays advisory: `inspect`, `briefing`, `explain`.

The **only optional** adjustment: a `{critical, high, medium, low}` summary line at the top of `redbar_briefing`'s output — pure display, reusing `severity` / `gateResult`. It is listed here as optional and low-risk; it computes nothing new.

### 7. The report shows the measured "why", per gap

`renderHtml` (`src/report.ts:150`) shows, on each ranking row, the block `explain()` already produces — collapsed behind a `<details>`/toggle in the HTML: band, `file:line`, the list of uncovered lines, the score arithmetic (`scoreArithmetic`), and the `bandReason`. Nothing is generated: it is exactly the text `redbar explain <symbol>` already emits, byte-identical.

It reuses `explain()` / `scoreArithmetic` / `bandReason` from `src/explain.ts`. For that, `bandReason` (private today at `src/explain.ts:66`) becomes an `export`, or a pure helper is extracted that both `report` and `explain` share. Either way the string is authored in one place.

The terminal and the PDF are unchanged. The toggle is HTML-only; in the PDF it renders static/open — same information, no interaction. The point of the report was always that its three renderings cannot disagree, so the "why" is the same three-audience number, now readable inline instead of only from the command line.

## Invariants preserved, and where each change lands

| change | lands in | invariant it respects |
|---|---|---|
| band gate + `--severity` | `runExecute`, `src/cli.ts:315-322` (replace the count default); reuses `ranked`/`severity` (`src/severity.ts`) and the `gateResult` vocabulary (`src/cli.ts:139`) | #5 determinism — `ranked` is already sorted; a `.filter` by band before `.slice` stays byte-stable |
| authorization gate | `runExecute` (effectful layer), before `executeGaps` is called; `node:readline` per `src/mcp.ts:13` | #4 purity — the gate is a filter on the list, never threaded into `src/execute.ts` |
| the measured "why" (execute plan) | reuse `explain()` / `scoreArithmetic` (`src/explain.ts:13-64`), `bandReason` (`src/explain.ts:66`) | #1 / #7 zero-LLM — no sentence is generated; the reason is the same string every run |
| the measured "why" (report row) | `renderHtml`, `src/report.ts:150`, reusing `explain()` / `scoreArithmetic` / exported `bandReason` (`src/explain.ts:66`) | #1 / #7 zero-LLM — the row shows `explain()`'s bytes; #5 — HTML/PDF cannot disagree with the terminal |
| noise exclusion | one regex entry in `testFilePattern`, `src/languages.ts:331` | #3 — language difference is registry data, not code |
| run history | `runExecute`/`runBriefing` output paths (`src/cli.ts:207-219`, `src/cli.ts:407-416`); new `.redbar/runs/<ts>/` + `latest` symlink | #5 — `gaps.json` content unchanged; only the path and `summary.date` carry the clock |
| `redbar compare` | new command in `src/cli.ts`; pure diff over two `summary.json`/`gaps.json` | #1 zero-LLM — set diff; #4 purity — the diff function is pure, disk access stays in the command |

## What does NOT change

- **`executeGaps` / `attemptGap`** — the three gates and the seven verdicts are untouched (`src/execute.ts`). Authorization is a gate *before* the loop; the loop still receives a final list and still knows nothing about a repo or an agent (`src/execute.ts:4-7`).
- **The MCP tool set** — three tools, no execute (`src/mcp.ts:46-82`).
- **The score and the band formulas** — `src/gap.ts:58`, `src/severity.ts:27-34`. This document reorders and gates the worklist; it never touches a number.
- **The report renderings** — `inspect`, `briefing`, `explain` still produce the same bytes for the same tree.

## Risks, named

1. **The "why" turning into model text.** The measured reason (`bandReason` / `scoreArithmetic`) is easy to "improve" into a fluent sentence, and the moment a model writes it, the plan and the report row are no longer reproducible and #1/#7 are gone. The reason must stay the exact string `explain()` already emits — a regex in the compiler's uniform is worse than a model in plain sight. **Decision 7 is the settled form of this risk:** the report's "why" is *only* the measured block. Any PR that makes `renderHtml` — or the execute plan — call a model to describe a gap contradicts this spec.

### The semantic layer is deferred on purpose

There is an obvious next want: have the report explain the *semantic risk* of a gap — "this can cause SQL injection", "this validates a CPF with no test". That requires a model to understand what the code **does**, and it is **out of this spec, deliberately.**

If it is ever built, it must be its own spec and a **separate, labelled layer**:

- The measured number stays pure — score, band, uncovered lines, zero-LLM — and nothing the model says touches it.
- The model's hypothesis appears marked as **"agent's guess — verify"**, never inside the score and never presented as a measured fact.

Until that separation is designed with this care, the "why" in the report is **only** the measured block (decision 7). Mixing a model's reading of the code into the same row as the coverage number would relabel a guess as a measurement — the one lie this whole tool exists to prevent.
2. **The timestamp leaking into a number.** `.redbar/runs/<timestamp>/` and `summary.date` are the only places the clock is allowed. If a timestamp ever reaches a score, a band, or a line list, `gaps.json` stops being the same document twice and #5 is broken. The run folder names the drawer; nothing measured may read it.
3. **Authorization becoming the model's judgment.** The gate is a human `y/N` (or `--yes`, or print-and-exit). It must never be "the agent decides whether to proceed" — that would hand the consent decision to the thing being authorized, and rule 7 exists precisely so the agent never self-approves.
