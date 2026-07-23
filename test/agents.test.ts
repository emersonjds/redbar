import { describe, expect, it } from 'vitest'
import { agentById, AGENTS, detectAgent } from '../src/agents.js'

describe('detectAgent', () => {
  it('picks the first agent in the table that is on PATH', () => {
    const found = detectAgent((bin) => bin === 'codex')
    expect(found?.id).toBe('codex')
  })

  it('respects the table order when several are installed', () => {
    const found = detectAgent(() => true)
    expect(found?.id).toBe(AGENTS[0]!.id)
  })

  it('returns null when no agent is installed, rather than guessing at one', () => {
    expect(detectAgent(() => false)).toBeNull()
  })
})

describe('AGENTS', () => {
  it('every agent builds an argv that carries the prompt', () => {
    for (const agent of AGENTS) {
      expect(agent.args('WRITE THE TEST')).toContain('WRITE THE TEST')
    }
  })

  // The bug this encodes: in headless mode every one of these CLIs DENIES a file write it cannot get
  // a human to approve. Without the per-agent auto-approve flag the agent runs, writes nothing, and
  // execute records `no-output` for every gap — the tool looks broken on every LLM. Each argv must
  // carry the flag that lets its agent write in the cwd. (redbar reverts out-of-scope edits anyway.)
  it('every agent carries the flag that lets it write files headlessly', () => {
    const writePermission: Record<string, string[]> = {
      claude: ['--permission-mode', 'acceptEdits'],
      codex: ['--sandbox', 'workspace-write'],
      copilot: ['--allow-tool', 'write'],
      gemini: ['--approval-mode', 'auto_edit'],
      cursor: ['-f'],
    }
    for (const agent of AGENTS) {
      const argv = agent.args('P')
      const required = writePermission[agent.id]
      expect(required, `no write-permission flag defined for agent "${agent.id}"`).toBeDefined()
      for (const flag of required!) expect(argv).toContain(flag)
    }
  })

  it('every agent has a distinct id', () => {
    expect(new Set(AGENTS.map((a) => a.id)).size).toBe(AGENTS.length)
  })
})

describe('agentById', () => {
  it('finds an agent by id, for the --agent override', () => {
    expect(agentById('claude')?.bin).toBe('claude')
  })

  it('is null for an unknown id', () => {
    expect(agentById('nope')).toBeNull()
  })
})
