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
