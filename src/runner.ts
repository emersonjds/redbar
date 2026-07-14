import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { E2eTool, Language, Runner } from './languages.js'

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

export function readManifest(root: string, lang: Language): string {
  return lang.markers
    .map((m) => join(root, m))
    .filter((p) => existsSync(p))
    .map((p) => readFileSync(p, 'utf8'))
    .join('\n')
}

/**
 * Which e2e tool does this project actually use? Same rule as selectRunner: read the manifest,
 * first-match-wins, fall back to the last entry (the default). A project on Cypress must not be
 * handed the Playwright convention — that is a test written to the wrong tool's idiom, the exact
 * drift redbar exists to kill.
 */
export function selectE2eTool(root: string, lang: Language): E2eTool {
  const manifest = readManifest(root, lang)
  const found = lang.e2eTools.find((t) => t.detect.test(manifest))
  return found ?? lang.e2eTools[lang.e2eTools.length - 1]!
}
