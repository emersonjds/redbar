// Pure: manifest text in, a profile out. No disk, no process — the caller reads the manifest (the
// same text selectRunner already reads) and passes it here.
import type { TestKind } from './types.js'

/**
 * What shape of project is this? Read from the manifest, mechanically — no model decides it, a
 * regex does, and it answers the same way twice.
 *
 * `library` is the honest "no signal" default, not a claim that the code is literally a library. It
 * means no framework marker matched, so there is nothing true to say about where risk concentrates,
 * and the lens stays out of the way.
 */
export type Profile = 'frontend' | 'backend' | 'fullstack' | 'library'

// Registry data, not branching. A meta-framework is BOTH a UI and a server, so it is checked first
// and wins outright. Everything else is a plain marker list. Adding a framework is one line here.
const META = /"(next|nuxt|remix|@sveltejs\/kit)"|\bremix\b/
const FRONTEND = /"(react|react-dom|vue|@angular\/core|svelte|solid-js|preact)"|\bstreamlit\b/
const BACKEND =
  /"(express|fastify|@nestjs\/core|koa|@hapi\/hapi)"|spring-boot-starter-web|\b(fastapi|flask|django|laravel\/framework|actix-web|axum|gin-gonic)\b|"laravel\//

export function detectProfile(manifest: string): Profile {
  const meta = META.test(manifest)
  if (meta) return 'fullstack'

  const front = FRONTEND.test(manifest)
  const back = BACKEND.test(manifest)

  // a repo that ships a view framework AND a server framework is genuinely both — fullstack, so the
  // lens surfaces e2e and integration instead of silently dropping half the project
  if (front && back) return 'fullstack'
  if (front) return 'frontend'
  if (back) return 'backend'
  return 'library'
}

// The order in which KINDS of test carry the most value FOR THIS KIND OF PROJECT. A statement about
// project types, sitting beside the score — never inside it. Every list is a full permutation of
// the three kinds, so no gap is ever dropped from the lens.
const PRIORITY: Record<Profile, TestKind[]> = {
  frontend: ['e2e', 'integration', 'unit'],
  fullstack: ['e2e', 'integration', 'unit'],
  backend: ['integration', 'unit', 'e2e'],
  library: ['unit', 'integration', 'e2e'],
}

export function kindPriority(profile: Profile): TestKind[] {
  return PRIORITY[profile]
}

const LABEL: Record<Profile, string> = {
  frontend: 'a frontend project',
  backend: 'a backend project',
  fullstack: 'a fullstack project',
  library: 'no clear frontend/backend signal',
}

export function profileLabel(profile: Profile): string {
  return LABEL[profile]
}
