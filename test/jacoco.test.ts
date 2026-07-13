import { describe, expect, it } from 'vitest'
import { parseJacoco } from '../src/coverage/jacoco.js'

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<report name="fixture">
  <package name="com/example">
    <sourcefile name="Calc.java">
      <line nr="5" mi="0" ci="3" mb="0" cb="0"/>
      <line nr="6" mi="0" ci="2" mb="0" cb="0"/>
      <line nr="10" mi="4" ci="0" mb="0" cb="0"/>
      <line nr="11" mi="2" ci="0" mb="0" cb="0"/>
    </sourcefile>
    <sourcefile name="App.java">
      <line nr="8" mi="2" ci="1" mb="0" cb="0"/>
    </sourcefile>
  </package>
</report>
`

describe('parseJacoco', () => {
  it('builds the path as sourceRoot/package/sourcefile', () => {
    expect(parseJacoco(SAMPLE).get('src/main/java/com/example/Calc.java')).toEqual({
      file: 'src/main/java/com/example/Calc.java',
      covered: [5, 6],
      uncovered: [10, 11],
    })
  })

  it('covered means ci > 0, even when mi > 0', () => {
    expect(parseJacoco(SAMPLE).get('src/main/java/com/example/App.java')?.covered).toEqual([8])
  })

  it('accepts a custom source root', () => {
    expect(
      parseJacoco(SAMPLE, ['app/src/main/java']).has('app/src/main/java/com/example/Calc.java'),
    ).toBe(true)
  })

  it('returns an empty map for XML without a package', () => {
    expect(parseJacoco('<report/>').size).toBe(0)
  })
})
