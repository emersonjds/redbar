import { type ChildProcessByStdio, spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { JsonRpcResponse } from '../src/mcp.js'

/**
 * The end-to-end test #13 was missing: not `handle` in isolation (that is mcp.test.ts), but the
 * REAL server — spawned as its own process, driven over stdio, exactly as Claude/Codex/Cursor drive
 * it. This proves the thing that broke: the process starts and answers. No model, no API key.
 *
 * Spawned through tsx so no build step is required; the transport, the routing and the tool
 * dispatch are all the production path.
 */
const cliPath = fileURLToPath(new URL('../src/cli.ts', import.meta.url))
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

describe('redbar mcp — real server over stdio', () => {
  let proc: ChildProcessByStdio<Writable, Readable, null>
  const pending = new Map<number, (res: JsonRpcResponse) => void>()

  const send = (id: number, method: string, params?: unknown): Promise<JsonRpcResponse> => {
    const reply = new Promise<JsonRpcResponse>((resolve) => pending.set(id, resolve))
    proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    return reply
  }

  beforeAll(() => {
    proc = spawn(process.execPath, ['--import', 'tsx', cliPath, 'mcp'], {
      cwd: repoRoot,
      stdio: ['pipe', 'pipe', 'inherit'],
    })

    createInterface({ input: proc.stdout }).on('line', (line) => {
      if (!line.trim()) return
      const res = JSON.parse(line) as JsonRpcResponse
      pending.get(res.id as number)?.(res)
    })
  })

  afterAll(() => proc.kill())

  it('answers initialize with its own serverInfo — the handshake #13 never reached', async () => {
    const res = await send(1, 'initialize')
    expect(res.result).toMatchObject({
      protocolVersion: expect.any(String),
      serverInfo: { name: 'redbar' },
    })
  })

  it('lists the three tools an agent can call', async () => {
    const res = await send(2, 'tools/list')
    const names = (res.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name).sort()
    expect(names).toEqual(['redbar_briefing', 'redbar_explain', 'redbar_inspect'])
  })

  it('runs redbar_inspect on redbar itself and returns real measured text', async () => {
    const res = await send(3, 'tools/call', { name: 'redbar_inspect', arguments: { path: repoRoot } })
    const content = (res.result as { content: Array<{ text: string }> }).content
    // the inspect report always names the detected language — proof the engine actually ran
    expect(content[0]!.text).toMatch(/language:/i)
  }, 60_000)
})
