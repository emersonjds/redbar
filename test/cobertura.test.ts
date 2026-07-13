import { describe, expect, it } from 'vitest'
import { parseCobertura } from '../src/coverage/cobertura.js'

const SAMPLE = `<?xml version="1.0" ?>
<coverage version="7.6.1">
  <sources><source>/home/user/proj</source></sources>
  <packages>
    <package name="app">
      <classes>
        <class filename="app/calc.py" name="calc.py">
          <lines>
            <line number="1" hits="1"/>
            <line number="4" hits="1"/>
            <line number="8" hits="0"/>
            <line number="9" hits="0"/>
          </lines>
        </class>
        <class filename="app/util.py" name="util.py">
          <lines><line number="2" hits="0"/></lines>
        </class>
      </classes>
    </package>
  </packages>
</coverage>
`

describe('parseCobertura', () => {
  it('uses the filename attribute as the path', () => {
    expect(parseCobertura(SAMPLE).get('app/calc.py')).toEqual({
      file: 'app/calc.py',
      covered: [1, 4],
      uncovered: [8, 9],
    })
  })

  it('a file with no covered line comes back fully uncovered', () => {
    expect(parseCobertura(SAMPLE).get('app/util.py')).toEqual({
      file: 'app/util.py',
      covered: [],
      uncovered: [2],
    })
  })

  it('returns an empty map for XML without a class', () => {
    expect(parseCobertura('<coverage/>').size).toBe(0)
  })

  // a file legitimately appears in more than one <class>: PHP class + trait, coverlet's
  // <>c__DisplayClass. Overwriting instead of merging loses covered AND uncovered lines.
  it('merges the blocks when one file appears in several classes', () => {
    const xml = `<coverage>
      <class filename="src/Calc.php" name="Calc">
        <lines><line number="5" hits="1"/><line number="6" hits="1"/></lines>
      </class>
      <class filename="src/Calc.php" name="Calc_trait">
        <lines><line number="20" hits="0"/><line number="21" hits="0"/></lines>
      </class>
    </coverage>`
    expect(parseCobertura(xml).get('src/Calc.php')).toEqual({
      file: 'src/Calc.php',
      covered: [5, 6],
      uncovered: [20, 21],
    })
  })

  it('a line covered in any block is covered — never in both lists', () => {
    const xml = `<coverage>
      <class filename="src/Calc.php"><lines><line number="5" hits="0"/></lines></class>
      <class filename="src/Calc.php"><lines><line number="5" hits="3"/></lines></class>
    </coverage>`
    expect(parseCobertura(xml).get('src/Calc.php')).toEqual({
      file: 'src/Calc.php',
      covered: [5],
      uncovered: [],
    })
  })

  // XML attribute order is not guaranteed by any writer
  it('reads number and hits in either attribute order', () => {
    const xml = `<coverage>
      <class filename="a.py"><lines><line hits="0" number="9"/></lines></class>
    </coverage>`
    expect(parseCobertura(xml).get('a.py')).toEqual({ file: 'a.py', covered: [], uncovered: [9] })
  })
})
