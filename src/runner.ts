import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Language, Runner } from './languages.js'

/**
 * Which runner does this project actually use?
 *
 * One language, several runners: jest or vitest, maven or gradle. They share nothing — not the
 * command, not the report path. Assuming one of them is how redbar told a React Native repo to
 * run `vitest` when it uses jest, printing a command that could never produce the report redbar
 * was waiting for.
 *
 * The manifest is whatever `markers` the language declared (package.json, pom.xml, …), read as
 * text. No per-language logic here — each runner brings its own `detect` regex as registry data.
 */
export function selectRunner(root: string, lang: Language): Runner {
  const manifest = readManifest(root, lang)
  const found = lang.runners.find((r) => r.detect.test(manifest))

  // ponytail: fall back to the first runner rather than throwing. A project with no runner in
  // its manifest has no tests at all — which is a gap, not an error, and `init` is what
  // proposes the libraries to fix it.
  return found ?? lang.runners[0]!
}

function readManifest(root: string, lang: Language): string {
  return lang.markers
    .map((m) => join(root, m))
    .filter((p) => existsSync(p))
    .map((p) => readFileSync(p, 'utf8'))
    .join('\n')
}
