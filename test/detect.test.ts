import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detect } from '../src/detect.js'

function repo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'redbar-'))
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content)
  return dir
}

describe('detect', () => {
  it('recognizes ts from package.json', () => {
    const lang = detect(repo({ 'package.json': '{}' }))
    expect(lang.id).toBe('ts')
    expect(lang.format).toBe('lcov')
  })

  it('recognizes rust from Cargo.toml', () => {
    expect(detect(repo({ 'Cargo.toml': '[package]' })).id).toBe('rust')
  })

  it('recognizes php from composer.json', () => {
    const lang = detect(repo({ 'composer.json': '{}' }))
    expect(lang.id).toBe('php')
    expect(lang.format).toBe('cobertura')
  })

  it('recognizes java from pom.xml', () => {
    expect(detect(repo({ 'pom.xml': '<project/>' })).id).toBe('java')
  })

  it('recognizes python from pyproject.toml', () => {
    expect(detect(repo({ 'pyproject.toml': '[project]' })).id).toBe('python')
  })

  it('polyglot repo: the specific language beats package.json', () => {
    // a Rust project that ships a frontend is still a Rust project
    expect(detect(repo({ 'Cargo.toml': '[package]', 'package.json': '{}' })).id).toBe('rust')
  })

  it('redbar.config.json overrides detection', () => {
    const dir = repo({
      'Cargo.toml': '[package]',
      'package.json': '{}',
      'redbar.config.json': '{"language":"ts"}',
    })
    expect(detect(dir).id).toBe('ts')
  })

  it('throws on an unknown id in the config', () => {
    const dir = repo({ 'package.json': '{}', 'redbar.config.json': '{"language":"cobol"}' })
    expect(() => detect(dir)).toThrow(/cobol/)
  })

  it('throws when nothing is recognized', () => {
    expect(() => detect(repo({ 'README.md': '# nothing' }))).toThrow(/no language recognized/)
  })
})
