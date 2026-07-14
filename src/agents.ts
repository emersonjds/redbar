/**
 * The coding agents redbar knows how to drive, headless.
 *
 * A table, not a `switch` — same rule as `src/languages.ts`. Adding an agent is one row: the binary
 * and the argv that runs it once, non-interactively, on one prompt. If a branch on agent id ever
 * appears anywhere in this codebase, this design has failed.
 */
export type Agent = {
  id: string
  /** the binary, as it is looked up on PATH */
  bin: string
  /** argv for ONE headless, non-interactive run against one prompt */
  args: (prompt: string) => string[]
}

// ORDER MATTERS: detection returns the first one installed.
export const AGENTS: Agent[] = [
  { id: 'claude', bin: 'claude', args: (p) => ['-p', p] },
  { id: 'codex', bin: 'codex', args: (p) => ['exec', p] },
  { id: 'copilot', bin: 'copilot', args: (p) => ['-p', p] },
  { id: 'gemini', bin: 'gemini', args: (p) => ['-p', p] },
  { id: 'cursor', bin: 'cursor-agent', args: (p) => ['-p', p] },
]

export function agentById(id: string): Agent | null {
  return AGENTS.find((a) => a.id === id) ?? null
}

/**
 * The first agent on the table that is installed.
 *
 * `onPath` is injected so this stays pure and testable — cli.ts passes the real lookup. Returns
 * null rather than a default: spawning a binary the developer does not have produces a confusing
 * ENOENT, and guessing is precisely what this project does not do.
 */
export function detectAgent(onPath: (bin: string) => boolean): Agent | null {
  return AGENTS.find((agent) => onPath(agent.bin)) ?? null
}
