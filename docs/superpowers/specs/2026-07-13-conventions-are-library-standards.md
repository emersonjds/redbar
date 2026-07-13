# redbar — Addendum: conventions are the library's standards, not the team's

**Date:** 2026-07-13
**Status:** addendum to `2026-07-12-design.md` and `2026-07-13-multi-language-and-agents.md`. **It reverses a decision in the original design.** Where they conflict, this document wins.

## What the original design got wrong

The original design said the conventions document is *"this company's testing standard"*, that it *"needs people from the team weighing in"*, and that it is *"the real deliverable — the tool merely executes it."* It told us to start that conversation on day 1.

That is backwards, and it fails at the exact problem it was written to solve.

## The problem restated

The complaint is **"everyone writes tests their own way."** Six people, six styles, no agreement.

Writing a house standard does not fix that. **It adds a seventh style.** It is one more opinion, authored by whoever showed up to the meeting, and it inherits every weakness of the thing it replaced: someone has to defend it, someone disagrees with it, and it goes stale the moment its author changes teams.

There is already a tie-breaker, and it is free.

## The decision

**The convention for a layer is the canonical standard of the library that runs it.** Not an invention.

| Layer | The standard is | Its source |
|---|---|---|
| TS unit | Vitest / Jest idiom | the official Vitest and Jest docs |
| TS e2e | Playwright best practices | Playwright's own "Best Practices" page — role-based locators, no CSS selectors, web-first assertions |
| Python unit | pytest idiom | pytest docs — plain `assert`, fixtures over setUp |
| Java unit | JUnit 5 + Mockito | JUnit 5 user guide, Mockito docs |
| Java integration | `@SpringBootTest` + Testcontainers | Spring and Testcontainers docs |
| Rust unit | `#[cfg(test)] mod tests` | The Rust Book, ch. 11 |
| PHP unit | PHPUnit idiom | PHPUnit docs |

**Nobody argues with the Playwright docs in a code review. Everybody argues with the standard a colleague invented last week.** That asymmetry is the whole point.

Three consequences that all point the same way:

1. **No meeting blocks the tool.** The Vitest standard exists today. The company's standard requires humans to agree first, which is exactly the dependency the original design flagged as its top risk — and then accepted anyway.
2. **The model already knows this.** "Follow Playwright's best practices" lands far better than "follow the standard we wrote last week", because the model was trained on the former and has never seen the latter. Less drift, less hallucination, less review friction.
3. **redbar becomes publishable.** The original design wanted to ship this as a public skill later. With house conventions, every company rewrites `conventions/` before the tool does anything. With library standards, it works out of the box, everywhere.

## The escape hatch, and why it is small

Some choices genuinely are local, and no library documents them:

- MSW or nock for HTTP mocking?
- Which fixture factory?
- Does this repo use Testcontainers, or a shared staging database?

So the project may override, but it **starts from the standard and only states its deltas**:

```
conventions/<lang>/<layer>.md          ← shipped with redbar. The library's canonical standard.
.redbar/conventions/<lang>/<layer>.md  ← optional. The project's deltas, if any.
```

The prompt gets the shipped standard, and the project's overrides appended after it. Absent an override — which is the normal case — the agent writes an idiomatic test that any developer on earth can read.

**An override must justify itself.** A project that overrides everything has not adopted a standard, it has written a house style with extra steps. If the file starts growing, that is the smell.

## What this changes in the tool

Almost nothing, which is the point — the conventions were always data:

- `conventions/` ships **inside redbar**, populated from each library's official documentation, with the source linked in the file.
- `loadConvention(lang, layer, root)` reads the shipped file, then appends `.redbar/conventions/<lang>/<layer>.md` from the project if it exists.
- `canFix: true` still requires a written convention. That gate stays.

## What this changes in the pitch

The old line was *"the agent writes tests the house way, not the model's way."*

The new line is stronger, because it is verifiable:

> **The agent writes tests the way the library's own documentation says to — not the way the model felt like it that morning.**

The standard is no longer something the company has to produce before the tool is useful. It is something the tool brings with it, on day one, with a citation.
