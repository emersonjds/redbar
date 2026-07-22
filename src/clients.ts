/**
 * The MCP clients redbar knows how to be registered into.
 *
 * A table, not a `switch` — same rule as `src/languages.ts` and `src/agents.ts`. Adding a client is
 * one row: how to turn an absolute launch command into that client's own paste-ready registration.
 * If a branch on client id ever appears outside this file, the design has failed.
 *
 * This exists because of issue #13: every documented registration used a bare `command: "redbar"`,
 * and an MCP host spawns the server with a sanitized PATH where npm's global-bin (where `npm link`
 * put the symlink) is frequently absent. The binary never resolves, the server never starts, the
 * agent sees no tools. The fix is to register an ABSOLUTE launch — absolute node, absolute cli.js —
 * so no PATH lookup can fail on either half. Only redbar, running on the machine, knows those paths.
 */

/** binary + args, both absolute, that start the redbar MCP server over stdio */
export type Launch = { command: string; args: string[] }

export type McpClient = {
  id: string
  /** what the developer sees: the client's name and where the registration lands */
  label: string
  /** the paste-ready registration for this client, rendered from an absolute launch */
  render: (launch: Launch) => string
}

/**
 * The PATH-proof launch. `command` is the absolute node binary (process.execPath), `args` is the
 * absolute cli.js followed by `mcp`. Both are passed in so this stays pure and testable — cli.ts
 * supplies the real paths, resolving the npm-link symlink first (see cli.ts `isMain`).
 */
export function launch(cliPath: string, nodePath: string): Launch {
  return { command: nodePath, args: [cliPath, 'mcp'] }
}

/** `<cli> mcp add redbar [--] <command> <args...>` — the `--` stops the client parsing our flags. */
const addCommand = (cli: string, sep: boolean) => (l: Launch): string =>
  [`${cli} mcp add redbar`, sep ? '--' : null, l.command, ...l.args]
    .filter((part): part is string => part !== null)
    .join(' ')

/** a stdio server entry as the JSON clients expect it; some want an explicit `type`, some infer it */
const stdioEntry = (l: Launch, withType: boolean) => ({
  ...(withType ? { type: 'stdio' } : {}),
  command: l.command,
  args: l.args,
})

/** `{ "<key>": { "redbar": { ... } } }` — cursor/vscode/copilot all take a JSON file, differing
 *  only in the top-level key (`mcpServers` vs `servers`) and whether `type` is required. */
const jsonConfig = (key: string, withType: boolean) => (l: Launch): string =>
  JSON.stringify({ [key]: { redbar: stdioEntry(l, withType) } }, null, 2)

// ORDER MATTERS: `mcp-config` with no client prints them in this order.
// Syntax per each tool's current docs (2026-07): claude & codex require `--`; gemini takes bare
// positionals; copilot has NO `mcp add` on the terminal (JSON file only); vscode's key is `servers`.
export const CLIENTS: McpClient[] = [
  { id: 'claude', label: 'Claude Code', render: addCommand('claude', true) },
  { id: 'codex', label: 'Codex', render: addCommand('codex', true) },
  { id: 'gemini', label: 'Gemini CLI', render: addCommand('gemini', false) },
  { id: 'copilot', label: 'Copilot CLI (~/.copilot/mcp-config.json)', render: jsonConfig('mcpServers', true) },
  { id: 'cursor', label: 'Cursor (.cursor/mcp.json)', render: jsonConfig('mcpServers', false) },
  { id: 'vscode', label: 'VS Code (.vscode/mcp.json)', render: jsonConfig('servers', true) },
]

export function clientById(id: string): McpClient | null {
  return CLIENTS.find((c) => c.id === id) ?? null
}
