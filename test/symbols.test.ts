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
      { name: 'add', start: 3, end: 5 },
      { name: 'divide', start: 7, end: 10 },
    ])
  })

  // the last symbol used to end at EOF and swallow every trailing line — a big data table after
  // the last function had its branches billed to that function
  it('the last symbol does not swallow the trailing code after it', () => {
    const trailing = [
      'export function add(a: number, b: number) {', // 1
      '  return a + b', //                              2
      '}', //                                           3
      '', //                                            4
      'const TABLE = {', //                             5
      '  a: /^if\\s+for\\s+while/,', //                 6
      '  b: 2,', //                                     7
      '}', //                                           8
    ].join('\n')
    expect(extractSymbols(trailing, ts)).toEqual([{ name: 'add', start: 1, end: 3 }])
  })

  it('does not invent a symbol out of a commented-out declaration', () => {
    expect(extractSymbols('// export function ghost() {}\nconst x = 1', ts)).toEqual([])
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

  // no braces to count: the block ends where the indentation drops back to the def's own level
  it('an indented block ends where the indentation drops back', () => {
    const withTable = ['def add(a, b):', '    return a + b', '', 'TABLE = {', '    "x": 1,', '}'].join(
      '\n',
    )
    expect(extractSymbols(withTable, python)).toEqual([{ name: 'add', start: 1, end: 2 }])
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

  it('two impl blocks of the same type are two symbols with their own spans', () => {
    const impls = [
      'pub struct Foo;', //                    1
      'impl Foo {', //                         2
      '    pub fn a(&self) {}', //             3
      '}', //                                  4
      'impl Foo {', //                         5
      '    pub fn b(&self) -> i32 {', //       6
      '        if true { 1 } else { 0 }', //   7
      '    }', //                              8
      '}', //                                  9
    ].join('\n')
    const spans = extractSymbols(impls, rust)
      .filter((s) => s.name === 'Foo')
      .map((s) => [s.start, s.end])
    expect(spans).toEqual([
      [1, 1],
      [2, 4],
      [5, 9],
    ])
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
