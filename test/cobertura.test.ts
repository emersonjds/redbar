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
})
