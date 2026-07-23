# Changelog

All notable changes to redbar are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versioning
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

While the major version is `0`, the public surface — the CLI flags, the `gaps.json` shape, and the
`Language` registry type — may still change in a minor release. It will be noted here when it does.

## [Unreleased]

### Fixed

- **`execute` não escrevia teste nenhum — em qualquer LLM.** O agente é dirigido headless
  (`agente -p <prompt>`), e nesse modo todo CLI (claude, codex, copilot, gemini, cursor) **nega uma
  escrita de arquivo que não consegue aprovar com um humano**: o agente rodava, escrevia zero, e o
  `execute` marcava `no-output` pra todo gap. Cada linha do registry de agentes agora carrega a flag
  de auto-aprovação de escrita do próprio vendor (`--permission-mode acceptEdits`,
  `--sandbox workspace-write`, `--allow-tool write`, `--approval-mode auto_edit`, `-f`). redbar não
  força modelo: dirige o agente na config do dev, não o re-configura. Spec em
  `docs/superpowers/specs/2026-07-23-execute-multi-llm-headless-write.md`.

## [0.1.2] — 2026-07-22

A correção de descoberta do servidor MCP. Depois de `npm link`, o Codex (e os outros clientes) não
achavam o `redbar`: o host do MCP dá spawn no servidor com o PATH sanitizado, sem o bin global do npm,
então `command: "redbar"` pelado nunca resolvia. Encontrado no #13, rodando o redbar num setup real.

### Fixed

- **O servidor MCP não era descoberto após `npm link`** (#13). A causa é o PATH sanitizado do host —
  o bin global do npm não está no ambiente do spawn, então o comando `redbar` pelado não resolve. O
  registro agora usa launch **portátil por `npx`** (`npx -y redbar mcp`), que não depende de link nem
  de caminho absoluto e funciona em qualquer máquina.

### Added

- **`redbar mcp-config [cliente]`** — imprime o registro do servidor MCP no formato exato de cada
  cliente. Novo registry `src/clients.ts`, uma linha de dado por cliente (mesma lei de `languages.ts`),
  cobrindo Claude, Codex, Cursor, Copilot, Gemini e VS Code, cada um com sua sintaxe verificada. O
  comando imprime; o dono roda.
- **`--local`** no `mcp-config`, para quem trabalha a partir do clone: emite o launch com caminho
  absoluto (`process.execPath` + `dist/cli.js`) em vez do `npx`.
- **Time de agents especialistas** (`core`, `arquiteto`, `qa`, `llm-mcp`, `oss`, `scribe`) e o
  roteamento entre eles, documentados no `AGENTS.md` — a fonte única para Claude Code, Codex, Cursor
  e Copilot.

### Changed

- **Instalação por `npx redbar`**, sem clone para o usuário final — o README passa a apresentar o
  `mcp-config` no lugar do registro manual com `redbar` pelado.
- `prepublishOnly` agora roda `typecheck` e os testes antes de empacotar, então uma release quebrada
  não sai.

## [0.1.1] — 2026-07-13

The engine, the CLI, and the agent skills. Verified against a production React Native app and
against redbar itself.

### Added

- **Engine.** Crosses the project's coverage report with `git diff main...HEAD` and reports which
  changed symbols nothing executes. **No model is called** — the number comes from the coverage
  report and git, which is what makes it auditable.
- **Language registry** (`src/languages.ts`). One row of data per language: markers, runners,
  coverage format, symbol patterns, test libraries. Adding a language is one line, never a new
  module. Ships with TypeScript/JavaScript, Java, Python, Rust, PHP, and Go.
- **Three coverage parsers** — lcov, JaCoCo XML, Cobertura XML — which between them read every
  language above. Hand-written; **zero runtime dependencies.**
- **Runner detection.** jest vs vitest, maven vs gradle. They share neither a command nor a report
  path, and assuming one of them prints a command that can never produce the report redbar waits
  for.
- **Criticality bands** (`critical` / `high` / `medium` / `low`), from two measured facts: whether
  the symbol has any coverage, and how much branching it hides. The threshold of 5 branches is
  McCabe's.
- **Layer classification.** Each gap is tagged `unit`, `integration`, or `e2e`, inferred from the
  file — a route is e2e, an I/O boundary is integration.
- **CLI** — `redbar inspect`, `redbar init`, `redbar ci`.
  - `init` proposes the missing test libraries and **never installs them**. It prints the command;
    the human presses enter.
  - `ci` is the gate: it exits non-zero when the branch carries gaps above the threshold.
- **Reports** — `.redbar/gaps.json` for the agent, and a printable HTML/PDF table for the human and
  the pull request.
- **Agent skills** — `/redbar.inspect`, `/redbar.fix`, `/redbar.init`. The skill never analyzes
  coverage itself: it runs the engine and reports what came back.
- **Conventions** for TypeScript (unit, integration, e2e). Every rule is traceable to the library's
  own documentation — Playwright's best practices, the Vitest/Jest docs, Testcontainers. **Not a
  house style:** nobody argues with the Playwright docs in a code review.
- **Agent instructions** — `AGENTS.md`, with `CLAUDE.md` and `.github/copilot-instructions.md`
  pointing at it. One source of truth, loaded by the agent without anyone installing anything.

### Fixed

Every one of these was found by running redbar on a real repository. **Not one was caught by a
hand-written fixture** — which is the most useful thing we learned.

- **A file that no test imports never appears in the coverage report at all**, so the engine skipped
  it as "uninstrumented". The file with zero tests was invisible to the tool built to find files
  with zero tests — the exact inverse of the promise. A changed source file absent from the report
  is now a total gap.
- The lcov and Cobertura parsers **overwrote** instead of merging when one file appeared in two
  blocks (a concatenated monorepo report, a PHP trait, a C# lambda). This both lost real gaps and
  **fabricated** false ones by reporting covered lines as uncovered.
- `init` told a **jest** project to install **vitest**, which would have broken its own setup. Unit
  libraries belong to the runner, not to the language.
- Branch counting read keywords out of comments, strings, and regex literals — a static data table
  scored 21 phantom branches and topped the ranking.
- `classify` treated any `app/` path as a Next.js route, so every Python module under `app/` (a
  Flask/FastAPI package) was misfiled as e2e.
- Symbol extraction required the `export` keyword, so real React (`const Button = …`, exported at
  the bottom) came out as `(no symbol)` on every component.
- `git diff` parsing dropped paths with spaces or non-ASCII characters, and a content line beginning
  with `++ ` could hijack the file pointer.
- JaCoCo source roots were unreachable from `inspect()`, so any Kotlin or multi-module Maven repo
  returned **zero gaps with no error**.

[Unreleased]: https://github.com/emersonjds/redbar/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/emersonjds/redbar/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/emersonjds/redbar/releases/tag/v0.1.1
