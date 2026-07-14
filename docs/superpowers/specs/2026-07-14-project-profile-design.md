# The engine reads the project's shape — e2e tool + project profile

**Date:** 2026-07-14
**Status:** approved

## The problem

redbar already refuses to assume the unit runner — it detects jest vs vitest from the manifest,
because guessing prints a command that can never work. But two other assumptions are still hardcoded,
and both are wrong for real projects:

1. **The e2e tool is always Playwright.** A project that uses Cypress gets handed the Playwright
   standard and a Playwright convention — a test written to the wrong tool's idiom, which is exactly
   the drift this project exists to kill. "Why Playwright and not Cypress?" is the same question as
   "why vitest and not jest?", and it has the same answer: *don't assume — detect.*

2. **Every gap is ranked purely by structural risk, blind to what the project is.** A frontend app
   and a backend service have their risk in different places. An untested checkout page (e2e) is
   where a frontend breaks in front of a user; an untested repository (integration) is where a
   backend loses data. The score does not know the difference, so the to-do list does not either.

## The principle that governs both

Both are solved the same way redbar solves everything: **read it from the project's own manifest,
mechanically, zero-LLM.** No model decides whether this is a frontend or which e2e tool it uses — a
regex over `package.json` does, and it gives the same answer twice.

**And the score is untouchable.** Its authority is that it is pure counting — lines × coverage ×
branches — and nobody argues with counting. Project-awareness is a *lens over* the ranking, never a
factor *in* it. A weight like "e2e ×1.5 because frontend" would put an opinion inside the one number
this project promises is opinion-free. We do not do that. The profile reorders a view; it never
changes a score, and `explain` never has to justify a taste.

## Feature A — detect the e2e tool

### The registry (`src/languages.ts`)

The e2e tool becomes registry data, exactly like `runners`:

```ts
export type E2eTool = {
  id: string                 // 'playwright' | 'cypress'
  detect: RegExp             // matches the manifest when this tool is in use
  standard: Standard         // the doc the convention is traceable to
  /** conventions/<lang>/<conventionFile> — the tool-specific standard text */
  conventionFile: string     // 'e2e.md' (default) | 'e2e.cypress.md'
}
```

Each language gets `e2eTools: E2eTool[]`. First whose `detect` matches the manifest wins; the last is
the fallback when the manifest names none — same rule as `runners`. For TypeScript:

```ts
e2eTools: [
  { id: 'cypress',    detect: /"cypress"\s*:/,        standard: {…cypress docs…}, conventionFile: 'e2e.cypress.md' },
  { id: 'playwright', detect: /"@playwright\/test"/,   standard: {…playwright…},   conventionFile: 'e2e.md' },
]
```

Playwright stays last, so it is also the default — every existing test and the existing `e2e.md`
keep working untouched. Languages that only have one realistic e2e tool get a single-entry array.

### Selection (`src/runner.ts`, beside `selectRunner`)

```ts
export function selectE2eTool(root: string, lang: Language): E2eTool
```

Same shape as `selectRunner`: read the manifest, first-match-wins, fall back to the last entry. Pure
except for reading the manifest, which `selectRunner` already does.

### Wiring

`standards.e2e` and the e2e convention file are no longer read directly. Wherever the briefing or
`execute` needs the e2e standard/convention, it comes from `selectE2eTool(root, lang)`. The `unit`
and `integration` entries of `standards` are unchanged.

### The Cypress convention

`conventions/ts/e2e.cypress.md`, same five-question structure as every other convention, traceable
to the [Cypress Best Practices](https://docs.cypress.io/app/core-concepts/best-practices) and
[Cypress Retry-ability](https://docs.cypress.io/app/core-concepts/retry-ability) docs. Nothing
invented — if a rule is not in the Cypress docs, it does not go in the file.

## Feature B — detect the project profile

### The profile (`src/profile.ts`, pure)

```ts
export type Profile = 'frontend' | 'backend' | 'fullstack' | 'library'
export function detectProfile(manifest: string): Profile
```

Regex over the manifest text — the same text `selectRunner` already reads:

- **fullstack** — a meta-framework that is both: `next`, `nuxt`, `remix`, `@sveltejs/kit`.
- **frontend** — a view framework and no server: `react`, `vue`, `@angular/core`, `svelte`,
  `solid-js`, `preact`.
- **backend** — a server framework: `express`, `fastify`, `@nestjs/core`, `koa`, `hapi`,
  `spring-boot-starter-web`, `django`, `flask`, `fastapi`, `laravel`, `actix-web`, `axum`.
- **library** — none of the above. The default, and it means "no profile signal", not "a library
  literally". Its lens is the plain score order.

The markers are registry data (a table in `profile.ts`), so adding one is a line, and a
`switch (profile)` never appears.

### The lens: kind priority per profile

Each profile declares the order in which *kinds of test* carry the most value **for that kind of
project** — a statement about where risk concentrates, not about any one gap:

| profile | order of kinds |
|---|---|
| frontend | e2e → integration → unit |
| fullstack | e2e → integration → unit |
| backend | integration → unit → e2e |
| library | (score order — no reordering) |

This is defensible and it is *not* the score: it is a claim about project types that a reader can
agree or disagree with out loud, sitting beside the number, never inside it.

### The output: a "Focus for this project" section

`renderBriefing` gains one section, and the HTML/PDF gain the matching block. It shows the **same
gaps, already ranked by the untouched score**, grouped under the profile's kind-priority, with one
sentence naming the profile and why this ordering:

```
## Focus for this project

Detected: a **frontend** project (React). The score below is unchanged — it is still pure counting.
But for a frontend, the gaps that reach a user first are the e2e and integration ones. In score
order within each group:

### e2e — where a frontend breaks in front of someone
  [the e2e gaps, in score order]
### integration — the seams to your data and APIs
  [the integration gaps, in score order]
### unit — real, and they still matter
  [the unit gaps, in score order]
```

For `library` (no signal), the section is omitted — there is nothing honest to say, and an empty
"Focus" section is noise.

## What this deliberately does not do

- **No weight in the score.** Settled above. The profile reorders a view; it never multiplies a
  number.
- **No model anywhere.** Both detections are manifest regexes. If either needed a model to decide,
  it would not belong in the analysis half.
- **No per-file profile.** A monorepo with a frontend and a backend package is out of scope; the
  profile is one verdict for the root manifest. If that proves too coarse on a real repo, that is a
  follow-up — and a real repo is what will tell us, not a fixture.
- **No new runtime dependency**, and adding an e2e tool, a profile marker, or a language stays one
  line of registry data.

## Testing

- `profile.ts` — pure: one case per profile, plus the precedence rules (fullstack beats frontend
  when both a meta-framework and react are present; a view framework + a server framework resolves
  deterministically).
- `selectE2eTool` — cypress in the manifest picks Cypress; nothing picks the default; extends
  `runner.test.ts`.
- `briefing` — a frontend manifest produces the Focus section with e2e first; a library manifest
  omits it; the score and the existing "The work" / "The standards" sections are unchanged.
- A **real repository**: run `briefing` on a real React app and a real backend and read whether the
  Focus section says something true. Fixtures test what we thought of.
