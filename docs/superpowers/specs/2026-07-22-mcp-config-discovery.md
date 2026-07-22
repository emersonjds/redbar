# redbar — MCP config, PATH-proof discovery

**Date:** 2026-07-22
**Context:** issue #13 — Codex could not find the redbar MCP even after `npm link`. The agent
reported "no Redbar MCP exposed after tool discovery." The server code is correct and tested; the
failure is upstream of the protocol, in registration.

## Problem

Every documented registration registers the server as `command: "redbar"` (a bare binary name).
`npm link` installs `redbar` as a symlink in npm's global-bin directory. When an MCP host (Codex,
Claude Desktop, Cursor, …) spawns the server, it does so with a **sanitized environment** — the
user's interactive `PATH` is not guaranteed, and npm's global-bin is frequently absent. The bare
name does not resolve, the process never starts, and the host shows the agent zero redbar tools.

This is not a protocol bug. `handle` in `src/mcp.ts` answers `initialize` / `tools/list` /
`tools/call` correctly and is fully unit-tested. The bug is that the server is never launched.

**Documentation alone cannot fix it.** The correct launch command embeds an *absolute* path to
`dist/cli.js`, which differs per machine. Only redbar, running on that machine, knows where its own
entry point lives.

## The fix — one new command, registry-shaped

`redbar mcp-config [client]` prints the exact, PATH-proof registration for a client — or for every
client when none is named. It writes nothing (rule 6: redbar prints the command; the human runs it).

The launch it emits is fully absolute for both halves, so no `PATH` lookup can fail:

```
command = process.execPath                          # absolute node binary
args    = [ realpathSync(process.argv[1]), "mcp" ]  # absolute dist/cli.js, symlink resolved
```

`realpathSync` matters for the same reason it already matters in `cli.ts`'s `isMain` guard: under
`npm link`, `process.argv[1]` is the symlink; the host needs the real file.

### The client registry — `src/clients.ts`

One row per MCP client, same law as `src/languages.ts` and `src/agents.ts`: **adding a client is one
row of data.** No `switch (client)` anywhere. Each row renders the launch into that client's own
registration surface:

| client | surface | shape |
|---|---|---|
| `claude` | `claude mcp add redbar -- <cmd> <args>` | CLI, `--` separator |
| `codex`  | `codex mcp add redbar -- <cmd> <args>`  | CLI, `--` separator |
| `gemini` | `gemini mcp add redbar <cmd> <args>`    | CLI, no `--` |
| `copilot`| `copilot mcp add redbar -- <cmd> <args>`| CLI, `--` separator |
| `cursor` | `.cursor/mcp.json` — key `mcpServers`   | JSON |
| `vscode` | `.vscode/mcp.json` — key `servers`      | JSON |

(Exact `--` presence per CLI is verified against each tool's current docs, not assumed.)

The registry is the single source of truth. The README documents `redbar mcp-config <client>`
instead of hardcoding a per-machine path, and a test asserts the README cannot drift from the
registry or reintroduce the bare-`redbar` form that caused #13.

## What "runs end to end on the biggest LLMs" means here, testably

We cannot spawn Claude/Codex/Gemini live in CI (needs those CLIs + API keys, not reproducible). What
is reproducible and honest:

1. **Real transport E2E.** Spawn the actual `redbar mcp` process over stdio and drive the full
   JSON-RPC handshake: `initialize` → `tools/list` → `tools/call redbar_inspect`. Assert
   `serverInfo.name === "redbar"`, three tools, and real tool output. This proves the exact thing
   #13 broke — the server launches and answers — without a model.
2. **Per-client config resolves.** For every registry row, assert the emitted launch points at an
   **executable, existing** file (the real `dist/cli.js` / node), never a bare name.

## Tests

- `test/clients.test.ts` (pure): every row embeds the absolute paths, never bare `redbar`; unknown
  client errors like `agentById`; the JSON rows parse and use the right top-level key
  (`mcpServers` for cursor, `servers` for vscode); the `--`/no-`--` distinction per CLI.
- `test/mcp-e2e.test.ts`: spawn the real CLI, drive the handshake, assert the three-step exchange.
- `test/links.test.ts`: every internal-file and internal-anchor link in `README.md`,
  `README.en.md`, `docs/design.md` resolves; the README's MCP section names exactly the registry's
  clients and contains no bare-`redbar` `command`.

## Non-goals

- Writing into client config files (`~/.codex/config.toml`, `.cursor/mcp.json`). redbar prints;
  the human runs. Rule 6.
- Live model invocation in tests.
- Publishing to npm (separate track; the absolute-path launch works today, unpublished).
