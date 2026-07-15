# Project profile + e2e-tool detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the engine read the project's shape from its manifest — detect the e2e tool (Playwright vs Cypress) instead of hardcoding it, and detect the project profile (frontend/backend/fullstack/library) to add a "Focus for this project" lens — without ever touching the score.

**Architecture:** Two pure detections, both regex over the manifest text `selectRunner` already reads. `profile.ts` (pure) classifies the project and declares a kind-priority per profile. `E2eTool` becomes registry data on each language, selected by `selectE2eTool` beside `selectRunner`. The score is untouchable: the profile only reorders a *view* in the briefing/report; it is never a factor in `severity` or the score. `renderBriefing` stays pure — the caller (`cli.ts`) resolves the profile and the e2e tool from disk and passes them in.

**Tech Stack:** TypeScript 7, Node 20.11+, vitest. No new dependency.

## Global Constraints

- **Zero runtime dependencies.** `dependencies` in package.json stays `{}`.
- **Zero LLM.** Both detections are manifest regexes. No model decides the profile or the e2e tool.
- **The score is never touched.** No profile weight in `severity` or in the score formula. The profile reorders a view only. `explain` output must be byte-identical to before.
- **Per-project difference is registry DATA.** Profile markers and e2e tools live in tables. No `switch (profile)` / `if (tool.id === …)` / `switch (lang)` outside a registry.
- **Purity.** `src/profile.ts` never touches disk or spawns. `src/runner.ts` may read the manifest (it already does). `renderBriefing`/`renderHtml` stay pure — resolved profile and standard arrive as parameters.
- **Deterministic output.** Same input, same bytes.
- **Conventions are traceable to the library's docs.** The Cypress convention cites the Cypress docs; if a rule is not in them, it does not go in the file.
- **Commits:** conventional, lowercase, Portuguese, no trailing period. NO `Co-Authored-By`, NO emoji, NO mention of AI/Claude/Anthropic in messages, bodies, or code comments.

---

### Task 1: The project profile

**Files:**
- Create: `src/profile.ts`
- Test: `test/profile.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  ```ts
  export type Profile = 'frontend' | 'backend' | 'fullstack' | 'library'
  export function detectProfile(manifest: string): Profile
  export function kindPriority(profile: Profile): TestKind[]   // TestKind from './types.js'
  export function profileLabel(profile: Profile): string       // human name for the report
  ```

- [ ] **Step 1: Write the failing test**

```ts
// test/profile.test.ts
import { describe, expect, it } from 'vitest'
import { detectProfile, kindPriority, profileLabel } from '../src/profile.js'

describe('detectProfile', () => {
  it('is frontend for a react manifest with no server', () => {
    expect(detectProfile('{"dependencies":{"react":"18","react-dom":"18"}}')).toBe('frontend')
  })

  it('is frontend for vue, angular, svelte, solid, preact', () => {
    for (const dep of ['vue', '@angular/core', 'svelte', 'solid-js', 'preact']) {
      expect(detectProfile(`{"dependencies":{"${dep}":"1"}}`)).toBe('frontend')
    }
  })

  it('is backend for a server framework and no view', () => {
    for (const dep of ['express', 'fastify', '@nestjs/core', 'koa', '@hapi/hapi']) {
      expect(detectProfile(`{"dependencies":{"${dep}":"1"}}`)).toBe('backend')
    }
  })

  it('reads a backend framework out of a non-json manifest too (pom.xml, pyproject)', () => {
    expect(detectProfile('<artifactId>spring-boot-starter-web</artifactId>')).toBe('backend')
    expect(detectProfile('dependencies = ["fastapi"]')).toBe('backend')
    expect(detectProfile('django = "5.0"')).toBe('backend')
  })

  it('is fullstack for a meta-framework, even when react is also present', () => {
    // next pulls react in as a dependency; the meta-framework verdict must win, because such a
    // project has both an e2e-worthy UI and real server routes
    expect(detectProfile('{"dependencies":{"next":"14","react":"18"}}')).toBe('fullstack')
    for (const dep of ['nuxt', 'remix', '@sveltejs/kit']) {
      expect(detectProfile(`{"dependencies":{"${dep}":"1"}}`)).toBe('fullstack')
    }
  })

  it('is fullstack when a frontend AND a separate backend framework are both present', () => {
    // a repo that ships react and express together is both — treat it as fullstack, not one or the
    // other, so the lens surfaces e2e and integration rather than dropping half the project
    expect(detectProfile('{"dependencies":{"react":"18","express":"4"}}')).toBe('fullstack')
  })

  it('is library when nothing matches — the honest "no signal" default', () => {
    expect(detectProfile('{"dependencies":{"lodash":"4"}}')).toBe('library')
    expect(detectProfile('')).toBe('library')
  })
})

