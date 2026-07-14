// Pure: string in, number out. No disk, no process.
import { stripNonCode } from './code.js'
import type { Language } from './languages.js'

/**
 * How many assertions the source makes.
 *
 * Runs over CODE only — `stripNonCode` removes comments, strings and regex literals, the same way
 * the branch counter does. A gate that `// expect(true)` can walk through is not a gate.
 *
 * ponytail: this counts assertions, it does not judge them. `expect(true).toBe(true)` scores 1 and
 * gets through. The honest answer to "is this assertion any good" is mutation testing, which costs
 * a mutation tool per language and breaks both zero-dependency and any-language. This catches the
 * failure mode that actually happens — the test that asserts NOTHING — and the ceiling is known.
 */
export function countAssertions(source: string, language: Language): number {
  const code = stripNonCode(source)

  return language.assertionPatterns.reduce((total, pattern) => {
    const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)
    return total + (code.match(global)?.length ?? 0)
  }, 0)
}
