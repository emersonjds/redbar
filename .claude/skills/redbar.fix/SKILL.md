---
name: redbar.fix
description: Write the missing tests for the gaps redbar found, following the canonical standard for that layer (Playwright's best practices for e2e, Vitest/Jest idiom for unit, Testcontainers for integration). Reads `.redbar/gaps.json`, writes one test file per gap, RUNS each test it wrote, and never leaves a failing test behind — a test that fails twice is marked needs-human and deleted. Use after /redbar.inspect, or when asked to write the missing tests, cover a gap, or fix coverage.
argument-hint: Optional — a symbol name, a file path, a severity (e.g. "critical"), or a count ("top 3"). Defaults to the single most critical gap.
user-invocable: true
---

## User Input

```text
$ARGUMENTS
```

Which gaps to fix. Defaults to **the single most critical one** — writing one good test beats
writing five mediocre ones, and the human can always ask for more.

## Before you start

You need `.redbar/gaps.json`. If it does not exist, run `/redbar.inspect` first — **do not guess
what is untested.** Coverage is a runtime fact and it is not visible in the source. Guessing
produces a confident wrong answer.

## The rules that are not negotiable

1. **Write ONE test file per gap.** Create nothing else.
2. **Do not modify the source file under test.** If the code looks wrong, say so in your report —
   do not fix it. You were asked to write a test, and a test that changes the code it tests proves
   nothing.
3. **Run the test you wrote.** Not the whole suite — just yours.
4. **Never leave a red test in the repository.** If it fails twice, delete the file and mark the gap
   `needs-human`. One failing test leaking into a branch erases the value of every passing one.
5. **Follow the convention. Do not improvise a style.** The whole point of redbar is that tests come
   out looking like the library's docs, not like whatever the model felt like that morning.

## Outline

1. **Read the gaps:**

   ```bash
   cat .redbar/gaps.json
   ```

   Pick the target(s) from `$ARGUMENTS`, or the highest-`severity` gap if no argument was given.
   Order: `critical` → `high` → `medium` → `low`, and by `score` within a band.

2. **Read the convention for that gap's layer.** The gap's `kind` field decides which one:

   | `kind` | Read |
   |---|---|
   | `unit` | `conventions/<lang>/unit.md` |
   | `integration` | `conventions/<lang>/integration.md` |
   | `e2e` | `conventions/<lang>/e2e.md` |

   Also read `.redbar/conventions/<lang>/<kind>.md` if it exists — those are the project's own
   deltas, and they win over the shipped standard.

   **Read it every time. Do not work from memory of what a good test looks like** — that memory is
   the model's house style, which is the exact thing this tool exists to prevent.

3. **Read the source of the gap.** The `file`, and the `lines` that are uncovered. Those lines are
   your target: they are what nothing executes today.

4. **Write the test.** Cover the uncovered lines, and **every branch in them** — the `branches`
   count tells you how many decisions are hiding there. A gap with 7 branches needs more than one
   `it`.

5. **Run only the test you wrote:**

   ```bash
   npx vitest run <path-to-your-test>     # or: npx jest <path>, pytest <path>, etc.
   ```

6. **Green?** Move to the next gap.

   **Red?** Read the failure. Fix **the test** — not the source. Run it once more.

   **Red again?** `rm` the test file and mark that gap `needs-human` in your report, with the error.
   **Do not weaken the assertion to make it pass.** A test that asserts nothing is worse than no
   test: it reports coverage that does not exist, which is the exact lie this tool was built to
   eliminate.

7. **Report:** for each gap — the test file created, whether it passes, which convention it
   followed, and *why that convention fits this case*. Then the `needs-human` list, with reasons.

## The trap to avoid

You will be tempted to make a failing test pass by asserting something weaker — `expect(result).toBeDefined()`
instead of `expect(result).toBe(20)`, or wrapping the call in a `try/catch` that swallows.

**That is the worst possible outcome of this skill.** It produces a green suite and a false coverage
number, and it destroys the one thing redbar sells: a number you can trust. If the test will not
pass honestly, `needs-human` is the correct, honorable answer. Take it.