describe('kindPriority', () => {
  it('puts e2e first for a frontend', () => {
    expect(kindPriority('frontend')).toEqual(['e2e', 'integration', 'unit'])
  })

  it('puts e2e first for a fullstack', () => {
    expect(kindPriority('fullstack')).toEqual(['e2e', 'integration', 'unit'])
  })

  it('puts integration first for a backend', () => {
    expect(kindPriority('backend')).toEqual(['integration', 'unit', 'e2e'])
  })

  it('is the neutral order for a library, and every priority is a full permutation of the kinds', () => {
    const kinds = ['unit', 'integration', 'e2e']
    for (const p of ['frontend', 'backend', 'fullstack', 'library'] as const) {
      expect([...kindPriority(p)].sort()).toEqual([...kinds].sort())
    }
  })
})

describe('profileLabel', () => {
  it('gives a human name for the report', () => {
    expect(profileLabel('frontend')).toMatch(/frontend/i)
    expect(profileLabel('library')).toMatch(/librar|no .*signal/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/profile.test.ts`
Expected: FAIL — `Cannot find module '../src/profile.js'`

- [ ] **Step 3: Write `src/profile.ts`**

```ts
// Pure: manifest text in, a profile out. No disk, no process — the caller reads the manifest (the
// same text selectRunner already reads) and passes it here.
import type { TestKind } from './types.js'

/**
 * What shape of project is this? Read from the manifest, mechanically — no model decides it, a
 * regex does, and it answers the same way twice.
 *
 * `library` is the honest "no signal" default, not a claim that the code is literally a library. It
 * means no framework marker matched, so there is nothing true to say about where risk concentrates,
 * and the lens stays out of the way.
 */
export type Profile = 'frontend' | 'backend' | 'fullstack' | 'library'

// Registry data, not branching. A meta-framework is BOTH a UI and a server, so it is checked first
// and wins outright. Everything else is a plain marker list. Adding a framework is one line here.
const META = /"(next|nuxt|remix|@sveltejs\/kit)"|\bremix\b/
const FRONTEND = /"(react|react-dom|vue|@angular\/core|svelte|solid-js|preact)"|\bstreamlit\b/
const BACKEND =
  /"(express|fastify|@nestjs\/core|koa|@hapi\/hapi)"|spring-boot-starter-web|\b(fastapi|flask|django|laravel\/framework|actix-web|axum|gin-gonic)\b|"laravel\//

export function detectProfile(manifest: string): Profile {
  const meta = META.test(manifest)
  if (meta) return 'fullstack'

  const front = FRONTEND.test(manifest)
  const back = BACKEND.test(manifest)

  // a repo that ships a view framework AND a server framework is genuinely both — fullstack, so the
  // lens surfaces e2e and integration instead of silently dropping half the project
  if (front && back) return 'fullstack'
  if (front) return 'frontend'
  if (back) return 'backend'
  return 'library'
}

// The order in which KINDS of test carry the most value FOR THIS KIND OF PROJECT. A statement about
// project types, sitting beside the score — never inside it. Every list is a full permutation of
// the three kinds, so no gap is ever dropped from the lens.
const PRIORITY: Record<Profile, TestKind[]> = {
  frontend: ['e2e', 'integration', 'unit'],
  fullstack: ['e2e', 'integration', 'unit'],
  backend: ['integration', 'unit', 'e2e'],
  library: ['unit', 'integration', 'e2e'],
}

export function kindPriority(profile: Profile): TestKind[] {
  return PRIORITY[profile]
}

const LABEL: Record<Profile, string> = {
  frontend: 'a frontend project',
  backend: 'a backend project',
  fullstack: 'a fullstack project',
  library: 'no clear frontend/backend signal',
}

export function profileLabel(profile: Profile): string {
  return LABEL[profile]
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/profile.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/profile.ts test/profile.test.ts
git commit -m "feat(profile): detecta front/back/fullstack a partir do manifest, sem tocar no score"
```

---

### Task 2: The e2e-tool registry and its selector

**Files:**
- Modify: `src/languages.ts` (add the `E2eTool` type and an `e2eTools` array to the TypeScript entry; the other languages get a single-entry Playwright array)
- Modify: `src/runner.ts` (add `selectE2eTool`, exporting the shared `readManifest`)
- Test: `test/runner.test.ts` (extend)

**Interfaces:**
- Consumes: `Language`, `Standard`, `readManifest` from `src/runner.ts`
- Produces:
  ```ts
  // in languages.ts
  export type E2eTool = { id: string; detect: RegExp; standard: Standard; conventionFile: string }
  // each Language gains: e2eTools: E2eTool[]
  // in runner.ts
  export function selectE2eTool(root: string, lang: Language): E2eTool
  ```

- [ ] **Step 1: Write the failing test**

Add to `test/runner.test.ts`:

```ts
import { selectE2eTool } from '../src/runner.js'
// (byId is already imported in this file; if not, add: import { byId } from '../src/languages.js')

describe('selectE2eTool', () => {
  const ts = byId('ts')!

  it('picks Cypress when the manifest depends on it', () => {
    // a real repo layout: cypress in devDependencies
    const root = writeManifest('{"devDependencies":{"cypress":"13"}}')
    const tool = selectE2eTool(root, ts)
    expect(tool.id).toBe('cypress')
    expect(tool.conventionFile).toBe('e2e.cypress.md')
    expect(tool.standard.url).toMatch(/cypress\.io/)
  })

  it('picks Playwright when the manifest depends on it', () => {
    const root = writeManifest('{"devDependencies":{"@playwright/test":"1.4"}}')
    expect(selectE2eTool(root, ts).id).toBe('playwright')
  })

  it('falls back to the last entry (Playwright) when the manifest names no e2e tool', () => {
    const root = writeManifest('{"dependencies":{"react":"18"}}')
    const tool = selectE2eTool(root, ts)
    expect(tool.id).toBe('playwright')
    expect(tool.conventionFile).toBe('e2e.md')
  })

  it('every language declares at least one e2e tool, and the last is the default', () => {
    for (const lang of LANGUAGES) {
      expect(lang.e2eTools.length).toBeGreaterThan(0)
    }
  })
})
```

At the top of `test/runner.test.ts`, if there is no manifest-writing helper already, add one and make sure `LANGUAGES` is imported (`import { byId, LANGUAGES } from '../src/languages.js'`):

```ts
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function writeManifest(json: string): string {
  const root = mkdtempSync(join(tmpdir(), 'redbar-e2e-'))
  writeFileSync(join(root, 'package.json'), json)
  return root
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/runner.test.ts`
Expected: FAIL — `selectE2eTool is not a function` (and a type error on `lang.e2eTools`).

- [ ] **Step 3: Add the `E2eTool` type and registry data in `src/languages.ts`**

Add the type next to `Standard`:

```ts
/**
 * An end-to-end tool a project might use. Detected from the manifest exactly like the unit runner —
 * "why Playwright and not Cypress?" is the same question as "why vitest and not jest?", and it has
 * the same answer: don't assume, read it from the project.
 *
 * First whose `detect` matches the manifest wins; the LAST entry is the default, so the tool that
 * ships with redbar's own convention (`e2e.md`) stays the fallback and nothing pre-existing breaks.
 */
export type E2eTool = { id: string; detect: RegExp; standard: Standard; conventionFile: string }
```

Add `e2eTools: E2eTool[]` to the `Language` type, right after `standards`:

```ts
  /** e2e tools this language can use; first match wins, last is the default. See `E2eTool`. */
  e2eTools: E2eTool[]
```

For the **TypeScript** entry, add both Playwright and Cypress (Playwright last = default):

```ts
    e2eTools: [
      {
        id: 'cypress',
        detect: /"cypress"\s*:/,
        standard: { name: 'Cypress Best Practices', url: 'https://docs.cypress.io/app/core-concepts/best-practices' },
        conventionFile: 'e2e.cypress.md',
      },
      {
        id: 'playwright',
        detect: /"@playwright\/test"\s*:/,
        standard: { name: 'Playwright Best Practices', url: 'https://playwright.dev/docs/best-practices' },
        conventionFile: 'e2e.md',
      },
    ],
```

For **every other language** (rust, go, java, php, python), add a single-entry array using that
language's existing `standards.e2e` value, so nothing changes for them:

```ts
    // rust / go / php — Playwright is the only realistic browser e2e tool wired today
    e2eTools: [
      { id: 'playwright', detect: /@playwright\/test|playwright/, standard: { name: 'Playwright Best Practices', url: 'https://playwright.dev/docs/best-practices' }, conventionFile: 'e2e.md' },
    ],
```

```ts
    // java
    e2eTools: [
      { id: 'playwright', detect: /playwright/, standard: { name: 'Playwright Best Practices', url: 'https://playwright.dev/docs/best-practices' }, conventionFile: 'e2e.md' },
    ],
```

```ts
    // python
    e2eTools: [
      { id: 'playwright', detect: /pytest-playwright|playwright/, standard: { name: 'Playwright Best Practices', url: 'https://playwright.dev/docs/best-practices' }, conventionFile: 'e2e.md' },
    ],
```

(The single-entry arrays always fall through to their one entry, so the `detect` regex there only
has to be something; it is never the deciding factor.)

- [ ] **Step 4: Add `selectE2eTool` to `src/runner.ts`**

`readManifest` in `runner.ts` is currently private. Export it (add `export`) so the new function
reuses it instead of duplicating, then add:

```ts
import type { E2eTool, Language, Runner } from './languages.js'

/**
 * Which e2e tool does this project actually use? Same rule as selectRunner: read the manifest,
 * first-match-wins, fall back to the last entry (the default). A project on Cypress must not be
 * handed the Playwright convention — that is a test written to the wrong tool's idiom, the exact
 * drift redbar exists to kill.
 */
export function selectE2eTool(root: string, lang: Language): E2eTool {
  const manifest = readManifest(root, lang)
  const found = lang.e2eTools.find((t) => t.detect.test(manifest))
  return found ?? lang.e2eTools[lang.e2eTools.length - 1]!
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run test/runner.test.ts test/languages.test.ts && npm run typecheck`
Expected: PASS. If `test/languages.test.ts` asserts a fixed shape of `Language`, update it to
include `e2eTools`.

- [ ] **Step 6: Commit**

```bash
git add src/languages.ts src/runner.ts test/runner.test.ts test/languages.test.ts
git commit -m "feat(runner): detecta a ferramenta e2e do manifest, playwright ou cypress"
```

---

### Task 3: The Cypress convention

**Files:**
- Create: `conventions/ts/e2e.cypress.md`

This is a documentation task: one convention file, same five-question structure as
`conventions/ts/e2e.md`, but for Cypress and traceable to the Cypress docs.

- [ ] **Step 1: Read the template and the source docs**

Read `conventions/ts/e2e.md` (the Playwright one) for the exact structure, voice, and length to
match. The five sections, in order: where the file lives, what one test looks like, what to assert,
locators/finding things, what to mock, naming.

- [ ] **Step 2: Write `conventions/ts/e2e.cypress.md`**

Ground every rule in the Cypress docs — cite them in the header, invent nothing. The load-bearing
facts, all from [Cypress Best Practices](https://docs.cypress.io/app/core-concepts/best-practices)
and [Retry-ability](https://docs.cypress.io/app/core-concepts/retry-ability):

```markdown
# TypeScript / JavaScript — end-to-end tests (Cypress)

> **Source of this standard:** [Cypress — Best Practices](https://docs.cypress.io/app/core-concepts/best-practices)
> and [Cypress — Retry-ability](https://docs.cypress.io/app/core-concepts/retry-ability). Every rule
> below is on those pages. **Nothing here is a house invention.** If a rule is not in the Cypress
> docs, it does not belong in this file.

## Where the test file lives

`cypress/e2e/<feature>.cy.ts` — the default `specPattern` Cypress looks in.

## What one test looks like

\`\`\`ts
describe('checkout', () => {
  it('a customer can check out a cart', () => {
    cy.visit('/cart')

    cy.contains('button', 'Checkout').click()
    cy.get('[data-cy="card-number"]').type('4242424242424242')
    cy.contains('button', 'Pay').click()

    cy.contains('Order confirmed').should('be.visible')
  })
})
\`\`\`

## What to assert

Assert what the user perceives, with `.should()` — Cypress **retries the command chain until the
assertion passes or times out**. That retry-ability is the whole point; do not defeat it.

\`\`\`ts
cy.contains('Order confirmed').should('be.visible')   // retries
\`\`\`

**Never `cy.wait(<number>)`.** The docs call an arbitrary wait an anti-pattern: wait on the thing,
not the clock — `cy.wait('@postOrder')` on an intercepted route, never `cy.wait(3000)`.

Assert one user-visible flow per test. Keep tests independent — do not chain one test's end state
into the next; the docs say tests must be able to run in isolation and in any order.

## Locators: how to find things

From the Best Practices page, the recommended selector priority:

1. `cy.contains('Submit')` / `cy.contains('button', 'Submit')` — by visible text
2. `cy.get('[data-cy="submit"]')` — a dedicated `data-cy` (or `data-test`) attribute
3. Reach for CSS/id/class **last**, and never tie a test to a brittle
   `.css-1x2y3z` styling class — the docs single this out as the top anti-pattern, because a class
   rename is not a regression and a test that reports it as one gets muted.

## What to mock

**Your own backend: nothing, by default** — it goes end to end. The one thing worth controlling is a
**third party** you do not own or cannot make deterministic — stub it with `cy.intercept()`, and only
that. Do not intercept your own API to make an assertion pass; that turns an e2e test into a slow
unit test.

## Naming

- The file: the feature. `cypress/e2e/checkout.cy.ts`.
- `describe` — the feature; `it` — **what the user does**, present tense, from the user's side:
  `it('a customer can check out a cart')`, not `it('CheckoutPage submits the form')`.
- If the name mentions a component, a prop, or a selector, it is written from the code's point of
  view. Rewrite it from the user's.
```

- [ ] **Step 3: Verify it renders in a briefing (after Task 5 is done, or skip to a spot check now)**

Confirm the file parses as markdown and matches the five-section structure of the Playwright file:

Run: `head -5 conventions/ts/e2e.cypress.md && grep -c '^## ' conventions/ts/e2e.cypress.md`
Expected: the header blockquote, and `5` second-level sections (or 6 if you split locators out).

- [ ] **Step 4: Commit**

```bash
git add conventions/ts/e2e.cypress.md
git commit -m "feat(conventions): padrão e2e do cypress, rastreável à doc do cypress"
```

---

### Task 4: The "Focus for this project" lens in the briefing

**Files:**
- Modify: `src/briefing.ts` (add the profile param and the Focus section; take the e2e standard from the resolved tool)
- Test: `test/briefing.test.ts` (extend)

**Interfaces:**
- Consumes: `Profile`, `kindPriority`, `profileLabel` from `src/profile.js`; `severity`, `ranked` from `src/severity.js`; existing `Inspection`, `Conventions`
- Produces: a new `renderBriefing` signature:
  ```ts
  export function renderBriefing(
    inspection: Inspection,
    conventions: Conventions,
    repoName: string,
    profile: Profile,
    e2eStandard: Standard,   // from selectE2eTool — overrides language.standards.e2e for display
  ): string
  ```

The existing callers pass the two new args. `renderBriefing` stays pure — it does not read the
manifest; the caller resolves `profile` and `e2eStandard` and passes them.

- [ ] **Step 1: Write the failing test**

Add to `test/briefing.test.ts` (the file already builds an `inspection(gaps)` helper and imports
`byId`; reuse them). Note the new signature — update the existing `renderBriefing(...)` calls in
this file to pass `'library'` and the language's default e2e standard so they keep asserting what
they asserted before:

```ts
import { detectProfile } from '../src/profile.js'

const e2eStd = language.standards.e2e // the default; individual tests override the profile

describe('renderBriefing — the project-profile lens', () => {
  const gaps = [
    gap({ symbol: 'Checkout', file: 'src/pages/checkout.tsx', kind: 'e2e' }),
    gap({ symbol: 'request', file: 'src/api.ts', kind: 'integration' }),
    gap({ symbol: 'formatMoney', file: 'src/money.ts', kind: 'unit' }),
  ]

  it('adds a Focus section that names the profile for a frontend', () => {
    const md = renderBriefing(inspection(gaps), {}, 'shop', 'frontend', e2eStd)

    expect(md).toContain('## Focus for this project')
    expect(md).toMatch(/frontend/i)
  })

  it('orders the Focus groups by the profile priority — e2e before unit for a frontend', () => {
    const md = renderBriefing(inspection(gaps), {}, 'shop', 'frontend', e2eStd)
    const focus = md.slice(md.indexOf('## Focus for this project'))

    // within the Focus section, the e2e heading comes before the unit heading
    expect(focus.indexOf('e2e')).toBeLessThan(focus.indexOf('unit'))
  })

  it('orders integration before e2e for a backend', () => {
    const md = renderBriefing(inspection(gaps), {}, 'svc', 'backend', e2eStd)
    const focus = md.slice(md.indexOf('## Focus for this project'))

    expect(focus.indexOf('integration')).toBeLessThan(focus.indexOf('e2e'))
  })

  it('omits the Focus section entirely for a library — no signal, nothing honest to say', () => {
    const md = renderBriefing(inspection(gaps), {}, 'lib', 'library', e2eStd)
    expect(md).not.toContain('## Focus for this project')
  })

  it('does not touch the score — the arithmetic in The work is unchanged by the profile', () => {
    const front = renderBriefing(inspection(gaps), {}, 'x', 'frontend', e2eStd)
    const lib = renderBriefing(inspection(gaps), {}, 'x', 'library', e2eStd)

    // the "## The work" section (the ranked, scored list) is byte-identical regardless of profile
    const work = (md: string) => md.slice(md.indexOf('## The work'), md.indexOf('## The standards'))
    expect(work(front)).toBe(work(lib))
  })

  it('the Focus section lists the SAME gaps, just regrouped — none added, none dropped', () => {
    const md = renderBriefing(inspection(gaps), {}, 'shop', 'frontend', e2eStd)
    const focus = md.slice(md.indexOf('## Focus for this project'), md.indexOf('## The work'))

    for (const symbol of ['Checkout', 'request', 'formatMoney']) {
      expect(focus).toContain(symbol)
    }
  })

  it('shows the e2e standard from the resolved tool, not always Playwright', () => {
    const cypress = { name: 'Cypress Best Practices', url: 'https://docs.cypress.io/x' }
    const md = renderBriefing(inspection([gap({ kind: 'e2e' })]), {}, 'shop', 'frontend', cypress)

    expect(md).toContain('Cypress Best Practices')
    expect(md).toContain('docs.cypress.io')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/briefing.test.ts`
Expected: FAIL — the existing calls now have the wrong arity / the Focus section does not exist.

- [ ] **Step 3: Update `renderBriefing` in `src/briefing.ts`**

Change the signature and the e2e-standard lookup, and insert the Focus section **before** `## The
work` (the ranked list stays exactly as it is). Add the imports:

```ts
import { kindPriority, profileLabel, type Profile } from './profile.js'
import type { Standard } from './languages.js'
```

New signature:

```ts
export function renderBriefing(
  inspection: Inspection,
  conventions: Conventions,
  repoName: string,
  profile: Profile,
  e2eStandard: Standard,
): string {
```

Inside, the standard for a gap's layer must use `e2eStandard` for e2e and `language.standards` for
the rest. Add a helper near the top of the function body, and replace the two existing
`language.standards[...]` reads with it:

```ts
  const standardFor = (kind: TestKind): Standard =>
    kind === 'e2e' ? e2eStandard : language.standards[kind]
```

- at line ~99 (`const std = language.standards[gap.kind]`) → `const std = standardFor(gap.kind)`
- at line ~116 (`const std = language.standards[layer]`) → `const std = standardFor(layer)`

Then, immediately before the `out.push('## The work', '')` line, insert the Focus section. It groups
the already-`ranked(gaps)` list (`work`, computed above in the function) by the profile's kind
priority — same gaps, same per-gap order, regrouped:

```ts
  // The lens. Same gaps, same score order within each group — only regrouped by where THIS kind of
  // project concentrates its risk. It reorders a view; it never touched a score. 'library' means no
  // signal, so there is nothing honest to group by and the section is omitted.
  if (profile !== 'library') {
    out.push(
      '## Focus for this project',
      '',
      `Detected: **${profileLabel(profile)}**. The score below is unchanged — it is still pure ` +
        `counting. But for ${profileLabel(profile)}, the gaps that bite first are grouped here, ` +
        `each group in score order.`,
      '',
    )

    const blurb: Record<TestKind, string> = {
      e2e: 'e2e — where it breaks in front of a user',
      integration: 'integration — the seams to your data and APIs',
      unit: 'unit — real, and they still matter',
    }

    for (const kind of kindPriority(profile)) {
      const inKind = work.filter((g) => g.kind === kind)
      if (inKind.length === 0) continue
      out.push(`### ${blurb[kind]}`, '')
      for (const g of inKind) {
        out.push(`- \`${g.symbol ?? '(no symbol)'}\` — \`${g.file}:${g.lines[0]}\` · ${severity(g)}`)
      }
      out.push('')
    }
  }
```

Make sure `severity` is imported in briefing.ts (it already imports `ranked, severity` from
`./severity.js` — confirm; if only `ranked` is imported, add `severity`).

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/briefing.test.ts && npm run typecheck`
Expected: the new tests PASS; the typecheck fails only where the two callers (`cli.ts`) still use the
old arity — that is Task 6. If `test/briefing.test.ts` had pre-existing `renderBriefing(...)` calls,
they were updated in Step 1 to the new arity and pass.

- [ ] **Step 5: Commit**

```bash
git add src/briefing.ts test/briefing.test.ts
git commit -m "feat(briefing): seção de foco por perfil de projeto, sem reordenar o score"
```

---

### Task 5: The Focus block in the HTML/PDF report

**Files:**
- Modify: `src/report.ts` (`renderHtml` gains the profile and shows a Focus block)
- Test: `test/report.test.ts` (extend)

**Interfaces:**
- Consumes: `Profile`, `kindPriority`, `profileLabel` from `src/profile.js`
- Produces: a new `renderHtml` signature:
  ```ts
  export function renderHtml(inspection: Inspection, repoName: string, profile: Profile): string
  ```

- [ ] **Step 1: Write the failing test**

Add to `test/report.test.ts`:

```ts
import { detectProfile } from '../src/profile.js'

describe('renderHtml — the profile lens', () => {
  const gaps = [
    gap({ symbol: 'Checkout', kind: 'e2e' }),
    gap({ symbol: 'fmt', kind: 'unit' }),
  ]

  it('names the profile in a Focus block for a frontend', () => {
    const html = renderHtml(inspection(gaps), 'shop', 'frontend')
    expect(html).toMatch(/Focus for this project/i)
    expect(html).toMatch(/frontend/i)
  })

  it('omits the Focus block for a library', () => {
    const html = renderHtml(inspection(gaps), 'lib', 'library')
    expect(html).not.toMatch(/Focus for this project/i)
  })

  it('still renders the ranked table regardless of profile', () => {
    const html = renderHtml(inspection(gaps), 'shop', 'backend')
    expect(html).toContain('<table>')
    expect(html).toContain('Checkout')
  })
})
```

Update the two existing `renderHtml(...)` calls in this file to pass a profile (`'library'` keeps
their output closest to before, since it adds no Focus block).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/report.test.ts`
Expected: FAIL — arity/`Focus` missing.

- [ ] **Step 3: Update `renderHtml` in `src/report.ts`**

Add the import and the parameter, and inject a Focus block right after the `.lead` block and before
the `<table>`:

```ts
import { kindPriority, profileLabel, type Profile } from './profile.js'
```

```ts
export function renderHtml(inspection: Inspection, repoName: string, profile: Profile): string {
```

Build the block (reuses `ranked`, `severity`, `esc`, all already in the file), and interpolate
`${focusBlock}` into the template between `</div>` of `.lead` and `<table>`:

```ts
  const focusBlock =
    profile === 'library'
      ? ''
      : (() => {
          const rows = kindPriority(profile)
            .map((kind) => {
              const inKind = rankedGaps.filter((g) => g.kind === kind)
              if (inKind.length === 0) return ''
              const items = inKind
                .map(
                  (g) =>
                    `<li><span class="kind kind-${g.kind}">${g.kind}</span> ` +
                    `<span class="sym">${g.symbol ? esc(g.symbol) : '<em>—</em>'}</span> ` +
                    `<span class="file">${esc(g.file)}:${g.lines[0]}</span></li>`,
                )
                .join('')
              return `<ul class="focus-group">${items}</ul>`
            })
            .join('')
          return `<div class="focus">
            <h2>Focus for this project</h2>
            <p>Detected: <b>${esc(profileLabel(profile))}</b>. The score and the table below are
            unchanged — pure counting. This groups the same gaps by where ${esc(profileLabel(profile))}
            breaks first.</p>
            ${rows}
          </div>`
        })()
```

Add minimal CSS to the existing `<style>` block (near the `.lead` rules):

```css
  .focus { margin: 0 0 26px; }
  .focus h2 { font-size: 15px; margin: 0 0 6px; }
  .focus p { color: #5c6370; font-size: 12.5px; margin: 0 0 10px; }
  .focus-group { list-style: none; margin: 0 0 8px; padding: 0; }
  .focus-group li { padding: 3px 0; font-size: 12.5px; display: flex; gap: 8px; align-items: baseline; }
```

Place `${focusBlock}` in the template immediately after the closing `</div>` of the `.lead`
paragraph and before `<table>`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/report.test.ts && npm run typecheck`
Expected: the report tests PASS; typecheck still red only at the `cli.ts` callers (Task 6).

- [ ] **Step 5: Commit**

```bash
git add src/report.ts test/report.test.ts
git commit -m "feat(report): bloco de foco por perfil no html e pdf"
```

---

### Task 6: Wire the detections into the CLI

**Files:**
- Modify: `src/cli.ts` (`briefingFor` resolves the profile and the e2e tool; the e2e convention file
  comes from the tool; `renderHtml` calls pass the profile)
- Test: manual, on real repositories (Step 4)

**Interfaces:**
- Consumes: `detectProfile` (`src/profile.js`), `selectE2eTool` (`src/runner.js`), the new
  `renderBriefing`/`renderHtml` signatures
- Produces: the wired CLI — every `briefing`/`inspect --html` path passes the resolved profile

- [ ] **Step 1: Resolve profile + e2e tool where the manifest is read**

In `src/cli.ts`, add imports:

```ts
import { detectProfile } from './profile.js'
import { selectE2eTool } from './runner.js'   // selectRunner is already imported from here
```

`readConventions(root, language)` currently reads a fixed `e2e.md`. Make its e2e layer read the
convention file the detected tool declares. The function builds paths per layer; for the `e2e`
layer, use `selectE2eTool(root, language).conventionFile` instead of the literal `e2e.md`:

```ts
function readConventions(root: string, language: Language): Conventions {
  const conventions: Conventions = {}
  const e2eFile = selectE2eTool(root, language).conventionFile

  for (const layer of LAYERS) {
    const fileName = layer === 'e2e' ? e2eFile : `${layer}.md`
    const shipped = fileURLToPath(new URL(`../conventions/${language.id}/${fileName}`, import.meta.url))
    const project = join(root, '.redbar', 'conventions', language.id, `${layer}.md`)
    const parts = [shipped, project].filter(existsSync).map((p) => readFileSync(p, 'utf8'))
    if (parts.length > 0) conventions[layer] = parts.join('\n\n---\n\n')
  }
  return conventions
}
```

- [ ] **Step 2: Update `briefingFor` and the manifest read**

`briefingFor` must pass the profile and the e2e standard. It needs the manifest text; read it the
same way `selectRunner` does (there is a `readManifest` exported from `runner.js` as of Task 2):

```ts
import { readManifest, selectE2eTool, selectRunner } from './runner.js'

function briefingFor(root: string, inspection: Inspection): string {
  const { language } = inspection
  const profile = detectProfile(readManifest(root, language))
  const e2eStandard = selectE2eTool(root, language).standard
  return renderBriefing(
    inspection,
    readConventions(root, language),
    basename(resolve(root)),
    profile,
    e2eStandard,
  )
}
```

- [ ] **Step 3: Pass the profile to every `renderHtml` call**

There are two `renderHtml(inspection, repoName)` calls (in `runInspect` and `runBriefing`). Both
gain the profile. Compute it once from the manifest in each function:

- In `runInspect`, where `renderHtml(inspection, basename(resolve(root)))` is called:
  ```ts
  writeFileSync(
    flags.html,
    renderHtml(inspection, basename(resolve(root)), detectProfile(readManifest(root, inspection.language))),
  )
  ```
- In `runBriefing`, where `renderHtml(inspection, repo)` builds the HTML/PDF:
  ```ts
  const profile = detectProfile(readManifest(root, inspection.language))
  const html = renderHtml(inspection, repo, profile)
  ```

Typecheck must now be clean.

- [ ] **Step 4: Typecheck, full suite, and a real-repo check**

Run: `npm run typecheck && npx vitest run`
Expected: clean typecheck; entire suite green.

Then run it on a real repository — a frontend one and a backend one if you have both:

```bash
npx tsx src/cli.ts briefing /path/to/a/react/app --all | grep -A12 'Focus for this project'
```

Expected: a "Focus for this project" section naming a **frontend** project, with e2e/integration
grouped above unit, and the "## The work" section below it unchanged. On a repo with Cypress in
`package.json`, confirm the e2e standard shown is Cypress, not Playwright. Confirm `redbar explain`
output on the same repo is byte-identical to before this branch — the score must not have moved.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts
git commit -m "feat(cli): resolve perfil e ferramenta e2e do manifest e passa pro relatório"
```

---

### Task 7: Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the README**

Two edits, in the README's existing voice (plain, declarative, no padding):

1. In the "Every layer, decided for you" area (the classification section), add a short paragraph:
   the e2e tool is detected from the manifest — Cypress if the project uses Cypress, Playwright
   otherwise — the same way the unit runner is, and for the same reason: don't assume, read it.

2. After the ranking/criticality section, add a short "Focus for this project" subsection: redbar
   reads whether the project is frontend, backend, or fullstack from its manifest, and adds a lens
   that regroups the gaps by where that kind of project breaks first — **without touching the
   score.** State plainly that the score stays pure counting and the profile only reorders a view,
   because that is the property the whole tool rests on.

- [ ] **Step 2: Verify and commit**

Run: `npm run typecheck && npx vitest run`
Expected: green (docs change nothing).

```bash
git add README.md
git commit -m "docs: documenta a detecção da ferramenta e2e e a lente de perfil de projeto"
```

---

## Self-review

**Spec coverage.** Feature A (e2e tool detection): registry type + data → Task 2; `selectE2eTool` →
Task 2; Cypress convention → Task 3; wiring so the e2e standard/convention come from the tool →
Tasks 4 (standard in briefing) and 6 (convention file in readConventions). Feature B (profile):
`profile.ts` with detection + kind priority → Task 1; the Focus section in the briefing → Task 4; the
Focus block in HTML/PDF → Task 5; wiring → Task 6. "Score never touched" is asserted directly in Task
4's test (`work(front)` byte-equal to `work(lib)`) and re-checked on a real repo in Task 6. Testing on
a real repository → Task 6 Step 4. Not-doing (no score weight, no per-file profile, no new dep) →
honoured; nothing adds them.

**Type consistency.** `Profile`, `kindPriority`, `profileLabel` defined in Task 1, consumed in 4/5/6.
`E2eTool` and `selectE2eTool` defined in Task 2, consumed in 4/6. `renderBriefing`'s new signature
(Task 4) is exactly what Task 6 calls. `renderHtml`'s new signature (Task 5) is exactly what Task 6
calls. `readManifest` is exported in Task 2 and reused in Task 6. `standardFor`/`e2eStandard` names
are consistent between Task 4's implementation and its test.

**Placeholder scan.** No TBD/TODO; every code step carries complete code; the Cypress convention text
is written out in full in Task 3, not deferred.
