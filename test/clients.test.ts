import { describe, expect, it } from 'vitest'
import { CLIENTS, clientById, launch, type Launch } from '../src/clients.js'

// an absolute launch, as cli.ts builds it: absolute node, absolute cli.js, then `mcp`
const abs: Launch = { command: '/usr/bin/node', args: ['/opt/redbar/dist/cli.js', 'mcp'] }

describe('launch', () => {
  it('is the mcp server started by absolute node + absolute cli.js — no bare names, no PATH lookup', () => {
    expect(launch('/opt/redbar/dist/cli.js', '/usr/bin/node')).toEqual({
      command: '/usr/bin/node',
      args: ['/opt/redbar/dist/cli.js', 'mcp'],
    })
  })
})

describe('CLIENTS registry — the fix for #13', () => {
  it('never emits a bare `redbar` binary — that is exactly the PATH failure that hid the server', () => {
    for (const client of CLIENTS) {
      const out = client.render(abs)
      // the launch must be fully absolute; a bare `redbar` or bare `node` is what broke discovery
      expect(out).toContain('/opt/redbar/dist/cli.js')
      expect(out).toContain('/usr/bin/node')
      expect(out).not.toMatch(/\bcommand"?\s*[:=]\s*"?redbar\b/)
    }
  })

  it('covers the six clients a developer actually uses, in a stable order', () => {
    expect(CLIENTS.map((c) => c.id)).toEqual([
      'claude',
      'codex',
      'gemini',
      'copilot',
      'cursor',
      'vscode',
    ])
  })
})

describe('CLI-registered clients', () => {
  it('claude and codex require the `--` separator before the launch command', () => {
    expect(clientById('claude')!.render(abs)).toBe(
      'claude mcp add redbar -- /usr/bin/node /opt/redbar/dist/cli.js mcp',
    )
    expect(clientById('codex')!.render(abs)).toBe(
      'codex mcp add redbar -- /usr/bin/node /opt/redbar/dist/cli.js mcp',
    )
  })

  it('gemini takes bare positionals — a `--` there would be parsed as an argument', () => {
    const out = clientById('gemini')!.render(abs)
    expect(out).toBe('gemini mcp add redbar /usr/bin/node /opt/redbar/dist/cli.js mcp')
    expect(out).not.toContain(' -- ')
  })
})

describe('JSON-registered clients', () => {
  const parse = (id: string) => JSON.parse(clientById(id)!.render(abs)) as Record<string, unknown>

  it('cursor writes valid JSON under `mcpServers` with the absolute launch', () => {
    expect(parse('cursor')).toEqual({
      mcpServers: { redbar: { command: '/usr/bin/node', args: ['/opt/redbar/dist/cli.js', 'mcp'] } },
    })
  })

  it('vscode uses the `servers` key — not `mcpServers` — and declares the stdio type', () => {
    const cfg = parse('vscode') as { servers: { redbar: { type: string } } }
    expect(cfg.servers.redbar).toMatchObject({
      type: 'stdio',
      command: '/usr/bin/node',
      args: ['/opt/redbar/dist/cli.js', 'mcp'],
    })
    expect(cfg).not.toHaveProperty('mcpServers')
  })

  it('copilot writes a stdio entry under mcpServers — it has no `mcp add` on the terminal', () => {
    const cfg = parse('copilot') as { mcpServers: { redbar: { type: string } } }
    expect(cfg.mcpServers.redbar.type).toBe('stdio')
  })
})

describe('clientById', () => {
  it('returns null for an unknown client instead of guessing one', () => {
    expect(clientById('windsurf')).toBeNull()
  })
})
