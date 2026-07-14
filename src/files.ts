import { readdirSync } from 'node:fs'
import { relative } from 'node:path'
import type { Language } from './languages.js'

// Directories that are never product code and are enormous. Walking them is the difference between
// a scan that takes a second and one the developer kills.
const SKIP = new Set([
  'node_modules',
  'dist',
  'build',
  'target',
  'vendor',
  'coverage',
  'venv',
  '__pycache__',
  'out',
  'bin',
  'obj',
])

/** Every file in the repo, repo-relative with `/` separators. Dot-directories are skipped. */
export function* walk(root: string): Generator<string> {
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue

    const dir = relative(root, entry.parentPath).split(/[\\/]/).filter(Boolean)
    if (dir.some((d) => SKIP.has(d) || d.startsWith('.'))) continue

    yield [...dir, entry.name].join('/')
  }
}

/** Product code: a source extension for this language, and not a test/spec/fixture. */
export function isProductFile(file: string, language: Language): boolean {
  if (language.testFilePattern.test(file)) return false
  return language.sourceExtensions.some((ext) => file.endsWith(ext))
}

/**
 * Does this project have any test at all?
 *
 * The difference matters, and conflating the two is how a tool ends up shouting the wrong advice:
 * a project WITH tests and no coverage report needs a command run. A project with NO tests needs a
 * human decision about libraries, and running the suite would produce an empty report and a
 * confident "no gaps" — the worst possible answer.
 */
export function hasTests(root: string, language: Language): boolean {
  for (const file of walk(root)) {
    if (language.testFilePattern.test(file)) return true
  }
  return false
}
