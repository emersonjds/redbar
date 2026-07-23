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
//
// Each argv MUST let the agent write files headlessly. In non-interactive mode every one of these
// CLIs denies a file write it cannot get a human to approve — so `-p <prompt>` alone runs the model,
// writes nothing, and execute records `no-output` for every gap. The tool looks broken on every LLM.
// The per-agent flag below is the auto-approve that unblocks writing in the cwd; the exact flag is
// each vendor's own (see docs). Write freedom is safe here because execute reverts anything the agent
// touches outside its one test file and deletes a test that asserts nothing. No model is forced —
// the agent runs on whatever the developer configured; redbar drives it, it does not re-tool it.
export const AGENTS: Agent[] = [
  { id: 'claude', bin: 'claude', args: (p) => ['-p', p, '--permission-mode', 'acceptEdits'] },
  { id: 'codex', bin: 'codex', args: (p) => ['exec', '--sandbox', 'workspace-write', p] },
  { id: 'copilot', bin: 'copilot', args: (p) => ['-p', p, '--allow-tool', 'write'] },
  { id: 'gemini', bin: 'gemini', args: (p) => ['-p', p, '--approval-mode', 'auto_edit'] },
  { id: 'cursor', bin: 'cursor-agent', args: (p) => ['-p', '-f', p] },
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
