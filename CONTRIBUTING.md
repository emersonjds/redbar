# Contributing to redbar

Thanks for looking under the hood. redbar is small on purpose — you can read the core in one sitting —
and the contributions that help most are the ones that keep it that way.

## The rules that govern every change

They live in one place, and I won't repeat them here so they can't drift: **[AGENTS.md](AGENTS.md)**.
Read it before you open a PR. One line each:

- **Zero LLM in `src/`** — the analysis is measurement, not a model's opinion.
- **Zero runtime dependencies** — `dependencies` stays empty; CI breaks the build if one appears.
- **Adding a language, agent, or MCP client is one row of data** — in `src/languages.ts`,
  `src/agents.ts`, `src/clients.ts`. A `switch (id)` outside those tables is the sign that the
  design failed.
- **Determinism** — same input, same output, byte for byte.
- **redbar never installs anything** — it prints the command; the human runs it.

## Running

```bash
npm install
npm test            # vitest
npm run typecheck   # tsc --noEmit
npm run coverage    # writes coverage/lcov.info
npm run try -- .    # run redbar on redbar itself
```

**Test first.** Write the failing test, watch it fail, then implement. The test standard is always
the library's own documentation, never a house invention — it's in `conventions/`.

**Find it before you write it.** A fixture tests what you already imagined; a real repository tests
what you didn't. Before you claim a change works, run redbar on a real repo.

## Commits and PRs

- Conventional commits, lowercase, no trailing period. Example: `fix(mcp): resolve the binary by absolute path`.
- Micro commits: one subject per commit.
- **No co-author trailer, no emoji, no mention of AI or agents** — you are the author.
- In the PR: what changes, why, and how you verified it (the command and the output).

## Found a bug or have an idea?

Open an [issue](https://github.com/emersonjds/redbar/issues) — there's a template for bugs and one for
ideas. A small, real repro is worth more than a long description.
