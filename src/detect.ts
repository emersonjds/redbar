import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LANGUAGES, byId, type Language } from './languages.js'

export function detect(root: string): Language {
  const configPath = join(root, 'redbar.config.json')
  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as { language?: string }
    if (config.language) {
      const forced = byId(config.language)
      if (!forced) {
        throw new Error(
          `redbar: unknown language "${config.language}" in redbar.config.json. ` +
            `Available: ${LANGUAGES.map((l) => l.id).join(', ')}`,
        )
      }
      return forced
    }
  }

  // registry order: from the specific marker (Cargo.toml) to the generic one (package.json)
  for (const lang of LANGUAGES) {
    if (lang.markers.some((m) => existsSync(join(root, m)))) return lang
  }

  const markers = LANGUAGES.flatMap((l) => l.markers).join(', ')
  throw new Error(
    `redbar: no language recognized in ${root}. Markers looked for: ${markers}. ` +
      `Force it with redbar.config.json { "language": "ts" }`,
  )
}
