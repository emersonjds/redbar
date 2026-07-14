import { describe, expect, it } from 'vitest'
import { handle, TOOLS, type ToolBox } from '../src/mcp.js'

const tools: ToolBox = {
  redbar_inspect: () => 'INSPECT OUTPUT',
  redbar_briefing: () => 'BRIEFING OUTPUT',
  redbar_explain: (args) => `EXPLAIN ${String(args.symbol)}`,
}

const call = (method: string, params?: unknown, id: number | string = 1) =>
  handle({ jsonrpc: '2.0', id, method, params }, tools)

describe('handle — initialize', () => {
  it('answers with the protocol version and declares the tools capability', () => {
    const res = call('initialize')

    expect(res?.result).toMatchObject({
      protocolVersion: expect.any(String),
      capabilities: { tools: {} },
      serverInfo: { name: 'redbar' },
    })
  })

  it('returns nothing for a notification — a notification has no id and wants no reply', () => {
    expect(handle({ jsonrpc: '2.0', method: 'notifications/initialized' }, tools)).toBeNull()
  })
})

describe('handle — tools/list', () => {
  it('lists every tool with a schema, so the agent knows how to call it without guessing', () => {
    const res = call('tools/list')
    const listed = (res?.result as { tools: Array<{ name: string; inputSchema: unknown }> }).tools

    expect(listed.map((t) => t.name).sort()).toEqual([
      'redbar_briefing',
      'redbar_explain',
      'redbar_inspect',
    ])
    for (const tool of listed) expect(tool.inputSchema).toBeTruthy()
  })

  it('every declared tool has an implementation — a listed tool that cannot be called is a lie', () => {
    for (const tool of TOOLS) expect(Object.keys(tools)).toContain(tool.name)
  })
})

describe('handle — tools/call', () => {
  it('runs the tool and returns its text', () => {
    const res = call('tools/call', { name: 'redbar_briefing', arguments: {} })

    expect(res?.result).toMatchObject({
      content: [{ type: 'text', text: 'BRIEFING OUTPUT' }],
    })
  })

  it('passes the arguments through to the tool', () => {
    const res = call('tools/call', { name: 'redbar_explain', arguments: { symbol: 'Checkout' } })
    const content = (res?.result as { content: Array<{ text: string }> }).content

    expect(content[0]!.text).toBe('EXPLAIN Checkout')
  })

  it('reports an unknown tool as an error instead of silently returning nothing', () => {
    const res = call('tools/call', { name: 'redbar_nope', arguments: {} })
    expect(res?.error).toBeTruthy()
  })

  it('turns a thrown engine error into a tool error the agent can read and act on', () => {
    const failing: ToolBox = {
      ...tools,
      redbar_briefing: () => {
        throw new Error('redbar: coverage report not found. Run: npx vitest run --coverage')
      },
    }
    const res = handle(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'redbar_briefing', arguments: {} } },
      failing,
    )
    const result = res?.result as { isError: boolean; content: Array<{ text: string }> }

    // isError, NOT a JSON-RPC error: the agent must SEE the message (it contains the exact
    // command that fixes it), and a protocol-level error is not shown to the model
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toContain('coverage report not found')
  })
})

describe('handle — protocol', () => {
  it('answers an unknown method with -32601, as JSON-RPC requires', () => {
    expect(call('does/not/exist')?.error?.code).toBe(-32601)
  })

  it('echoes the request id back, so the client can match the reply to its call', () => {
    expect(call('initialize', undefined, 'abc-123')?.id).toBe('abc-123')
  })
})
