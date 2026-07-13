---
name: redbar.inspect
description: Find the test-coverage gaps in what changed on this branch. Runs the redbar engine, which crosses the project's coverage report with `git diff` and ranks the untested symbols by criticality. It calls no model to produce the number — the number comes from the coverage report and git. Use before opening a PR, when asked "what should I test?", or when asked what the branch left untested. It writes `.redbar/gaps.json` and reports what came back.
argument-hint: Optional repo path (defaults to the current project) and optional --base <ref>
user-invocable: true
---

## User Input

```text
$ARGUMENTS
```

Optional. A repo path, and/or `--base <ref>` to compare against something other than the detected base branch.

## What this is

**You do not analyze coverage. The engine does.** Your job is to run it and report what it printed.

This matters: the gap list must be a *measurement*, not your reading of the code. Coverage is a runtime fact — which lines the test suite actually executed — and it is not visible in the source. If you guess, you produce a confident wrong answer, which is worse than no answer. Run the tool.

## Outline

1. **Run the engine** from the project root:

   ```bash
   npx redbar inspect $ARGUMENTS
   ```

   If `redbar` is not on PATH, fall back to the local build:

   ```bash
   npx tsx src/cli.ts inspect $ARGUMENTS
   ```

2. **If it fails because the coverage report is missing**, the error already contains the exact command for this project's runner (jest and vitest do not share one, and neither do maven and gradle). Show that command to the human and **stop** — do not run it yourself, and do not guess a different one. Generating coverage can be slow and is the human's call.

3. **Report what the engine printed.** Lead with the criticality counts, then the top gaps by name. For each one worth mentioning: the symbol, the file, which layer of test it is missing (unit / integration / e2e), and why it ranks where it does (zero coverage? how many branches?).

4. **Do not fix anything.** This phase only reports. If the human wants the tests written, that is `/redbar.fix`.

## Reading the output

- `critical` — no coverage at all, and 5+ branches. Every branch is a path nothing has ever executed. This is the row that matters.
- `high` — no coverage, and there is at least one decision in it.
- `medium` — untested but straight-line, or dense but partly covered.
- `low` — partly covered and simple.
- `!` next to a row means the symbol has no coverage anywhere in the file.

The `kind` column is the layer of test the gap is asking for, inferred from the file (a route → e2e, an I/O boundary → integration, everything else → unit).

## Honesty rules

- If the engine reports zero gaps, say so plainly. Do not go hunting for things to worry about.
- If a gap looks wrong to you, say that as an observation — do not silently drop it from the report. The engine's number is the deliverable; your commentary sits beside it, not on top of it.
