# `redbar execute` — every agent must be allowed to write, headlessly

**Date:** 2026-07-23
**Status:** addendum to `2026-07-14-execute-design.md`. Where there is a conflict, this document wins.

## The failure it fixes

`execute` drives a coding agent through `execFileSync(bin, args, {cwd})` — one headless,
non-interactive run per gap. The `2026-07-14` design specified the registry (`bin` + `args`) and
the three gates, and left the argv as `-p <prompt>`.

That argv is wrong on every agent, and it fails silently. **In non-interactive mode every one of
these CLIs denies a file write it cannot get a human to approve.** With `-p <prompt>` alone the
agent spawns, runs the model to completion, writes nothing, and `execute` — correctly, by its own
rules — finds no test file and records `no-output` for that gap. Do it for every gap and the tool
reports `no-output` across the board. redbar looks broken on *every* LLM, and the report gives no
hint that the cause is a missing flag rather than a model that refused the work.

Confirmed live: `claude` was spawned in a real project, ran to the end, and wrote zero files. The
gates did exactly what they should; the agent was never permitted to act.

## The contract

**Invariant — each row of the registry carries its vendor's headless write-approval flag.** The
`args` for an agent is not "the prompt"; it is "the prompt, plus the exact flag that lets *this*
CLI write files in the cwd without stopping for a human." Omit the flag on a row and `execute` is
structurally incapable of anything but `no-output` on that agent — not a bug in the loop, a row
that never let the agent act.

The flags, each read from its vendor's own documentation:

| Agent | bin | write-approval flag | note |
|---|---|---|---|
| claude | `claude` | `--permission-mode acceptEdits` | auto-approves file edits only, not shell |
| codex | `codex` | `exec --sandbox workspace-write` | `--full-auto` is deprecated; this is the narrower successor |
| copilot | `copilot` | `--allow-tool write` | grants the write tool, nothing else |
| gemini | `gemini` | `--approval-mode auto_edit` | approves edit tools, not shell |
| cursor | `cursor-agent` | `-f` (`--force`) | coarser — see "Residual risk" |

Four of the five flags are scoped to *file editing*. That scoping is not incidental; it is what
keeps this change from colliding with the "never install anything" rule (below).

## Why redbar does not force model or effort

The argv carries a write-approval flag and **nothing else** — no `--model`, no `--effort`, no
reasoning budget. This is a design choice, not an omission.

redbar **drives** the developer's agent; it does not **re-tool** it. The developer has already
chosen a model and configured their CLI. redbar's job is to hand that configured agent one gap and
grade what comes back — the same posture as `2026-07-13-conventions-are-library-standards.md`,
where redbar brings the library's standard rather than inventing a house one. Pinning a model here
would be redbar substituting its judgement for the developer's on the one axis the developer
already owns, and it would rot: model names change per vendor per month, and a pinned name is a
per-agent `switch` waiting to happen. The registry stays a table precisely because the only
per-agent knowledge in it is "how do I run this binary once and let it write" — the smallest,
most stable fact about each CLI.

## Why write freedom is safe

Letting the agent write in the cwd sounds like handing it the keys. It is not, because the write
is never trusted — it is measured, and the gates in `execute.ts` are the net:

- **Scope gate.** Any product file the agent touched is `git checkout --`'d back. The agent may
  write files matching `testFilePattern` and nowhere else; everything else is reverted before it
  can count.
- **One-file gate + assertion gate.** More than one test file, or a test that asserts nothing, is
  deleted. Coverage cannot rise on writes redbar did not read and judge.
- **Baseline subtraction.** `changedFiles()` is snapshotted immediately before the spawn and
  subtracted after, so the verdict is about *this gap's agent*, never a human's pre-existing dirty
  tree.

The permission the flag grants is exactly the permission the gates assume the agent has. Write
freedom without the gates would be reckless; the gates without write freedom produce `no-output`.
They are two halves of one design, and the `2026-07-14` spec shipped only one of them.

## Adding an agent is still one line of data

The registry-as-data invariant (`2026-07-13-multi-language-and-agents.md`, `2026-07-14`) is intact.
A new agent is one row: `{ id, bin, args: (p) => [...] }`, where `args` now includes the write
flag. No branch on `agent.id` exists anywhere in `src/` — confirmed: the only reads of `agent.id`
are in `cli.ts` for the progress line, the confirm prompt, and the report header, none of which
branch on its value; `outcome.ts` never mentions an agent at all and grades every LLM's output
through the identical file/line/assertion pipeline.

One honest addition: the invariant is enforced by a test, not by the type. `Agent` does not
*require* a write flag, so the guard lives in `test/agents.test.ts` — a `writePermission` map that
`.toBeDefined()` forces to have an entry per agent. Adding a row without teaching the test its flag
fails the suite at the point of the change, which is the right place for it. So the true cost is
"one line in `src/agents.ts`, one line in the test's map" — the second line being the guard that
keeps the first honest. That is still data, not code.

## Residual risk (stated, not hidden)

- **The flags are validated against each vendor's docs, not exercised live.** Only `claude` was
  run end-to-end (and the current environment blocks the nested spawn needed to exercise the
  others). Each of the other four flags is correct per its official CLI reference; none has been
  observed writing a file through redbar. The first live run of codex/copilot/gemini/cursor is the
  real acceptance test, and it has not happened.
- **`cursor -f` is coarser than the other four.** `cursor-agent` offers no write-only
  auto-approve; `-f` ("force allow all commands") is all-or-nothing, so on cursor the agent may
  also run shell commands. The scope gate still reverts any product file it writes, and a package
  manifest or lockfile is a product file and is reverted — but `node_modules` is git-ignored, so an
  install the agent runs on its own leaves that directory dirty and unreverted. This does not
  breach "redbar never installs" (rule 6): redbar installs nothing; it prints the command in
  `init` and always will. The dev's own tool, under the dev's own config, doing what the dev's
  `-f` tells it to, is a different actor. But the asymmetry is real and belongs in the open: four
  rows grant "write a file", one grants "do anything", because that is the narrowest flag its
  vendor ships.

## Review against the seven rules

Passes. Rule 1 (no LLM in `src/`) — only argv strings added. Rule 2 (zero runtime deps) — none
added. Rule 3 (one line per agent) — held; no `agent.id` branch leaked. Rule 4 (purity) — the
change is confined to `agents.ts`, which is a pure data table; the spawn stays in `cli.ts`. Rule 5
(determinism) — argv is a pure function of the prompt. Rule 6 (never install) — redbar still only
prints the install command; the write flags authorize *file edits*, and the one coarse flag
(cursor) is a documented residual, not redbar installing. Rule 7 (the agent never grades itself) —
untouched; `execute` remains the only caller of a model, and every verdict but `needs-human`,
`timeout`, and `no-output` is still measured, uniformly across LLMs.
