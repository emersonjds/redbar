import { stripNonCode } from './code.js'
import type { TestKind } from './types.js'

// ponytail: a path + content heuristic, not a classifier. The cost of being wrong is a test
// of the wrong kind, not a broken test — and a model here would break the zero-LLM promise
// of inspect. Missing too many? Add a pattern to the lists below.
// Next.js app router: app/**/page.tsx, route.ts, layout.tsx — a bare `app/` is NOT a route.
// `app/` is the application package in Flask, FastAPI and Laravel, and matching it blindly
// misclassified every Python module under app/ as e2e.
const NEXT_ROUTE = /(^|\/)app\/.*\b(page|route|layout)\.[jt]sx?$/i
// universal route/controller directories, in any ecosystem
const E2E_PATH = /(^|\/)(pages|routes|controllers?)\//i
const E2E_CODE =
  /@RestController|@RequestMapping|@GetMapping|@PostMapping|#\[(get|post|put|delete)\(|Route::|app\.(get|post|put|delete)\(|router\.(get|post|put|delete)\(|@app\.route/
const IO_PATH = /(repository|dao|client|gateway|adapter|service)/i
const IO_CODE = /\b(sql|mongo|redis|axios|jdbc|psycopg|sqlx|pdo|prisma|knex)\b|fetch\(|https?:\/\//i

export function classify(file: string, source: string): TestKind {
  if (NEXT_ROUTE.test(file) || E2E_PATH.test(file) || E2E_CODE.test(source)) return 'e2e'
  if (IO_PATH.test(file) || IO_CODE.test(source)) return 'integration'
  return 'unit'
}

// \b keeps `notify` and `ifs` from counting as `if`.
// ponytail: the ternary `?` is deliberately NOT counted — in TS it also spells an optional type
// (`foo?: string`) and optional chaining, neither of which is a branch. A missed ternary costs
// less than a lie in the first row.
const BRANCH = /\b(if|for|while|case|catch|elif|switch)\b|&&|\|\|/g

/**
 * Branches within lines [start, end] — the criticality proxy. Counting, not opinion.
 * Runs over CODE only: a keyword inside a comment, a string or a regex literal is not a branch
 * (see stripNonCode for the remaining ceiling).
 */
export function countBranches(source: string, start: number, end: number): number {
  const body = stripNonCode(source)
    .split('\n')
    .slice(start - 1, end)
    .join('\n')
  return (body.match(BRANCH) ?? []).length
}
