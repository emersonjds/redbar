# Agent instructions — redbar

> Read by Claude Code, Codex, Cursor, Windsurf and Copilot. `CLAUDE.md` and
> `.github/copilot-instructions.md` point here so there is one source of truth, not five.

## What this project is

redbar finds the test-coverage gaps in what a branch changed, and hands them to an agent to fill.

**The analysis calls no model.** It reads the coverage report the project already produces, crosses
it with `git diff`, and ranks what nothing executes. That is not purism — it is where the number's
authority comes from. A wrong number from a model is bad; a wrong number from a regex is worse,
because it arrives wearing the compiler's uniform.

## The rules that govern every change here

1. **Zero LLM in `src/`.** No AI SDK, no model API call, no agent spawn in the analysis path. CI does
   not enforce this — you do.
2. **Zero runtime dependencies.** `dependencies` in `package.json` stays empty. CI fails the build
   if one appears. The coverage parsers are hand-written on purpose; do not reach for an XML
   library.
3. **Adding a language is ONE LINE of data** in `src/languages.ts`. If you are about to write
   `switch (lang)` or `if (lang.id === 'rust')` anywhere outside that table, **stop** — the design
   has failed and the fix is to move the difference into the registry as data.
4. **Purity.** `src/coverage/*`, `src/symbols.ts`, `src/classify.ts`, `src/gap.ts` never touch disk
   and never spawn a process. Only `detect.ts`, `git.ts`, `runner.ts`, `engine.ts`, `cli.ts` may.
5. **Deterministic output.** Same input, same order, byte for byte. A report that reshuffles cannot
   be diffed in a PR, and the CI gate would flap.
6. **Never install anything into a user's project.** `init` prints the command; the human runs it.
7. **The agent never grades itself.** `execute` is the only command that calls a model. Every
   verdict it produces except `needs-human`, `timeout`, and `no-output` is measured — by git, by a
   regex, by the test runner, or by a fresh coverage report. If you are about to let the agent's own
   output decide whether a gap closed, stop: that is the failure this whole project exists to
   prevent, reintroduced one layer down.

## Testing this project

TDD. Failing test first, run it, watch it fail, then implement.

```bash
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run coverage   # writes coverage/lcov.info
npm run try -- .   # run redbar on redbar
```

**Fixtures test what you already thought of. Real repositories test what you did not.** Every serious
bug in this tool was found by running it on a real repo, and not one was caught by a hand-written
fixture. Before you claim a change works, run it on something real.

## Writing tests (for any project, including this one)

The standard is **the library's own documentation**, never a house invention:

| Layer | The standard is | From |
|---|---|---|
| unit | Vitest / Jest idiom | `conventions/ts/unit.md` |
| integration | Testcontainers / supertest | `conventions/ts/integration.md` |
| e2e | Playwright best practices | `conventions/ts/e2e.md` |

**Read the convention file before writing a test.** Do not write from memory of what a good test
looks like — that memory is your house style, and importing it is precisely what this tool exists to
prevent.

**Never weaken an assertion to make a test pass.** A test that asserts nothing is worse than no
test: it reports coverage that does not exist. If it will not pass honestly, say so.

## Commits

Conventional commits, lowercase, no trailing period.

**No `Co-Authored-By` trailer. No emoji. No mention of Claude, AI, Anthropic, or any agent** — in the
message, the body, the PR, or a code comment. The author is the human.

## Where things are

| | |
|---|---|
| `src/languages.ts` | the registry — the core of the design. All per-language difference lives here as data |
| `src/engine.ts` | `inspect(root)` — the only orchestrator that touches disk |
| `src/gap.ts` | the crossing: changed ∩ uncovered → ranked gaps |
| `conventions/<lang>/<layer>.md` | the test standard the agent is handed. **Traceable to the library's docs — if you cannot cite it, do not write it** |
| `docs/superpowers/specs/` | design documents. `2026-07-13-conventions-are-library-standards.md` reverses an earlier decision — read it |
| `fixtures/` | five languages, same hole planted in each |
