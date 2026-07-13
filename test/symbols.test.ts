import { describe, expect, it } from 'vitest'
import { byId } from '../src/languages.js'
import { extractSymbols, symbolAt } from '../src/symbols.js'

const ts = byId('ts')!
const java = byId('java')!
const python = byId('python')!
const rust = byId('rust')!
const php = byId('php')!

describe('extractSymbols ts', () => {
  const src = [
    'import { x } from "./x.js"',          // 1
    '',                                     // 2
    'export function add(a, b) {',          // 3
    '  return a + b',                       // 4
    '}',                                    // 5
    '',                                     // 6
    'export const divide = (a, b) => {',    // 7
    '  if (b === 0) throw new Error()',     // 8
    '  return a / b',                       // 9
    '}',                                    // 10
  ].join('\n')

  it('finds exported functions and consts with their ranges', () => {
    expect(extractSymbols(src, ts)).toEqual([
      { name: 'add', start: 3, end: 6 },
      { name: 'divide', start: 7, end: 10 },
    ])
  })

  it('maps a line to the symbol containing it', () => {
    const symbols = extractSymbols(src, ts)
    expect(symbolAt(symbols, 8)?.name).toBe('divide')
    expect(symbolAt(symbols, 4)?.name).toBe('add')
    expect(symbolAt(symbols, 1)).toBeNull()
  })
})

describe('extractSymbols java', () => {
  const src = [
    'package com.example;',                 // 1
    '',                                     // 2
    'public class Calc {',                  // 3
    '  public int add(int a, int b) {',     // 4
    '    return a + b;',                    // 5
    '  }',                                  // 6
    '  public int divide(int a, int b) {',  // 7
    '    return a / b;',                    // 8
    '  }',                                  // 9
    '}',                                    // 10
  ].join('\n')

  it('the innermost method beats the class enclosing it', () => {
    const symbols = extractSymbols(src, java)
    expect(symbols.map((s) => s.name)).toEqual(['Calc', 'add', 'divide'])
    expect(symbolAt(symbols, 8)?.name).toBe('divide')
  })
})

describe('extractSymbols python', () => {
  const src = ['def add(a, b):', '    return a + b', '', 'def divide(a, b):', '    return a / b'].join(
    '\n',
  )

  it('finds top-level defs', () => {
    expect(symbolAt(extractSymbols(src, python), 5)?.name).toBe('divide')
  })
})

describe('extractSymbols rust', () => {
  const src = [
    'pub fn add(a: i32, b: i32) -> i32 {',    // 1
    '    a + b',                               // 2
    '}',                                       // 3
    '',                                        // 4
    'pub fn divide(a: i32, b: i32) -> i32 {',  // 5
    '    if b == 0 { panic!() }',              // 6
    '    a / b',                               // 7
    '}',                                       // 8
  ].join('\n')

  it('finds public fns', () => {
    expect(symbolAt(extractSymbols(src, rust), 6)?.name).toBe('divide')
  })
})

describe('extractSymbols php', () => {
  const src = [
    '<?php',                                   // 1
    'class Calc {',                            // 2
    '    public function add($a, $b) {',       // 3
    '        return $a + $b;',                 // 4
    '    }',                                   // 5
    '    public function divide($a, $b) {',    // 6
    '        return $a / $b;',                 // 7
    '    }',                                   // 8
    '}',                                       // 9
  ].join('\n')

  it('finds public methods', () => {
    expect(symbolAt(extractSymbols(src, php), 7)?.name).toBe('divide')
  })
})
