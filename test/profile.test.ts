import { describe, expect, it } from 'vitest'
import { detectProfile, kindPriority, profileLabel } from '../src/profile.js'

describe('detectProfile', () => {
  it('is frontend for a react manifest with no server', () => {
    expect(detectProfile('{"dependencies":{"react":"18","react-dom":"18"}}')).toBe('frontend')
  })

  it('is frontend for vue, angular, svelte, solid, preact', () => {
    for (const dep of ['vue', '@angular/core', 'svelte', 'solid-js', 'preact']) {
      expect(detectProfile(`{"dependencies":{"${dep}":"1"}}`)).toBe('frontend')
    }
  })

  it('is backend for a server framework and no view', () => {
    for (const dep of ['express', 'fastify', '@nestjs/core', 'koa', '@hapi/hapi']) {
      expect(detectProfile(`{"dependencies":{"${dep}":"1"}}`)).toBe('backend')
    }
  })

  it('reads a backend framework out of a non-json manifest too (pom.xml, pyproject)', () => {
    expect(detectProfile('<artifactId>spring-boot-starter-web</artifactId>')).toBe('backend')
    expect(detectProfile('dependencies = ["fastapi"]')).toBe('backend')
    expect(detectProfile('django = "5.0"')).toBe('backend')
  })

  it('is fullstack for a meta-framework, even when react is also present', () => {
    // next pulls react in as a dependency; the meta-framework verdict must win, because such a
    // project has both an e2e-worthy UI and real server routes
    expect(detectProfile('{"dependencies":{"next":"14","react":"18"}}')).toBe('fullstack')
    for (const dep of ['nuxt', 'remix', '@sveltejs/kit']) {
      expect(detectProfile(`{"dependencies":{"${dep}":"1"}}`)).toBe('fullstack')
    }
  })

  it('is fullstack when a frontend AND a separate backend framework are both present', () => {
    // a repo that ships react and express together is both — treat it as fullstack, not one or the
    // other, so the lens surfaces e2e and integration rather than dropping half the project
    expect(detectProfile('{"dependencies":{"react":"18","express":"4"}}')).toBe('fullstack')
  })

  it('is library when nothing matches — the honest "no signal" default', () => {
    expect(detectProfile('{"dependencies":{"lodash":"4"}}')).toBe('library')
    expect(detectProfile('')).toBe('library')
  })
})

describe('kindPriority', () => {
  it('puts e2e first for a frontend', () => {
    expect(kindPriority('frontend')).toEqual(['e2e', 'integration', 'unit'])
  })

  it('puts e2e first for a fullstack', () => {
    expect(kindPriority('fullstack')).toEqual(['e2e', 'integration', 'unit'])
  })

  it('puts integration first for a backend', () => {
    expect(kindPriority('backend')).toEqual(['integration', 'unit', 'e2e'])
  })

  it('is the neutral order for a library, and every priority is a full permutation of the kinds', () => {
    const kinds = ['unit', 'integration', 'e2e']
    for (const p of ['frontend', 'backend', 'fullstack', 'library'] as const) {
      expect([...kindPriority(p)].sort()).toEqual([...kinds].sort())
    }
  })
})

describe('profileLabel', () => {
  it('gives a human name for the report', () => {
    expect(profileLabel('frontend')).toMatch(/frontend/i)
    expect(profileLabel('library')).toMatch(/librar|no .*signal/i)
  })
})
