import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * "os links funcionem corretamente" — no dead link ships. And a second, sharper guard: the README's
 * MCP section cannot drift back into the fragile forms that caused #13 (a bare `redbar` binary, or
 * `copilot mcp add`, which does not exist). A doc that tells people to run a command that fails is a
 * dead link with extra steps.
 */
const root = fileURLToPath(new URL('..', import.meta.url))
const docs = ['README.md', 'README.en.md', 'docs/design.md']

/** GitHub's heading slug: lowercase, drop punctuation, spaces→hyphens, keep unicode letters/accents */
const slug = (heading: string): string =>
  heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')

type Link = { doc: string; target: string }

/** every markdown link and html image target in a doc: [text](target), src="...", srcset="..." */
function linksIn(doc: string): Link[] {
  const body = readFileSync(join(root, doc), 'utf8')
  const targets = [
    ...body.matchAll(/\]\(([^)]+)\)/g),
    ...body.matchAll(/(?:src|srcset)="([^"]+)"/g),
  ].map((m) => m[1]!.split(' ')[0]!) // srcset may carry a descriptor; take the URL
  return targets.map((target) => ({ doc, target }))
}

function headingSlugs(doc: string): Set<string> {
  const body = readFileSync(join(root, doc), 'utf8')
  return new Set(
    [...body.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((m) => slug(m[1]!)),
  )
}

const all = docs.flatMap(linksIn)
const internalFile = all.filter((l) => !/^https?:/.test(l.target) && !l.target.startsWith('#'))
const anchors = all.filter((l) => l.target.startsWith('#'))

describe('internal file links resolve', () => {
  it.each(internalFile)('$doc → $target exists', ({ doc, target }) => {
    const path = resolve(dirname(join(root, doc)), target.split('#')[0]!)
    expect(existsSync(path), `${doc} links to missing ${target}`).toBe(true)
  })
})

describe('in-page anchors resolve to a real heading', () => {
  it.each(anchors)('$doc → $target', ({ doc, target }) => {
    expect(headingSlugs(doc).has(target.slice(1)), `${doc} anchor ${target} has no heading`).toBe(true)
  })
})

describe('the MCP section cannot regress to the forms that caused #13', () => {
  for (const doc of ['README.md', 'README.en.md']) {
    const body = () => readFileSync(join(root, doc), 'utf8')

    it(`${doc} points to redbar mcp-config, the PATH-proof entry point`, () => {
      expect(body()).toContain('redbar mcp-config')
    })

    it(`${doc} no longer registers a bare "redbar" binary — that is what hid the server`, () => {
      expect(body()).not.toMatch(/"command":\s*"redbar"/)
      expect(body()).not.toMatch(/--\s*redbar\s+mcp/)
    })

    it(`${doc} does not tell people to run "copilot mcp add" — that command does not exist`, () => {
      expect(body()).not.toMatch(/copilot\s+mcp\s+add/)
    })
  }
})
