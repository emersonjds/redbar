/**
 * MCP server, hand-written over stdio.
 *
 * The transport is newline-delimited JSON-RPC 2.0 on stdin/stdout — roughly 60 lines of it — so
 * the official SDK would be the first runtime dependency this project has ever had, in exchange
 * for code we can read in one sitting. The XML parsers here are hand-written for the same reason.
 * `dependencies` stays empty, and a security review of redbar stays a review of redbar.
 *
 * `handle` is pure: request in, response out, no disk and no process. That is what makes the
 * server testable — the whole protocol is exercised in test/mcp.test.ts with a fake ToolBox, and
 * nothing has to be spawned to know it works.
 */
import { createInterface } from 'node:readline'

// the MCP revision this speaks. Clients send their own in `initialize`; every current one accepts
// a server that answers with a version it knows.
const PROTOCOL_VERSION = '2025-06-18'

export type JsonRpcRequest = {
  jsonrpc: '2.0'
  /** absent = notification: it wants no reply, and sending one is a protocol violation */
  id?: number | string
  method: string
  params?: unknown
}

export type JsonRpcResponse = {
  jsonrpc: '2.0'
  id: number | string
  result?: unknown
  error?: { code: number; message: string }
}

export type ToolArgs = Record<string, unknown>
export type ToolBox = Record<string, (args: ToolArgs) => string>

const PATH_ARG = {
  path: { type: 'string', description: 'Repo path. Defaults to the current working directory.' },
  base: { type: 'string', description: 'Git ref to diff against. Defaults to the detected base branch.' },
}

/**
 * The three tools, in the order a developer meets them: what is missing, what do I do about it,
 * and prove the number is real.
 */
export const TOOLS = [
  {
    name: 'redbar_inspect',
    description:
      'Find the test-coverage gaps in what this branch changed. Crosses the project coverage ' +
      'report with `git diff` and ranks the untested symbols by criticality. No language model ' +
      'produces this list — it is a measurement, and it is the same twice.',
    inputSchema: { type: 'object', properties: { ...PATH_ARG } },
  },
  {
    name: 'redbar_briefing',
    description:
      'THE MAIN TOOL. Returns a complete testing brief in markdown: every untested symbol this ' +
      'branch changed, ranked, each with its layer (unit/integration/e2e) and the canonical ' +
      'standard to follow for that layer. Use it as the source of truth for writing the tests, ' +
      'and follow it top to bottom — the order is computed, not chosen. redbar also writes it to ' +
      "the project's .redbar/TESTING.md, so you do not need to save it.",
    inputSchema: { type: 'object', properties: { ...PATH_ARG } },
  },
  {
    name: 'redbar_explain',
    description:
      'Audit one gap: show exactly where its number came from — the coverage report line, the ' +
      'diff, the branch count and the score arithmetic. Use it when someone asks whether the ' +
      'number is real.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol name or file path to explain. Empty explains every gap.',
        },
        ...PATH_ARG,
      },
    },
  },
] as const

const ok = (id: number | string, result: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id, result })
const text = (body: string, isError = false) => ({ content: [{ type: 'text', text: body }], isError })

/** Pure JSON-RPC routing. Returns null for a notification, which by protocol gets no reply. */
export function handle(req: JsonRpcRequest, tools: ToolBox): JsonRpcResponse | null {
  if (req.id === undefined) return null

  switch (req.method) {
    case 'initialize':
      return ok(req.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'redbar', version: '0.1.1' },
      })

    case 'tools/list':
      return ok(req.id, { tools: TOOLS })

    case 'tools/call': {
      const params = (req.params ?? {}) as { name?: string; arguments?: ToolArgs }
      const tool = params.name ? tools[params.name] : undefined

      if (!tool) {
        return {
          jsonrpc: '2.0',
          id: req.id,
          error: { code: -32602, message: `unknown tool: ${params.name ?? '(none)'}` },
        }
      }

      try {
        return ok(req.id, text(tool(params.arguments ?? {})))
      } catch (err) {
        // isError, NOT a JSON-RPC error. The engine's messages are actionable ("run: npx vitest
        // run --coverage") and a protocol error never reaches the model — it reaches the client,
        // which shows the agent nothing. The agent has to READ this to fix it.
        return ok(req.id, text(err instanceof Error ? err.message : String(err), true))
      }
    }

    default:
      return {
        jsonrpc: '2.0',
        id: req.id,
        error: { code: -32601, message: `method not found: ${req.method}` },
      }
  }
}

/** The stdio transport: one JSON-RPC message per line, in and out. */
export function serve(tools: ToolBox): void {
  const rl = createInterface({ input: process.stdin })

  rl.on('line', (line) => {
    if (!line.trim()) return

    let req: JsonRpcRequest
    try {
      req = JSON.parse(line) as JsonRpcRequest
    } catch {
      // a malformed line is the client's bug and it has no id to answer to — staying alive and
      // silent beats killing the server the developer is mid-conversation with
      return
    }

    const res = handle(req, tools)
    if (res) process.stdout.write(`${JSON.stringify(res)}\n`)
  })
}
